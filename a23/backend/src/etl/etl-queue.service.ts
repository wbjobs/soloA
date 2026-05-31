import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { EtlEngineService } from './etl-engine.service';
import { FlowService } from '../flow/flow.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Execution } from '../entities/execution.entity';

export const ETL_QUEUE = 'etl_queue';

export interface ETLJobData {
  flowId: string;
  executionId: string;
  triggerType: 'manual' | 'schedule' | 'api';
  resumeFromExecutionId?: string;
  isRetry?: boolean;
}

export const RETRY_DELAY_MS = 5000;

@Processor(ETL_QUEUE)
@Injectable()
export class EtlQueueService {
  private readonly logger = new Logger(EtlQueueService.name);

  constructor(
    @InjectQueue(ETL_QUEUE)
    private queue: Queue<ETLJobData>,
    private etlEngineService: EtlEngineService,
    private flowService: FlowService,
    @InjectRepository(Execution)
    private executionRepository: Repository<Execution>,
  ) {}

  async addJob(
    flowId: string, 
    executionId: string, 
    triggerType: 'manual' | 'schedule' | 'api', 
    delay?: number,
    resumeFromExecutionId?: string,
    isRetry?: boolean,
  ) {
    const job = await this.queue.add({
      flowId,
      executionId,
      triggerType,
      resumeFromExecutionId,
      isRetry,
    }, { delay });

    this.logger.log(`Added ETL job queued: ${job.id}, retry: ${isRetry || false}`);
    return job;
  }

  @Process()
  async processJob(job: Job<ETLJobData>) {
    const { flowId, executionId, triggerType, resumeFromExecutionId, isRetry } = job.data;
    
    this.logger.log(`Processing ETL job: ${job.id}, flow: ${flowId}, execution: ${executionId}, retry: ${isRetry || false}`);

    try {
      const definition = await this.flowService.getCurrentDefinition(flowId);
      const result = await this.etlEngineService.executeFlow(
        executionId,
        definition,
        triggerType,
        resumeFromExecutionId,
      );

      if (!result.success) {
        const execution = await this.executionRepository.findOne({ where: { id: executionId } });
        if (execution?.status === 'retry_pending') {
          await this.addJob(
            flowId,
            executionId,
            triggerType,
            RETRY_DELAY_MS,
            executionId,
            true,
          );
          this.logger.log(`Queued retry for execution ${executionId} with delay ${RETRY_DELAY_MS}ms`);
          return { success: false, retryScheduled: true };
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`ETL job failed: ${error.message}`);
      throw error;
    }
  }

  async getActiveJobs(): Promise<Job<ETLJobData>[]> {
    return this.queue.getActive();
  }

  async getWaitingJobs(): Promise<Job<ETLJobData>[]> {
    return this.queue.getWaiting();
  }

  async getCompletedJobs(): Promise<Job<ETLJobData>[]> {
    return this.queue.getCompleted();
  }

  async getFailedJobs(): Promise<Job<ETLJobData>[]> {
    return this.queue.getFailed();
  }

  async removeJob(jobId: string): Promise<void> {
    const jobs = await this.queue.getJobs(['waiting', 'active', 'delayed']);
    for (const job of jobs) {
      if (String(job.id) === jobId) {
        await job.remove();
        return;
      }
    }
  }
}
