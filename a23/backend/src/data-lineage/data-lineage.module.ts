import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataLineage } from '../entities/data-lineage.entity';
import { DataLineageService } from './data-lineage.service';
import { DataLineageController } from './data-lineage.controller';
import { DatasourceModule } from '../datasource/datasource.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DataLineage]),
    forwardRef(() => DatasourceModule),
  ],
  controllers: [DataLineageController],
  providers: [DataLineageService],
  exports: [DataLineageService],
})
export class DataLineageModule {}
