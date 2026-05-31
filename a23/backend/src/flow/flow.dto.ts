import { IsString, IsOptional, IsObject, IsBoolean, IsNumber } from 'class-validator';
import { FlowDefinition } from '../entities/flow-version.entity';

export class CreateFlowDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateFlowDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class SaveFlowVersionDto {
  @IsObject()
  definition: FlowDefinition;

  @IsOptional()
  @IsString()
  changelog?: string;
}

export class UpdateScheduleDto {
  @IsString()
  cronExpression: string;
}

export class PublishFlowDto {
  @IsString()
  versionId: string;

  @IsOptional()
  @IsString()
  changelog?: string;
}
