import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'retry_pending';

@Entity('executions')
export class Execution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  flowId: string;

  @Column({ type: 'uuid' })
  flowVersionId: string;

  @Column({ type: 'int' })
  versionNumber: number;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: ExecutionStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    triggerType: 'manual' | 'schedule' | 'api';
    userId?: string;
    rowsProcessed?: number;
    errors?: Array<{
      nodeId: string;
      nodeType: string;
      message: string;
      timestamp: Date;
    }>;
    previewData?: any[];
    retryCount?: number;
    maxRetries?: number;
    isResume?: boolean;
    resumedFromExecutionId?: string;
  };

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'jsonb', nullable: true })
  nodeProgress: Record<string, {
    status: ExecutionStatus;
    startTime?: Date;
    endTime?: Date;
    rowsProcessed?: number;
    totalRows?: number;
    lastBatchIndex?: number;
    qualitySummary?: any;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  checkpoint: {
    completedNodes: string[];
    currentNode?: string;
    lastBatchIndex?: number;
    processedRowCount?: number;
    failedAt?: {
      nodeId: string;
      batchIndex: number;
      error: string;
      timestamp: Date;
    };
  };

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'int', default: 3 })
  maxRetries: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
