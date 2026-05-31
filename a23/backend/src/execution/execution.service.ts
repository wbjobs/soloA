import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Execution } from '../entities/execution.entity';
import { FlowService } from '../flow/flow.service';
import { EtlEngineService } from '../etl/etl-engine.service';
import { EtlQueueService } from '../etl/etl-queue.service';

@Injectable()
export class ExecutionService {
  constructor(
    @InjectRepository(Execution)
    private executionRepository: Repository<Execution>,
    private flowService: FlowService,
    private etlEngineService: EtlEngineService,
    private etlQueueService: EtlQueueService,
  ) {}

  async findAll(flowId?: string): Promise<Execution[]> {
    const where: any = {};
    if (flowId) {
      where.flowId = flowId;
    }
    return this.executionRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Execution> {
    const execution = await this.executionRepository.findOne({
      where: { id },
    });
    if (!execution) {
      throw new NotFoundException(`Execution with id ${id} not found`);
    }
    return execution;
  }

  async runFlow(flowId: string, maxRetries?: number): Promise<Execution> {
    const flow = await this.flowService.findById(flowId);
    
    if (!flow.currentVersionId) {
      throw new Error('Flow has no published version');
    }

    const versions = await this.flowService.getVersions(flowId);
    const currentVersion = versions.find(v => v.id === flow.currentVersionId);
    
    if (!currentVersion) {
      throw new Error('Published version not found');
    }

    const execution = this.executionRepository.create({
      flowId,
      flowVersionId: flow.currentVersionId,
      versionNumber: currentVersion.version,
      status: 'pending',
      metadata: {},
      nodeProgress: {},
      maxRetries: maxRetries ?? 3,
      retryCount: 0,
    });
    await this.executionRepository.save(execution);

    await this.etlQueueService.addJob(
      flowId,
      execution.id,
      'manual',
    );

    return execution;
  }

  async retryExecution(executionId: string): Promise<Execution> {
    const sourceExecution = await this.findById(executionId);
    
    if (!['failed', 'retry_pending'].includes(sourceExecution.status)) {
      throw new BadRequestException('Only failed or retry_pending executions can be retried');
    }

    const newExecution = this.executionRepository.create({
      flowId: sourceExecution.flowId,
      flowVersionId: sourceExecution.flowVersionId,
      versionNumber: sourceExecution.versionNumber,
      status: 'pending',
      metadata: {
        ...sourceExecution.metadata,
        isResume: true,
        resumedFromExecutionId: executionId,
      },
      nodeProgress: sourceExecution.nodeProgress,
      checkpoint: sourceExecution.checkpoint,
      maxRetries: sourceExecution.maxRetries,
      retryCount: 0,
    });
    await this.executionRepository.save(newExecution);

    await this.etlQueueService.addJob(
      sourceExecution.flowId,
      newExecution.id,
      'manual',
      undefined,
      executionId,
      true,
    );

    return newExecution;
  }

  async getLogs(executionId: string) {
    return this.etlEngineService.getLogs(executionId);
  }

  async getPreviewData(executionId: string): Promise<any[]> {
    const execution = await this.findById(executionId);
    return execution.metadata?.previewData || [];
  }
}
