import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as os from 'os';
import * as crypto from 'crypto';
import { Flow } from '../entities/flow.entity';
import { ExecutionService } from '../execution/execution.service';

export const SCHEDULER_LEADER_KEY = 'etl:scheduler:leader';
export const SCHEDULER_LEADER_TIMEOUT = 30000;
export const SCHEDULER_LEADER_RENEW_INTERVAL = 10000;

@Injectable()
export class EtlSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EtlSchedulerService.name);
  private readonly instanceId = `${os.hostname()}-${crypto.randomBytes(4).toString('hex')}`;
  
  private activeJobs = new Map<string, string>();
  private isLeader = false;
  private leaderRenewTimer: NodeJS.Timeout | null = null;
  private leaderCheckTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Flow)
    private flowRepository: Repository<Flow>,
    private schedulerRegistry: SchedulerRegistry,
    private executionService: ExecutionService,
    @InjectQueue('etl_queue') private queue: Queue,
  ) {}

  private getRedisClient() {
    return (this.queue as any).client;
  }

  async onModuleInit() {
    this.logger.log(`Initializing ETL scheduler (instance: ${this.instanceId})...`);
    await this.tryBecomeLeader();
    this.startLeaderElection();
  }

  onModuleDestroy() {
    this.logger.log('Shutting down ETL scheduler...');
    
    if (this.leaderRenewTimer) {
      clearInterval(this.leaderRenewTimer);
    }
    if (this.leaderCheckTimer) {
      clearInterval(this.leaderCheckTimer);
    }

    for (const [flowId, jobName] of this.activeJobs.entries()) {
      this.removeJob(jobName);
    }

    if (this.isLeader) {
      this.releaseLeaderShip().catch(() => {});
    }
  }

  private async tryBecomeLeader(): Promise<boolean> {
    const redis = this.getRedisClient();

    try {
      const result = await redis.set(
        SCHEDULER_LEADER_KEY,
        this.instanceId,
        'NX',
        'PX',
        SCHEDULER_LEADER_TIMEOUT,
      );

      if (result === 'OK') {
        await this.becomeLeader();
        return true;
      }

      await this.becomeFollower();
      return false;
    } catch (error) {
      this.logger.warn(`Failed to acquire leader lock: ${error.message}`);
      this.isLeader = false;
      return false;
    }
  }

  private async becomeLeader() {
    if (this.isLeader) return;

    this.isLeader = true;
    this.logger.log(`Instance ${this.instanceId} became scheduler leader`);

    await this.loadScheduledFlows();

    this.leaderRenewTimer = setInterval(async () => {
      await this.renewLeadership();
    }, SCHEDULER_LEADER_RENEW_INTERVAL);
  }

  private async becomeFollower() {
    if (!this.isLeader) return;

    this.isLeader = false;
    this.logger.log(`Instance ${this.instanceId} became scheduler follower`);

    for (const [flowId, jobName] of this.activeJobs.entries()) {
      this.removeJob(jobName);
    }
    this.activeJobs.clear();

    if (this.leaderRenewTimer) {
      clearInterval(this.leaderRenewTimer);
      this.leaderRenewTimer = null;
    }
  }

  private async renewLeadership() {
    const redis = this.getRedisClient();

    try {
      const currentLeader = await redis.get(SCHEDULER_LEADER_KEY);
      
      if (currentLeader === this.instanceId) {
        await redis.pexpire(SCHEDULER_LEADER_KEY, SCHEDULER_LEADER_TIMEOUT);
        this.logger.debug(`Renewed leadership for ${this.instanceId}`);
      } else {
        this.logger.warn(`Lost leadership, current leader is ${currentLeader}`);
        await this.becomeFollower();
      }
    } catch (error) {
      this.logger.error(`Failed to renew leadership: ${error.message}`);
    }
  }

  private async releaseLeaderShip() {
    const redis = this.getRedisClient();

    try {
      const currentLeader = await redis.get(SCHEDULER_LEADER_KEY);
      if (currentLeader === this.instanceId) {
        await redis.del(SCHEDULER_LEADER_KEY);
        this.logger.log(`Released leadership for ${this.instanceId}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to release leadership: ${error.message}`);
    }
  }

  private startLeaderElection() {
    this.leaderCheckTimer = setInterval(async () => {
      if (!this.isLeader) {
        await this.tryBecomeLeader();
      }
    }, SCHEDULER_LEADER_RENEW_INTERVAL);
  }

  private async loadScheduledFlows() {
    if (!this.isLeader) {
      this.logger.debug('Not leader, skipping schedule loading');
      return;
    }

    const scheduledFlows = await this.flowRepository.find({
      where: { isScheduled: true, status: 'published' },
    });

    for (const flow of scheduledFlows) {
      if (flow.cronExpression) {
        await this.scheduleFlowInternal(flow.id, flow.cronExpression);
      }
    }

    this.logger.log(`Loaded ${scheduledFlows.length} scheduled flows`);
  }

  private async scheduleFlowInternal(flowId: string, cronExpression: string): Promise<void> {
    const jobName = `etl-flow-${flowId}`;

    if (this.activeJobs.has(flowId)) {
      this.removeJob(this.activeJobs.get(flowId)!);
    }

    const job = new CronJob(cronExpression, async () => {
      if (!this.isLeader) {
        this.logger.debug(`Not leader, skipping execution of flow ${flowId}`);
        return;
      }

      const lockKey = `scheduled-execution:${flowId}`;
      const lockAcquired = await this.acquireExecutionLock(flowId, lockKey);

      if (!lockAcquired) {
        this.logger.debug(`Could not acquire lock for flow ${flowId}, another instance is running`);
        return;
      }

      try {
        this.logger.log(`Leader ${this.instanceId} executing scheduled flow: ${flowId}`);
        await this.executionService.runFlow(flowId);
      } catch (error) {
        this.logger.error(`Failed to execute scheduled flow ${flowId}: ${error.message}`);
      } finally {
        await this.releaseExecutionLock(lockKey);
      }
    });

    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();
    this.activeJobs.set(flowId, jobName);

    this.logger.log(`Scheduled flow ${flowId} with cron: ${cronExpression}`);
  }

  private async acquireExecutionLock(flowId: string, lockKey: string): Promise<boolean> {
    const redis = this.getRedisClient();
    const lockValue = `${this.instanceId}-${Date.now()}`;

    try {
      const result = await redis.set(
        `etl:lock:${lockKey}`,
        lockValue,
        'NX',
        'PX',
        30000,
      );

      return result === 'OK';
    } catch (error) {
      this.logger.error(`Failed to acquire execution lock for ${flowId}: ${error.message}`);
      return false;
    }
  }

  private async releaseExecutionLock(lockKey: string): Promise<boolean> {
    const redis = this.getRedisClient();

    try {
      await redis.del(`etl:lock:${lockKey}`);
      return true;
    } catch (error) {
      this.logger.warn(`Failed to release execution lock: ${error.message}`);
      return false;
    }
  }

  async scheduleFlow(flowId: string, cronExpression: string): Promise<void> {
    if (this.isLeader) {
      await this.scheduleFlowInternal(flowId, cronExpression);
    } else {
      this.logger.debug(`Not leader, scheduling flow ${flowId} in database only`);
    }
  }

  async unscheduleFlow(flowId: string): Promise<void> {
    if (this.activeJobs.has(flowId)) {
      const jobName = this.activeJobs.get(flowId)!;
      this.removeJob(jobName);
      this.activeJobs.delete(flowId);
      this.logger.log(`Unscheduled flow: ${flowId}`);
    }
  }

  private removeJob(jobName: string) {
    try {
      const job = this.schedulerRegistry.getCronJob(jobName);
      job.stop();
      this.schedulerRegistry.deleteCronJob(jobName);
    } catch (error) {
      if (error.message !== 'No Cron Job was found.') {
        this.logger.warn(`Error removing job ${jobName}: ${error.message}`);
      }
    }
  }

  getScheduledFlows(): Array<{ flowId: string; cronExpression: string; nextExecution: Date }> {
    const result: Array<{ flowId: string; cronExpression: string; nextExecution: Date }> = [];

    for (const [flowId, jobName] of this.activeJobs.entries()) {
      try {
        const job = this.schedulerRegistry.getCronJob(jobName);
        result.push({
          flowId,
          cronExpression: job.cronTime.toString(),
          nextExecution: job.nextDate().toJSDate(),
        });
      } catch (error) {
        this.logger.warn(`Error getting job ${jobName}: ${error.message}`);
      }
    }

    return result;
  }

  isSchedulerLeader(): boolean {
    return this.isLeader;
  }

  getSchedulerInfo() {
    return {
      instanceId: this.instanceId,
      isLeader: this.isLeader,
      activeJobs: this.activeJobs.size,
    };
  }
}
