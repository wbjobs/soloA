import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { FlowVersion } from './flow-version.entity';

export type FlowStatus = 'draft' | 'published' | 'archived';

@Entity('flows')
export class Flow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status: FlowStatus;

  @Column({ type: 'uuid', nullable: true })
  currentVersionId: string;

  @OneToMany(() => FlowVersion, version => version.flow, { cascade: true })
  versions: FlowVersion[];

  @Column({ type: 'varchar', nullable: true })
  cronExpression: string;

  @Column({ default: false })
  isScheduled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
