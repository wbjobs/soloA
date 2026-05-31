import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ExecutionService } from './execution.service';

@Controller('executions')
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Get()
  async findAll(@Query('flowId') flowId?: string) {
    return this.executionService.findAll(flowId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.executionService.findById(id);
  }

  @Get(':id/logs')
  async getLogs(@Param('id') id: string) {
    return this.executionService.getLogs(id);
  }

  @Get(':id/preview')
  async getPreviewData(@Param('id') id: string) {
    return this.executionService.getPreviewData(id);
  }

  @Post('/run/:flowId')
  async runFlow(
    @Param('flowId') flowId: string,
    @Query('maxRetries') maxRetries?: string,
  ) {
    const retries = maxRetries ? parseInt(maxRetries, 10) : undefined;
    return this.executionService.runFlow(flowId, retries);
  }

  @Post(':id/retry')
  async retryExecution(@Param('id') id: string) {
    return this.executionService.retryExecution(id);
  }
}
