import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type LineageNodeType = 'datasource' | 'flow' | 'node' | 'table' | 'field';

export interface LineageMetadata {
  flowId?: string;
  nodeId?: string;
  nodeType?: string;
  tableName?: string;
  fieldName?: string;
  datasourceType?: string;
  transformation?: string;
  filterCondition?: string;
  mapping?: {
    sourceField: string;
    targetField: string;
    transform?: string;
  }[];
  qualityChecks?: string[];
}

@Entity('data_lineage')
@Index(['sourceNodeId', 'targetNodeId'])
@Index(['flowId'])
export class DataLineage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  flowId: string;

  @Column({ type: 'varchar', length: 100 })
  sourceNodeId: string;

  @Column({ type: 'varchar', length: 255 })
  sourceNodeLabel: string;

  @Column({ type: 'varchar', length: 50 })
  sourceNodeType: LineageNodeType;

  @Column({ type: 'varchar', length: 100 })
  targetNodeId: string;

  @Column({ type: 'varchar', length: 255 })
  targetNodeLabel: string;

  @Column({ type: 'varchar', length: 50 })
  targetNodeType: LineageNodeType;

  @Column({ type: 'jsonb', nullable: true })
  metadata: LineageMetadata;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: 'active' | 'deleted';

  @CreateDateColumn()
  createdAt: Date;
}
