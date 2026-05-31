import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { Flow } from '../entities/flow.entity';
import { EtlSchedulerService } from './scheduler.service';
import { ExecutionModule } from '../execution/execution.module';
import { ETL_QUEUE } from '../etl/etl-queue.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Flow]),
    ScheduleModule.forRoot(),
    BullModule.registerQueue({
      name: ETL_QUEUE,
    }),
    ExecutionModule,
  ],
  providers: [EtlSchedulerService],
  exports: [EtlSchedulerService],
})
export class SchedulerModule {}
