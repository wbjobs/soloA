import { DatasourceConnector, ConnectorResult } from './datasource-connector';
import axios, { AxiosRequestConfig } from 'axios';

export class RestApiConnector extends DatasourceConnector {
  private config: any;

  constructor(config: any) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    await this.testConnection();
  }

  async disconnect(): Promise<void> {
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.config.headers || {}),
    };

    const auth = this.config.auth;
    if (auth) {
      switch (auth.type) {
        case 'basic':
          const token = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
          headers['Authorization'] = `Basic ${token}`;
          break;
        case 'bearer':
          headers['Authorization'] = `Bearer ${auth.token}`;
          break;
        case 'api_key':
          headers[auth.key] = auth.value;
          break;
      }
    }

    return headers;
  }

  async read(config: any, limit?: number): Promise<ConnectorResult> {
    const url = config.url || this.config.url;
    const method = config.method || this.config.method || 'GET';
    const dataPath = config.dataPath || this.config.dataPath || 'data';
    const params = config.params || this.config.params || {};

    const axiosConfig: AxiosRequestConfig = {
      url,
      method,
      headers: this.buildHeaders(),
      params,
      timeout: 30000,
    };

    if (config.data || this.config.data) {
      axiosConfig.data = config.data || this.config.data;
    }

    const response = await axios(axiosConfig);
    let responseData = response.data;

    if (dataPath && typeof responseData === 'object') {
      const parts = dataPath.split('.');
      for (const part of parts) {
        if (responseData && responseData[part] !== undefined) {
          responseData = responseData[part];
        } else {
          responseData = null;
          break;
        }
      }
    }

    let data: any[] = [];
    if (Array.isArray(responseData)) {
      data = limit ? responseData.slice(0, limit) : responseData;
    } else if (responseData) {
      data = limit ? [responseData].slice(0, limit) : [responseData];
    }

    const columns = data.length > 0 ? Object.keys(data[0]) : [];

    return {
      data,
      columns,
      totalRows: data.length,
    };
  }

  async write(data: any[], config: any): Promise<{ rowsWritten: number }> {
    if (data.length === 0) {
      return { rowsWritten: 0 };
    }

    const url = config.url || this.config.url;
    const method = config.method || this.config.method || 'POST';
    const batchSize = config.batchSize || this.config.batchSize || 100;

    let rowsWritten = 0;
    const batches: any[][] = [];
    
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      await axios({
        url,
        method,
        headers: this.buildHeaders(),
        data: batch,
        timeout: 60000,
      });
      rowsWritten += batch.length;
    }

    return { rowsWritten };
  }
}
