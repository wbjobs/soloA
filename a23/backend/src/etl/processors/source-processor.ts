import { NodeProcessor, ExecutionContext } from './node-processor';
import { FlowNode } from '../../entities/flow-version.entity';
import { ConnectorResult } from '../connectors/datasource-connector';
import { ConnectorFactory } from '../connectors/connector-factory';
import { STREAM_BATCH_SIZE } from '../etl-engine.service';

export class SourceProcessor extends NodeProcessor {
  private cachedConnector: any = null;
  private cachedConfig: any = null;

  async execute(
    node: FlowNode,
    _inputData: ConnectorResult,
    context: ExecutionContext,
  ): Promise<ConnectorResult> {
    const { datasourceId, config } = node.data;
    
    if (!datasourceId) {
      throw new Error('Datasource ID is required for source node');
    }

    await context.log('info', `Reading data from datasource: ${datasourceId}`);

    const datasource = await context.datasourceService.findById(datasourceId);
    const connector = ConnectorFactory.create(datasource.type, datasource.config);
    
    await connector.connect();
    
    try {
      const result = await connector.read(config || {});
      await context.log('info', `Read ${result.totalRows} rows from datasource`);
      
      await context.updateNodeProgress(node.id, {
        status: 'completed',
        rowsProcessed: result.totalRows,
      });

      return result;
    } finally {
      await connector.disconnect();
    }
  }

  async executeStream(
    node: FlowNode,
    batchIndex: number,
    context: ExecutionContext,
  ): Promise<ConnectorResult> {
    const { datasourceId, config } = node.data;
    
    if (!datasourceId) {
      throw new Error('Datasource ID is required for source node');
    }

    if (batchIndex === 0) {
      await context.log('info', `Reading data from datasource: ${datasourceId} (streaming)`);
    }

    if (!this.cachedConnector || this.cachedConfig?.datasourceId !== datasourceId) {
      if (this.cachedConnector) {
        await this.cachedConnector.disconnect();
      }
      const datasource = await context.datasourceService.findById(datasourceId);
      this.cachedConnector = ConnectorFactory.create(datasource.type, datasource.config);
      this.cachedConfig = { datasourceId };
      await this.cachedConnector.connect();
    }

    try {
      const result = await this.cachedConnector.readStream(config || {}, batchIndex, STREAM_BATCH_SIZE);
      
      if (batchIndex === 0) {
        await context.log('info', `Started streaming read, first batch: ${result.data.length} rows`);
      }
      
      if (!result.hasMore) {
        await context.log('info', `Streaming completed: total ${(batchIndex + 1) * STREAM_BATCH_SIZE} rows`);
        await this.cachedConnector.disconnect();
        this.cachedConnector = null;
        this.cachedConfig = null;
      }

      return result;
    } catch (error) {
      if (this.cachedConnector) {
        await this.cachedConnector.disconnect();
        this.cachedConnector = null;
        this.cachedConfig = null;
      }
      throw error;
    }
  }
}
