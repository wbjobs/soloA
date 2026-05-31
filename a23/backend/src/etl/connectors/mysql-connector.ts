import { DatasourceConnector, ConnectorResult } from './datasource-connector';
import { STREAM_BATCH_SIZE } from '../etl-engine.service';

export class MysqlConnector extends DatasourceConnector {
  private connection: any = null;
  private config: any;

  constructor(config: any) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    const mysql = await import('mysql2/promise');
    this.connection = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port || 3306,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database,
      multipleStatements: true,
    });
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  private buildSelectSql(config: any): string {
    const { query, table, columns = '*', where = '' } = config;
    
    if (query) {
      return query;
    }

    const cols = Array.isArray(columns) ? columns.join(', ') : columns;
    let sql = `SELECT ${cols} FROM ${table}`;
    if (where) {
      sql += ` WHERE ${where}`;
    }
    return sql;
  }

  async read(config: any, limit?: number): Promise<ConnectorResult> {
    let sql = this.buildSelectSql(config);
    const { offset } = config;

    if (offset !== undefined) {
      sql += ` LIMIT ${limit || STREAM_BATCH_SIZE} OFFSET ${offset}`;
    } else if (limit) {
      sql += ` LIMIT ${limit}`;
    }

    const [rows] = await this.connection.execute(sql);
    const data = rows as any[];
    
    const columnsData = data.length > 0 ? Object.keys(data[0]) : [];

    return {
      data,
      columns: columnsData,
      totalRows: data.length,
    };
  }

  async readStream(
    config: any,
    batchIndex: number,
    batchSize: number = STREAM_BATCH_SIZE,
  ): Promise<ConnectorResult> {
    const offset = batchIndex * batchSize;
    const limit = batchSize + 1;
    
    const result = await this.read({
      ...config,
      offset,
      limit,
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

  async write(data: any[], config: any): Promise<{ rowsWritten: number }> {
    if (data.length === 0) {
      return { rowsWritten: 0 };
    }

    const { table } = config;
    const columns = Object.keys(data[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

    let rowsWritten = 0;
    for (const row of data) {
      const values = columns.map(col => row[col]);
      await this.connection.execute(sql, values);
      rowsWritten++;
    }

    return { rowsWritten };
  }
}
