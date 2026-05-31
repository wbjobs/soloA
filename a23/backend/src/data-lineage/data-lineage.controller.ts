import { Controller, Get, Param } from '@nestjs/common';
import { DataLineageService } from './data-lineage.service';

@Controller('lineage')
export class DataLineageController {
  constructor(private readonly lineageService: DataLineageService) {}

  @Get('/flow/:flowId')
  async getFlowLineage(@Param('flowId') flowId: string) {
    return this.lineageService.getFlowLineage(flowId);
  }

  @Get('/datasource/:datasourceId')
  async getDatasourceLineage(@Param('datasourceId') datasourceId: string) {
    return this.lineageService.getDatasourceLineage(datasourceId);
  }
}
