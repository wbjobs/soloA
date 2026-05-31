import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Execution } from '../entities/execution.entity';
import { ExecutionLog } from '../entities/execution-log.entity';
import { EtlWebSocketGateway } from './websocket.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([Execution, ExecutionLog])],
  providers: [EtlWebSocketGateway],
  exports: [EtlWebSocketGateway],
})
export class WebSocketModule {}
