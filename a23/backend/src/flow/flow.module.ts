import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Flow } from '../entities/flow.entity';
import { FlowVersion } from '../entities/flow-version.entity';
import { FlowService } from './flow.service';
import { FlowController } from './flow.controller';
import { EtlModule } from '../etl/etl.module';
import { DataLineageModule } from '../data-lineage/data-lineage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Flow, FlowVersion]),
    forwardRef(() => EtlModule),
    forwardRef(() => DataLineageModule),
  ],
  controllers: [FlowController],
  providers: [FlowService],
  exports: [FlowService],
})
export class FlowModule {}
