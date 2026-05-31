import { IsString, IsOptional, IsObject, IsBoolean, IsEnum } from 'class-validator';
import { DatasourceType } from '../entities/datasource.entity';

export class CreateDatasourceDto {
  @IsString()
  name: string;

  @IsEnum(['mysql', 'postgresql', 'csv', 'rest_api'])
  type: DatasourceType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsObject()
  config: any;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDatasourceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['mysql', 'postgresql', 'csv', 'rest_api'])
  type?: DatasourceType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  config?: any;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TestConnectionDto {
  @IsEnum(['mysql', 'postgresql', 'csv', 'rest_api'])
  type: DatasourceType;

  @IsObject()
  config: any;
}
