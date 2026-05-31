import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Datasource } from './entities/datasource.entity';
import { Flow } from './entities/flow.entity';
import { FlowVersion } from './entities/flow-version.entity';
import { Execution } from './entities/execution.entity';
import { ExecutionLog } from './entities/execution-log.entity';
import { DataLineage } from './entities/data-lineage.entity';
import { DatasourceModule } from './datasource/datasource.module';
import { FlowModule } from './flow/flow.module';
import { EtlModule } from './etl/etl.module';
import { ExecutionModule } from './execution/execution.module';
import { WebSocketModule } from './websocket/websocket.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { DataLineageModule } from './data-lineage/data-lineage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: parseInt(configService.get('DB_PORT', '5432'), 10),
        username: configService.get('DB_USERNAME', 'postgres'),
        password: configService.get('DB_PASSWORD', 'postgres'),
        database: configService.get('DB_DATABASE', 'etl_platform'),
        entities: [Datasource, Flow, FlowVersion, Execution, ExecutionLog, DataLineage],
        synchronize: true,
        logging: false,
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: parseInt(configService.get('REDIS_PORT', '6379'), 10),
          password: configService.get('REDIS_PASSWORD') || undefined,
        },
        prefix: configService.get('QUEUE_PREFIX', 'etl'),
      }),
    }),
    DatasourceModule,
    FlowModule,
    EtlModule,
    ExecutionModule,
    WebSocketModule,
    SchedulerModule,
    DataLineageModule,
  ],
})
export class AppModule {}
