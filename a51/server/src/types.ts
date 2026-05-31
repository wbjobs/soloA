import type { WebSocket } from 'ws';

export type Permission = 'owner' | 'write' | 'read';

export interface User {
  id: string;
  name: string;
  permission: Permission;
  color: string;
}

export interface Participant {
  user: User;
  ws: WebSocket;
  cursor: { row: number; col: number } | null;
}

export interface Room {
  id: string;
  ownerId: string;
  participants: Map<string, Participant>;
  created: Date;
}

export interface TerminalOutputChunk {
  roomId: string;
  timestamp: number;
  data: string;
}

export interface LogEntry {
  roomId: string;
  userId: string;
  timestamp: number;
  type: 'join' | 'leave' | 'input' | 'output' | 'permission';
  data: string;
}

interface RTCSessionDescriptionInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type SignalingMessage =
  | { type: 'join'; roomId: string; userName: string }
  | { type: 'join-ack'; success: boolean; roomId: string; user: User; participants: User[] }
  | { type: 'user-joined'; user: User }
  | { type: 'user-left'; userId: string }
  | { type: 'set-permission'; userId: string; permission: Permission }
  | { type: 'permission-changed'; userId: string; permission: Permission }
  | { type: 'rtc-offer'; toUserId: string; offer: RTCSessionDescriptionInit; fromUserId?: string }
  | { type: 'rtc-answer'; toUserId: string; answer: RTCSessionDescriptionInit; fromUserId?: string }
  | { type: 'rtc-candidate'; toUserId: string; candidate: RTCIceCandidateInit; fromUserId?: string }
  | { type: 'terminal-input'; data: string }
  | { type: 'terminal-output'; data: string }
  | { type: 'cursor-update'; userId: string; cursor: { row: number; col: number } }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'request-sync' };
