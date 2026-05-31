import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type DatasourceType = 'mysql' | 'postgresql' | 'csv' | 'rest_api';

@Entity('datasources')
export class Datasource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  type: DatasourceType;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'jsonb' })
  config: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
    table?: string;
    filePath?: string;
    delimiter?: string;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    auth?: {
      type: 'basic' | 'bearer' | 'api_key';
      token?: string;
      username?: string;
      password?: string;
      key?: string;
      value?: string;
    };
    encoding?: string;
  };

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
