import { Datasource } from '../../entities/datasource.entity';
import { STREAM_BATCH_SIZE } from '../etl-engine.service';

export interface ConnectorResult {
  data: any[];
  columns: string[];
  totalRows: number;
  batchIndex?: number;
  hasMore?: boolean;
}

export abstract class DatasourceConnector {
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract read(config: any, limit?: number): Promise<ConnectorResult>;
  abstract write(data: any[], config: any): Promise<{ rowsWritten: number }>;

  async readStream(
    config: any,
    batchIndex: number,
    batchSize: number = STREAM_BATCH_SIZE,
  ): Promise<ConnectorResult> {
    const offset = batchIndex * batchSize;
    const limit = batchSize + 1;
    
    const result = await this.read({
      ...config,
      limit,
      offset,
    });

    const hasMore = result.data.length > batchSize;
    return {
      data: hasMore ? result.data.slice(0, batchSize) : result.data,
      columns: result.columns,
      totalRows: result.totalRows,
      batchIndex,
      hasMore,
    };
  }

  async writeBatch(
    data: any[],
    config: any,
    batchSize: number = STREAM_BATCH_SIZE,
  ): Promise<{ rowsWritten: number }> {
    let totalWritten = 0;

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const { rowsWritten } = await this.write(batch, config);
      totalWritten += rowsWritten;
    }

    return { rowsWritten: totalWritten };
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.connect();
      await this.disconnect();
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}
