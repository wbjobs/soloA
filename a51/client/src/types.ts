export type Permission = 'owner' | 'write' | 'read';
export type LogEntryType = 'join' | 'leave' | 'input' | 'output' | 'permission';

export interface LogEntry {
  roomId: string;
  userId: string;
  timestamp: number;
  type: LogEntryType;
  data: string;
}

export interface SessionInfo {
  roomId: string;
  createdAt: string;
  modifiedAt: string;
  size: number;
  entryCount: number;
  duration: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  speed: number;
  currentTime: number;
  totalTime: number;
  currentIndex: number;
}

export interface ActiveUser {
  id: string;
  name: string;
  color: string;
  joinedAt: number;
  leftAt?: number;
}

export interface User {
  id: string;
  name: string;
  permission: Permission;
  color: string;
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

export interface RoomState {
  roomId: string;
  currentUser: User | null;
  participants: Map<string, User>;
  remoteCursors: Map<string, { row: number; col: number }>;
}
