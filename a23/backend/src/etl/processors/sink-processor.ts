import { NodeProcessor, ExecutionContext } from './node-processor';
import { FlowNode } from '../../entities/flow-version.entity';
import { ConnectorResult } from '../connectors/datasource-connector';
import { ConnectorFactory } from '../connectors/connector-factory';
import { STREAM_BATCH_SIZE } from '../etl-engine.service';

export class SinkProcessor extends NodeProcessor {
  private cachedConnector: any = null;
  private cachedConfig: any = null;
  private totalRowsWritten = 0;

  async execute(
    node: FlowNode,
    inputData: ConnectorResult,
    context: ExecutionContext,
  ): Promise<ConnectorResult> {
    const { datasourceId, config } = node.data;
    
    if (!datasourceId) {
      throw new Error('Datasource ID is required for sink node');
    }

    await context.log('info', `Writing ${inputData.data.length} rows to datasource: ${datasourceId}`);

    const datasource = await context.datasourceService.findById(datasourceId);
    const connector = ConnectorFactory.create(datasource.type, datasource.config);
    
    await connector.connect();
    
    try {
      const result = await connector.writeBatch(inputData.data, config || {}, STREAM_BATCH_SIZE);
      await context.log('info', `Wrote ${result.rowsWritten} rows to datasource`);

      await context.updateNodeProgress(node.id, {
        status: 'completed',
        rowsProcessed: result.rowsWritten,
      });

      return inputData;
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
      throw new Error('Datasource ID is required for sink node');
    }

    if (batchIndex === 0) {
      this.totalRowsWritten = 0;
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
      const inputData = {
        data: [],
        columns: [],
        totalRows: 0,
        batchIndex,
        hasMore: false,
      };

      const writeConfig = {
        ...(config || {}),
        append: batchIndex > 0,
      };

      const result = await this.cachedConnector.writeBatch(
        inputData.data,
        writeConfig,
        STREAM_BATCH_SIZE,
      );

      this.totalRowsWritten += result.rowsWritten;

      await context.updateNodeProgress(node.id, {
        rowsProcessed: this.totalRowsWritten,
      });

      return {
        data: [],
        columns: [],
        totalRows: this.totalRowsWritten,
        batchIndex,
        hasMore: false,
      };
    } catch (error) {
      if (this.cachedConnector) {
        await this.cachedConnector.disconnect();
        this.cachedConnector = null;
        this.cachedConfig = null;
      }
      throw error;
    }
  }

  async finishWrite(): Promise<void> {
    if (this.cachedConnector) {
      await this.cachedConnector.disconnect();
      this.cachedConnector = null;
      this.cachedConfig = null;
    }
  }
}
