import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Datasource } from '../entities/datasource.entity';
import { CreateDatasourceDto, UpdateDatasourceDto, TestConnectionDto } from './datasource.dto';

@Injectable()
export class DatasourceService {
  constructor(
    @InjectRepository(Datasource)
    private datasourceRepository: Repository<Datasource>,
  ) {}

  async findAll(): Promise<Datasource[]> {
    return this.datasourceRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<Datasource> {
    const datasource = await this.datasourceRepository.findOne({ where: { id } });
    if (!datasource) {
      throw new NotFoundException(`Datasource with id ${id} not found`);
    }
    return datasource;
  }

  async create(dto: CreateDatasourceDto): Promise<Datasource> {
    const datasource = this.datasourceRepository.create(dto);
    return this.datasourceRepository.save(datasource);
  }

  async update(id: string, dto: UpdateDatasourceDto): Promise<Datasource> {
    await this.findById(id);
    await this.datasourceRepository.update(id, dto);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    const result = await this.datasourceRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Datasource with id ${id} not found`);
    }
  }

  async testConnection(dto: TestConnectionDto): Promise<{ success: boolean; message: string }> {
    try {
      switch (dto.type) {
        case 'mysql':
        case 'postgresql':
          return await this.testDatabaseConnection(dto.type, dto.config);
        case 'csv':
          return await this.testCsvConnection(dto.config);
        case 'rest_api':
          return await this.testApiConnection(dto.config);
        default:
          return { success: false, message: 'Unsupported datasource type' };
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  private async testDatabaseConnection(
    type: 'mysql' | 'postgresql',
    config: any,
  ): Promise<{ success: boolean; message: string }> {
    const { host, port, username, password, database } = config;
    let connection: any = null;
    
    try {
      if (type === 'mysql') {
        const mysql = await import('mysql2/promise');
        connection = await mysql.createConnection({
          host,
          port: port || 3306,
          user: username,
          password,
          database,
        });
        await connection.query('SELECT 1');
      } else {
        const { Client } = await import('pg');
        connection = new Client({
          host,
          port: port || 5432,
          user: username,
          password,
          database,
        });
        await connection.connect();
        await connection.query('SELECT 1');
      }
      
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    } finally {
      if (connection) {
        try {
          if (type === 'mysql') {
            await connection.end();
          } else {
            await connection.end();
          }
        } catch {}
      }
    }
  }

  private async testCsvConnection(config: any): Promise<{ success: boolean; message: string }> {
    const fs = await import('fs');
    const path = await import('path');
    
    try {
      const filePath = config.filePath;
      if (!filePath) {
        return { success: false, message: 'File path is required' };
      }
      
      if (!fs.existsSync(filePath)) {
        return { success: false, message: 'File does not exist' };
      }
      
      return { success: true, message: 'File exists and is accessible' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  private async testApiConnection(config: any): Promise<{ success: boolean; message: string }> {
    const axios = await import('axios').then(m => m.default);
    
    try {
      const { url, method = 'GET', headers = {}, auth } = config;
      
      if (!url) {
        return { success: false, message: 'URL is required' };
      }

      const requestHeaders = { ...headers };
      
      if (auth) {
        switch (auth.type) {
          case 'basic':
            const token = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
            requestHeaders['Authorization'] = `Basic ${token}`;
            break;
          case 'bearer':
            requestHeaders['Authorization'] = `Bearer ${auth.token}`;
            break;
          case 'api_key':
            requestHeaders[auth.key] = auth.value;
            break;
        }
      }

      const response = await axios({
        url,
        method,
        headers: requestHeaders,
        timeout: 10000,
      });

      return {
        success: response.status >= 200 && response.status < 300,
        message: `API responded with status ${response.status}`,
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}
