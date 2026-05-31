import { WebSocket } from 'ws';
import prisma from '../config/db';
import { redis, redisPub, redisSub } from '../config/redis';
import { Operation, ScoreData, AuthUser, NoteData, Comment, CommentReply } from '../types';
import { otService } from './otService';

interface ConnectedUser {
  userId: string;
  username: string;
  ws: WebSocket;
  color: string;
  lastHeartbeat: number;
}

interface Room {
  scoreId: string;
  users: Map<string, ConnectedUser>;
  operations: Operation[];
  version: number;
  lock: Promise<void> | null;
}

class RoomService {
  private rooms: Map<string, Room> = new Map();
  private readonly HEARTBEAT_TIMEOUT = 30000;
  private readonly CHANNEL_PREFIX = 'score-room:';
  private readonly LOCK_PREFIX = 'score-lock:';

  constructor() {
    this.setupRedisPubSub();
  }

  private setupRedisPubSub() {
    redisSub.on('message', async (channel, message) => {
      if (channel.startsWith(this.CHANNEL_PREFIX)) {
        const scoreId = channel.replace(this.CHANNEL_PREFIX, '');
        const room = this.rooms.get(scoreId);
        if (room) {
          try {
            const parsed = JSON.parse(message);
            this.broadcastToRoom(room, parsed, true);
          } catch (e) {
            console.error('Failed to parse Redis message', e);
          }
        }
      }
    });
  }

  private async acquireLock(scoreId: string): Promise<() => Promise<void>> {
    const lockKey = this.LOCK_PREFIX + scoreId;
    const lockValue = Math.random().toString(36);
    
    let acquired = false;
    const startTime = Date.now();
    
    while (!acquired && Date.now() - startTime < 5000) {
      try {
        const result = await redis.set(lockKey, lockValue, 'PX', 10000, 'NX');
        if (result === 'OK') {
          acquired = true;
        } else {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (e) {
        console.error('Redis lock error:', e);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (!acquired) {
      throw new Error('获取锁超时');
    }

    return async () => {
      try {
        const currentValue = await redis.get(lockKey);
        if (currentValue === lockValue) {
          await redis.del(lockKey);
        }
      } catch (e) {
        console.error('Redis unlock error:', e);
      }
    };
  }

  broadcastComment(scoreId: string, comment: Comment, action: 'created' | 'updated' | 'deleted') {
    const room = this.rooms.get(scoreId);
    if (!room) return;

    const message = {
      type: 'comment_' + action,
      data: comment
    };

    this.broadcastToRoom(room, message, false);

    redisPub.publish(
      this.CHANNEL_PREFIX + scoreId,
      JSON.stringify(message)
    );
  }

  broadcastCommentReply(scoreId: string, reply: CommentReply, action: 'created' | 'deleted') {
    const room = this.rooms.get(scoreId);
    if (!room) return;

    const message = {
      type: 'reply_' + action,
      data: reply
    };

    this.broadcastToRoom(room, message, false);

    redisPub.publish(
      this.CHANNEL_PREFIX + scoreId,
      JSON.stringify(message)
    );
  }

  async joinRoom(
    scoreId: string,
    user: AuthUser,
    ws: WebSocket
  ): Promise<{ score: ScoreData; users: Array<{ userId: string; username: string; color: string }> }> {
    let room = this.rooms.get(scoreId);
    
    if (!room) {
      const scoreDb = await prisma.score.findUnique({
        where: { id: scoreId }
      });
      
      if (!scoreDb) {
        throw new Error('乐谱不存在');
      }

      const operations = await prisma.operation.findMany({
        where: { scoreId },
        orderBy: { version: 'asc' }
      });

      room = {
        scoreId,
        users: new Map(),
        operations: operations.map(op => op.operation as Operation),
        version: scoreDb.data ? (scoreDb.data as ScoreData).version : 0,
        lock: null
      };

      this.rooms.set(scoreId, room);
      
      const channel = this.CHANNEL_PREFIX + scoreId;
      await redisSub.subscribe(channel);
    }

    const color = this.generateColor();
    const connectedUser: ConnectedUser = {
      userId: user.userId,
      username: user.username,
      ws,
      color,
      lastHeartbeat: Date.now()
    };

    const existingUsers = Array.from(room.users.values()).map(u => ({
      userId: u.userId,
      username: u.username,
      color: u.color
    }));

    room.users.set(user.userId, connectedUser);

    const scoreDb = await prisma.score.findUnique({
      where: { id: scoreId }
    });

    const scoreData = scoreDb?.data as ScoreData || this.createEmptyScore(scoreId);

    this.broadcastToRoom(
      room,
      {
        type: 'user_joined',
        data: {
          userId: user.userId,
          username: user.username,
          color
        }
      },
      false,
      user.userId
    );

    return {
      score: scoreData,
      users: [...existingUsers]
    };
  }

  async leaveRoom(scoreId: string, userId: string) {
    const room = this.rooms.get(scoreId);
    if (!room) return;

    room.users.delete(userId);

    this.broadcastToRoom(
      room,
      {
        type: 'user_left',
        data: { userId }
      },
      false
    );

    if (room.users.size === 0) {
      this.rooms.delete(scoreId);
      await redisSub.unsubscribe(this.CHANNEL_PREFIX + scoreId);
      await this.persistScore(scoreId, room);
    }
  }

  async submitOperation(
    scoreId: string,
    userId: string,
    operation: Operation
  ): Promise<{ transformedOp: Operation; newVersion: number }> {
    const room = this.rooms.get(scoreId);
    if (!room) {
      throw new Error('房间不存在');
    }

    const releaseLock = await this.acquireLock(scoreId);

    try {
      const scoreDb = await prisma.score.findUnique({
        where: { id: scoreId }
      });
      const scoreData = scoreDb?.data as ScoreData || this.createEmptyScore(scoreId);

      const operationWithExtra = { ...operation } as Operation & Record<string, unknown>;

      if (operation.type === 'delete_note') {
        const oldNote = scoreData.notes.find(n => n.id === operation.noteId);
        if (oldNote) {
          operationWithExtra.oldNote = oldNote;
        }
      }

      if (operation.type === 'update_note') {
        const oldNote = scoreData.notes.find(n => n.id === operation.noteId);
        if (oldNote) {
          operationWithExtra.oldPosition = oldNote.position;
          operationWithExtra.oldStaff = oldNote.staff;
        }
      }

      if (operation.type === 'update_tempo') {
        operationWithExtra.oldTempo = scoreData.tempo;
      }

      const baseVersion = Math.min(operation.version, room.version);
      const concurrentOps: Operation[] = [];
      
      for (let i = room.operations.length - 1; i >= 0; i--) {
        const op = room.operations[i];
        if (op.version < baseVersion) break;
        if (op.userId !== userId) {
          concurrentOps.unshift(op);
        }
      }

      let transformedOp = operationWithExtra as Operation;
      for (const against of concurrentOps) {
        transformedOp = otService.transform(transformedOp, against);
      }

      const newVersion = room.version + 1;
      transformedOp.version = newVersion;

      const newScore = otService.applyOperation(scoreData, transformedOp);

      await prisma.$transaction([
        prisma.score.update({
          where: { id: scoreId },
          data: {
            data: newScore,
            updatedAt: new Date()
          }
        }),
        prisma.operation.create({
          data: {
            scoreId,
            userId,
            type: transformedOp.type,
            operation: transformedOp as any,
            version: newVersion
          }
        })
      ]);

      room.operations.push(transformedOp);
      room.version = newVersion;

      await redisPub.publish(
        this.CHANNEL_PREFIX + scoreId,
        JSON.stringify({
          type: 'operation',
          data: transformedOp
        })
      );

      this.broadcastToRoom(
        room,
        {
          type: 'operation',
          data: transformedOp
        },
        true,
        userId
      );

      return { transformedOp, newVersion };
    } finally {
      await releaseLock();
    }
  }

  updateHeartbeat(scoreId: string, userId: string) {
    const room = this.rooms.get(scoreId);
    if (room) {
      const user = room.users.get(userId);
      if (user) {
        user.lastHeartbeat = Date.now();
      }
    }
  }

  sendCursor(scoreId: string, userId: string, position: number) {
    const room = this.rooms.get(scoreId);
    if (!room) return;

    const user = room.users.get(userId);
    if (!user) return;

    this.broadcastToRoom(
      room,
      {
        type: 'cursor',
        data: {
          userId,
          username: user.username,
          color: user.color,
          position
        }
      },
      true,
      userId
    );
  }

  getRoomUsers(scoreId: string) {
    const room = this.rooms.get(scoreId);
    if (!room) return [];
    return Array.from(room.users.values()).map(u => ({
      userId: u.userId,
      username: u.username,
      color: u.color
    }));
  }

  private async persistScore(scoreId: string, room: Room) {
    try {
      const scoreDb = await prisma.score.findUnique({
        where: { id: scoreId }
      });
      if (scoreDb) {
        await prisma.score.update({
          where: { id: scoreId },
          data: {
            updatedAt: new Date()
          }
        });
      }
    } catch (e) {
      console.error('Failed to persist score:', e);
    }
  }

  private broadcastToRoom(
    room: Room,
    message: { type: string; data?: unknown },
    useRedis: boolean = false,
    excludeUserId?: string
  ) {
    const messageStr = JSON.stringify(message);
    
    for (const [userId, user] of room.users) {
      if (excludeUserId && userId === excludeUserId) continue;
      
      if (user.ws.readyState === WebSocket.OPEN) {
        user.ws.send(messageStr);
      }
    }
  }

  private generateColor(): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
      '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
      '#BB8FCE', '#85C1E9', '#F8B500', '#FF6F61'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private createEmptyScore(scoreId: string): ScoreData {
    return {
      title: '新建乐谱',
      staves: [
        { index: 0, clef: 'treble', key: 'C', timeSignature: '4/4' }
      ],
      notes: [],
      tempo: 120,
      version: 0
    };
  }
}

export const roomService = new RoomService();
