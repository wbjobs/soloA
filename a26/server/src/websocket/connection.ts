import { SocketStream } from '@fastify/websocket';
import { FastifyRequest, FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { roomService } from '../services/roomService';
import { Operation, JoinMessage, CursorMessage, HeartbeatMessage, OperationMessage } from '../types';
import { AuthUser } from '../middleware/auth';

interface ActiveConnection {
  userId: string;
  scoreId: string;
  ws: WebSocket;
  lastHeartbeat: number;
}

export class WebSocketManager {
  private connections: Map<string, ActiveConnection> = new Map();
  private readonly HEARTBEAT_INTERVAL = 15000;
  private readonly HEARTBEAT_TIMEOUT = 30000;

  constructor(private app: FastifyInstance) {
    this.startHeartbeatCheck();
  }

  handleConnection(connection: SocketStream, request: FastifyRequest) {
    const ws = connection.socket;
    const connectionId = Math.random().toString(36).substring(2, 15);
    
    let activeConnection: ActiveConnection | null = null;

    ws.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        
        switch (data.type) {
          case 'join':
            activeConnection = await this.handleJoin(
              ws, 
              data as JoinMessage, 
              connectionId
            );
            break;
          case 'operation':
            if (activeConnection) {
              await this.handleOperation(
                activeConnection, 
                data as OperationMessage
              );
            }
            break;
          case 'cursor':
            if (activeConnection) {
              this.handleCursor(activeConnection, data as CursorMessage);
            }
            break;
          case 'heartbeat':
            if (activeConnection) {
              this.handleHeartbeat(activeConnection);
            }
            break;
          default:
            this.sendError(ws, '未知消息类型');
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        this.sendError(ws, error instanceof Error ? error.message : '处理消息失败');
      }
    });

    ws.on('close', async () => {
      if (activeConnection) {
        try {
          await roomService.leaveRoom(activeConnection.scoreId, activeConnection.userId);
          this.connections.delete(connectionId);
        } catch (e) {
          console.error('Error on disconnect:', e);
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  private async handleJoin(
    ws: WebSocket,
    message: JoinMessage,
    connectionId: string
  ): Promise<ActiveConnection> {
    const { scoreId, token } = message.data;

    let user: AuthUser;
    try {
      user = await this.app.jwt.verify<AuthUser>(token);
    } catch (e) {
      this.sendError(ws, '认证失败');
      ws.close();
      throw new Error('认证失败');
    }

    const result = await roomService.joinRoom(scoreId, user, ws);

    const activeConnection: ActiveConnection = {
      userId: user.userId,
      scoreId,
      ws,
      lastHeartbeat: Date.now()
    };

    this.connections.set(connectionId, activeConnection);

    this.send(ws, {
      type: 'sync',
      data: {
        score: result.score,
        users: result.users,
        version: result.score.version
      }
    });

    return activeConnection;
  }

  private async handleOperation(
    connection: ActiveConnection,
    message: OperationMessage
  ) {
    const operation = message.data as Operation;
    operation.userId = connection.userId;
    operation.timestamp = Date.now();

    try {
      const { transformedOp, newVersion } = await roomService.submitOperation(
        connection.scoreId,
        connection.userId,
        operation
      );

      this.send(connection.ws, {
        type: 'ack',
        data: {
          operationId: operation.id,
          version: newVersion,
          transformed: transformedOp
        }
      });
    } catch (error) {
      this.sendError(connection.ws, error instanceof Error ? error.message : '操作失败');
    }
  }

  private handleCursor(
    connection: ActiveConnection,
    message: CursorMessage
  ) {
    roomService.sendCursor(
      connection.scoreId,
      connection.userId,
      message.data.position
    );
  }

  private handleHeartbeat(connection: ActiveConnection) {
    connection.lastHeartbeat = Date.now();
    roomService.updateHeartbeat(connection.scoreId, connection.userId);

    this.send(connection.ws, {
      type: 'heartbeat',
      data: {
        serverTime: Date.now(),
        clientTime: Date.now()
      }
    });
  }

  private startHeartbeatCheck() {
    setInterval(() => {
      const now = Date.now();
      for (const [id, conn] of this.connections) {
        if (now - conn.lastHeartbeat > this.HEARTBEAT_TIMEOUT) {
          conn.ws.close();
          roomService.leaveRoom(conn.scoreId, conn.userId)
            .catch(e => console.error('Error cleaning up connection:', e));
          this.connections.delete(id);
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private send(ws: WebSocket, message: { type: string; data?: unknown }) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string) {
    this.send(ws, {
      type: 'error',
      data: { message: error }
    });
  }
}
