import { v4 as uuidv4 } from 'uuid';
import { Room, Participant, User, Permission } from './types';
import { TerminalManager } from './terminalManager';
import { LogStorage } from './logStorage';
import { WebSocket } from 'ws';

const USER_COLORS = ['#FF5555', '#55FF55', '#5555FF', '#FFFF55', '#FF55FF', '#55FFFF', '#FFAA00', '#00AAFF'];

interface QueuedInput {
  userId: string;
  data: string;
  timestamp: number;
}

interface RoomState {
  inputQueue: QueuedInput[];
  isProcessing: boolean;
  lastCursorBroadcast: Map<string, number>;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private terminals: Map<string, TerminalManager> = new Map();
  private roomStates: Map<string, RoomState> = new Map();

  private getColor(usedColors: string[]): string {
    for (const color of USER_COLORS) {
      if (!usedColors.includes(color)) {
        return color;
      }
    }
    return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
  }

  private getRoomState(roomId: string): RoomState {
    if (!this.roomStates.has(roomId)) {
      this.roomStates.set(roomId, {
        inputQueue: [],
        isProcessing: false,
        lastCursorBroadcast: new Map(),
      });
    }
    return this.roomStates.get(roomId)!;
  }

  private async processInputQueue(roomId: string): Promise<void> {
    const state = this.getRoomState(roomId);
    if (state.isProcessing) return;

    state.isProcessing = true;

    while (state.inputQueue.length > 0) {
      const item = state.inputQueue.shift();
      if (!item) continue;

      const room = this.rooms.get(roomId);
      const terminal = this.terminals.get(roomId);

      if (!room || !terminal) continue;

      const participant = room.participants.get(item.userId);
      if (!participant) continue;
      if (participant.user.permission === 'read') continue;

      terminal.write(item.data);

      LogStorage.append({
        roomId,
        userId: item.userId,
        timestamp: Date.now(),
        type: 'input',
        data: item.data,
      });
    }

    state.isProcessing = false;
  }

  createRoom(): string {
    const roomId = uuidv4().slice(0, 8);
    const room: Room = {
      id: roomId,
      ownerId: '',
      participants: new Map(),
      created: new Date(),
    };
    this.rooms.set(roomId, room);
    return roomId;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  joinRoom(roomId: string, userName: string, ws: WebSocket): User {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        ownerId: '',
        participants: new Map(),
        created: new Date(),
      };
      this.rooms.set(roomId, room);
    }

    const usedColors = Array.from(room.participants.values()).map((p) => p.user.color);
    const isOwner = room.participants.size === 0;
    const userId = uuidv4();

    const user: User = {
      id: userId,
      name: userName,
      permission: isOwner ? 'owner' : 'read',
      color: this.getColor(usedColors),
    };

    if (isOwner) {
      room.ownerId = userId;
    }

    const participant: Participant = {
      user,
      ws,
      cursor: null,
    };

    room.participants.set(userId, participant);
    this.ensureTerminal(roomId);

    LogStorage.append({
      roomId,
      userId,
      timestamp: Date.now(),
      type: 'join',
      data: JSON.stringify({ name: userName, permission: user.permission }),
    });

    return user;
  }

  leaveRoom(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const participant = room.participants.get(userId);
    room.participants.delete(userId);

    const state = this.getRoomState(roomId);
    state.inputQueue = state.inputQueue.filter((item) => item.userId !== userId);
    state.lastCursorBroadcast.delete(userId);

    if (participant) {
      LogStorage.append({
        roomId,
        userId,
        timestamp: Date.now(),
        type: 'leave',
        data: JSON.stringify({ name: participant.user.name }),
      });
    }

    if (room.participants.size === 0) {
      const terminal = this.terminals.get(roomId);
      if (terminal) {
        terminal.stop();
        this.terminals.delete(roomId);
      }
      this.rooms.delete(roomId);
      this.roomStates.delete(roomId);
    } else if (room.ownerId === userId) {
      const first = Array.from(room.participants.values())[0];
      room.ownerId = first.user.id;
      first.user.permission = 'owner';
    }
  }

  setPermission(roomId: string, requesterId: string, targetUserId: string, permission: Permission): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const requester = room.participants.get(requesterId);
    const target = room.participants.get(targetUserId);

    if (!requester || !target) return false;
    if (requester.user.permission !== 'owner') return false;
    if (permission === 'owner') return false;

    const oldPermission = target.user.permission;
    target.user.permission = permission;

    const state = this.getRoomState(roomId);
    if (permission === 'read' && oldPermission !== 'read') {
      state.inputQueue = state.inputQueue.filter((item) => item.userId !== targetUserId);
    }

    LogStorage.append({
      roomId,
      userId: requesterId,
      timestamp: Date.now(),
      type: 'permission',
      data: JSON.stringify({ targetUserId, permission }),
    });

    return true;
  }

  getParticipants(roomId: string): User[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.participants.values()).map((p) => p.user);
  }

  getTerminal(roomId: string): TerminalManager | undefined {
    return this.terminals.get(roomId);
  }

  queueTerminalInput(roomId: string, userId: string, data: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const participant = room.participants.get(userId);
    if (!participant) return false;
    if (participant.user.permission === 'read') return false;

    const state = this.getRoomState(roomId);
    state.inputQueue.push({
      userId,
      data,
      timestamp: Date.now(),
    });

    this.processInputQueue(roomId);
    return true;
  }

  broadcastToRoom(roomId: string, message: object, excludeUserId?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const msg = JSON.stringify(message);
    for (const [userId, participant] of room.participants) {
      if (userId !== excludeUserId && participant.ws.readyState === 1) {
        participant.ws.send(msg);
      }
    }
  }

  private ensureTerminal(roomId: string): void {
    if (!this.terminals.has(roomId)) {
      const terminal = new TerminalManager(roomId);
      terminal.on('output', (data) => {
        this.broadcastToRoom(roomId, { type: 'terminal-output', data });
        LogStorage.append({
          roomId,
          userId: '',
          timestamp: Date.now(),
          type: 'output',
          data,
        });
      });
      terminal.start();
      this.terminals.set(roomId, terminal);
    }
  }

  resizeTerminal(roomId: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(roomId);
    if (terminal) {
      terminal.resize(cols, rows);
    }
  }

  updateCursor(roomId: string, userId: string, cursor: { row: number; col: number } | null): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const participant = room.participants.get(userId);
    if (!participant) return false;

    if (participant.user.permission === 'read' && cursor !== null) {
      return false;
    }

    participant.cursor = cursor;

    const state = this.getRoomState(roomId);
    const now = Date.now();
    const lastBroadcast = state.lastCursorBroadcast.get(userId) || 0;

    if (now - lastBroadcast >= 30) {
      state.lastCursorBroadcast.set(userId, now);
      this.broadcastToRoom(
        roomId,
        {
          type: 'cursor-update',
          userId,
          cursor,
        },
        userId
      );
      return true;
    }

    return false;
  }
}

export const roomManager = new RoomManager();
