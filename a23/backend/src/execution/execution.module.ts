import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Execution } from '../entities/execution.entity';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';
import { FlowModule } from '../flow/flow.module';
import { EtlModule } from '../etl/etl.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Execution]),
    FlowModule,
    EtlModule,
  ],
  controllers: [ExecutionController],
  providers: [ExecutionService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
