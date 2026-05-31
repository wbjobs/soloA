import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

@Entity('execution_logs')
export class ExecutionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  executionId: string;

  @Column({ type: 'uuid', nullable: true })
  nodeId: string;

  @Column({ type: 'varchar', length: 50 })
  level: LogLevel;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  data: any;

  @CreateDateColumn()
  timestamp: Date;
}
