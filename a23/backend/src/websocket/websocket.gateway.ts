import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Execution } from '../entities/execution.entity';
import { ExecutionLog } from '../entities/execution-log.entity';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/etl',
})
@Injectable()
export class EtlWebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EtlWebSocketGateway.name);

  @WebSocketServer()
  server: Server;

  private executionSubscriptions = new Map<string, Set<string>>();

  constructor(
    @InjectRepository(Execution)
    private executionRepository: Repository<Execution>,
    @InjectRepository(ExecutionLog)
    private executionLogRepository: Repository<ExecutionLog>,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    for (const [executionId, clients] of this.executionSubscriptions.entries()) {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.executionSubscriptions.delete(executionId);
      }
    }
  }

  @SubscribeMessage('subscribe_execution')
  async handleSubscribeExecution(
    @MessageBody() data: { executionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { executionId } = data;
    
    if (!this.executionSubscriptions.has(executionId)) {
      this.executionSubscriptions.set(executionId, new Set());
    }
    this.executionSubscriptions.get(executionId)!.add(client.id);

    client.join(`execution:${executionId}`);

    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
    });
    
    if (execution) {
      client.emit('execution_status', {
        executionId,
        status: execution.status,
        nodeProgress: execution.nodeProgress,
      });
    }

    const logs = await this.executionLogRepository.find({
      where: { executionId },
      order: { timestamp: 'ASC' },
    });

    for (const log of logs) {
      client.emit('execution_log', {
        executionId,
        log: {
          id: log.id,
          level: log.level,
          message: log.message,
          data: log.data,
          timestamp: log.timestamp,
        },
      });
    }

    return { success: true, executionId };
  }

  @SubscribeMessage('unsubscribe_execution')
  handleUnsubscribeExecution(
    @MessageBody() data: { executionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { executionId } = data;
    
    client.leave(`execution:${executionId}`);
    
    if (this.executionSubscriptions.has(executionId)) {
      this.executionSubscriptions.get(executionId)!.delete(client.id);
    }

    return { success: true, executionId };
  }

  broadcastExecutionStatus(executionId: string, status: string, nodeProgress?: any) {
    this.server.to(`execution:${executionId}`).emit('execution_status', {
      executionId,
      status,
      nodeProgress,
      timestamp: new Date(),
    });
  }

  broadcastExecutionLog(
    executionId: string,
    log: {
      id: string;
      level: string;
      message: string;
      data?: any;
      timestamp: Date;
    },
  ) {
    this.server.to(`execution:${executionId}`).emit('execution_log', {
      executionId,
      log,
    });
  }

  broadcastExecutionPreview(executionId: string, previewData: any[]) {
    this.server.to(`execution:${executionId}`).emit('execution_preview', {
      executionId,
      previewData,
    });
  }
}
