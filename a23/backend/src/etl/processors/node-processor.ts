import { FlowNode } from '../../entities/flow-version.entity';
import { ConnectorResult } from '../connectors/datasource-connector';

export abstract class NodeProcessor {
  abstract execute(node: FlowNode, inputData: ConnectorResult, context: ExecutionContext): Promise<ConnectorResult>;

  async executeStream?(
    node: FlowNode,
    batchIndex: number,
    context: ExecutionContext,
  ): Promise<ConnectorResult> {
    return this.execute(node, { data: [], columns: [], totalRows: 0, batchIndex, hasMore: false }, context);
  }
}

export interface ExecutionContext {
  executionId: string;
  datasourceService: any;
  log: (level: string, message: string, data?: any) => Promise<void>;
  updateNodeProgress: (nodeId: string, progress: any) => Promise<void>;
  batchIndex?: number;
}
