import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Execution } from '../entities/execution.entity';
import { ExecutionLog } from '../entities/execution-log.entity';
import { EtlEngineService } from './etl-engine.service';
import { EtlQueueService, ETL_QUEUE } from './etl-queue.service';
import { DatasourceModule } from '../datasource/datasource.module';
import { FlowModule } from '../flow/flow.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Execution, ExecutionLog]),
    BullModule.registerQueue({
      name: ETL_QUEUE,
    }),
    DatasourceModule,
    forwardRef(() => FlowModule),
  ],
  providers: [EtlEngineService, EtlQueueService],
  exports: [EtlEngineService, EtlQueueService],
})
export class EtlModule {}
