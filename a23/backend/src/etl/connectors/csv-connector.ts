import { DatasourceConnector, ConnectorResult } from './datasource-connector';
import { STREAM_BATCH_SIZE } from '../etl-engine.service';
import * as fs from 'fs';

export class CsvConnector extends DatasourceConnector {
  private config: any;
  private cachedAllData: any[] | null = null;
  private cachedColumns: string[] | null = null;

  constructor(config: any) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    const filePath = this.config.filePath;
    if (!fs.existsSync(filePath)) {
      throw new Error(`CSV file not found: ${filePath}`);
    }
  }

  async disconnect(): Promise<void> {
    this.cachedAllData = null;
    this.cachedColumns = null;
  }

  private async loadAllData(config: any): Promise<{ data: any[]; columns: string[] }> {
    if (this.cachedAllData && this.cachedColumns) {
      return { data: this.cachedAllData, columns: this.cachedColumns };
    }

    const csvParser = await import('csv-parser');
    const filePath = config.filePath || this.config.filePath;
    const delimiter = config.delimiter || this.config.delimiter || ',';
    const encoding = config.encoding || this.config.encoding || 'utf-8';

    const results: any[] = [];
    let columns: string[] = [];

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { encoding })
        .pipe(csvParser({ separator: delimiter }))
        .on('headers', (headers: string[]) => {
          columns = headers;
        })
        .on('data', (data: any) => {
          results.push(data);
        })
        .on('end', () => {
          this.cachedAllData = results;
          this.cachedColumns = columns;
          resolve({ data: results, columns });
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  async read(config: any, limit?: number): Promise<ConnectorResult> {
    const { offset } = config;
    const { data, columns } = await this.loadAllData(config);
    
    let slicedData = data;
    if (offset !== undefined) {
      slicedData = data.slice(offset, offset + (limit || data.length));
    } else if (limit) {
      slicedData = data.slice(0, limit);
    }

    return {
      data: slicedData,
      columns,
      totalRows: slicedData.length,
    };
  }

  async readStream(
    config: any,
    batchIndex: number,
    batchSize: number = STREAM_BATCH_SIZE,
  ): Promise<ConnectorResult> {
    const offset = batchIndex * batchSize;
    const limit = batchSize + 1;
    
    const { data, columns } = await this.loadAllData(config);
    
    const slicedData = data.slice(offset, offset + limit);
    const hasMore = slicedData.length > batchSize;

    return {
      data: hasMore ? slicedData.slice(0, batchSize) : slicedData,
      columns,
      totalRows: data.length,
      batchIndex,
      hasMore,
    };
  }

  async write(data: any[], config: any): Promise<{ rowsWritten: number }> {
    if (data.length === 0) {
      return { rowsWritten: 0 };
    }

    const filePath = config.filePath || this.config.filePath;
    const delimiter = config.delimiter || this.config.delimiter || ',';
    const encoding = config.encoding || this.config.encoding || 'utf-8';
    const append = config.append || false;

    const columns = Object.keys(data[0]);
    const header = columns.join(delimiter);
    const rows = data.map(row => 
      columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(delimiter)
    );

    let content: string;
    if (append && fs.existsSync(filePath)) {
      content = rows.join('\n') + '\n';
      fs.appendFileSync(filePath, content, { encoding });
    } else {
      content = [header, ...rows].join('\n');
      fs.writeFileSync(filePath, content, { encoding });
    }

    return { rowsWritten: data.length };
  }
}
