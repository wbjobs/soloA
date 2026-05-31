import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { FlowService } from './flow.service';
import { EtlEngineService } from '../etl/etl-engine.service';
import { CreateFlowDto, UpdateFlowDto, SaveFlowVersionDto, UpdateScheduleDto, PublishFlowDto } from './flow.dto';
import { FlowDefinition } from '../entities/flow-version.entity';

@Controller('flows')
export class FlowController {
  constructor(
    private readonly flowService: FlowService,
    private readonly etlEngineService: EtlEngineService,
  ) {}

  @Get()
  async findAll() {
    return this.flowService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.flowService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateFlowDto) {
    return this.flowService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFlowDto) {
    return this.flowService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.flowService.delete(id);
  }

  @Post(':id/versions')
  async saveVersion(@Param('id') id: string, @Body() dto: SaveFlowVersionDto) {
    return this.flowService.saveVersion(id, dto);
  }

  @Get(':id/versions')
  async getVersions(@Param('id') id: string) {
    return this.flowService.getVersions(id);
  }

  @Get(':id/versions/:versionId')
  async getVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.flowService.getVersion(id, versionId);
  }

  @Get(':id/compare')
  async compareVersions(
    @Param('id') id: string,
    @Query('version1') version1: string,
    @Query('version2') version2: string,
  ) {
    return this.flowService.compareVersions(id, version1, version2);
  }

  @Post(':id/versions/:versionId/rollback')
  async rollbackToVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.flowService.rollbackToVersion(id, versionId);
  }

  @Post(':id/publish')
  async publish(@Param('id') id: string, @Body() dto: PublishFlowDto) {
    return this.flowService.publish(id, dto);
  }

  @Put(':id/schedule')
  async updateSchedule(@Param('id') id: string, @Body() dto: UpdateScheduleDto) {
    return this.flowService.updateSchedule(id, dto);
  }

  @Delete(':id/schedule')
  async disableSchedule(@Param('id') id: string) {
    return this.flowService.disableSchedule(id);
  }

  @Post('validate')
  async validateFlow(@Body() definition: FlowDefinition) {
    const validation = this.etlEngineService.validateFlow(definition);
    return {
      valid: validation.valid,
      error: validation.error,
      cycleNodes: validation.cycleNodes,
    };
  }
}
