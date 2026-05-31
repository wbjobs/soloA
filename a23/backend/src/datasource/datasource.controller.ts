import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { DatasourceService } from './datasource.service';
import { CreateDatasourceDto, UpdateDatasourceDto, TestConnectionDto } from './datasource.dto';

@Controller('datasources')
export class DatasourceController {
  constructor(private readonly datasourceService: DatasourceService) {}

  @Get()
  async findAll() {
    return this.datasourceService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.datasourceService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateDatasourceDto) {
    return this.datasourceService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDatasourceDto) {
    return this.datasourceService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.datasourceService.delete(id);
  }

  @Post('test')
  async testConnection(@Body() dto: TestConnectionDto) {
    return this.datasourceService.testConnection(dto);
  }
}
