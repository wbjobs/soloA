import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Flow } from './flow.entity';

export type NodeType = 'source' | 'filter' | 'mapping' | 'aggregate' | 'sink' | 'quality';

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, any>;
    datasourceId?: string;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface FlowDefinition {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

@Entity('flow_versions')
export class FlowVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  flowId: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'text', nullable: true })
  changelog: string;

  @Column({ type: 'jsonb' })
  definition: FlowDefinition;

  @ManyToOne(() => Flow, flow => flow.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flowId' })
  flow: Flow;

  @CreateDateColumn()
  createdAt: Date;
}
