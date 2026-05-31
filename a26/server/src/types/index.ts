export interface NoteData {
  id: string;
  pitch: string;
  octave: number;
  duration: string;
  position: number;
  staff: number;
}

export interface StaffData {
  index: number;
  clef: 'treble' | 'bass';
  key: string;
  timeSignature: string;
}

export interface ScoreData {
  title: string;
  staves: StaffData[];
  notes: NoteData[];
  tempo: number;
  version: number;
}

export type OperationType = 'add_note' | 'update_note' | 'delete_note' | 'update_tempo' | 'update_staff';

export interface BaseOperation {
  id: string;
  type: OperationType;
  userId: string;
  timestamp: number;
  version: number;
}

export interface AddNoteOperation extends BaseOperation {
  type: 'add_note';
  note: NoteData;
}

export interface UpdateNoteOperation extends BaseOperation {
  type: 'update_note';
  noteId: string;
  changes: Partial<NoteData>;
  oldPosition?: number;
  oldStaff?: number;
}

export interface DeleteNoteOperation extends BaseOperation {
  type: 'delete_note';
  noteId: string;
  oldNote?: NoteData;
}

export interface UpdateTempoOperation extends BaseOperation {
  type: 'update_tempo';
  tempo: number;
  oldTempo?: number;
}

export interface UpdateStaffOperation extends BaseOperation {
  type: 'update_staff';
  staffIndex: number;
  changes: Partial<StaffData>;
}

export type Operation = 
  | AddNoteOperation 
  | UpdateNoteOperation 
  | DeleteNoteOperation 
  | UpdateTempoOperation 
  | UpdateStaffOperation;

export interface User {
  id: string;
  username: string;
  email: string;
}

export interface JWTPayload {
  userId: string;
  username: string;
  email: string;
}

export type CommentTargetType = 'note' | 'measure' | 'staff';

export interface Comment {
  id: string;
  scoreId: string;
  userId: string;
  content: string;
  targetType: CommentTargetType;
  targetId?: string;
  staffIndex?: number;
  position?: number;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
  };
  replies: CommentReply[];
}

export interface CommentReply {
  id: string;
  commentId: string;
  userId: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
  };
}

export interface FileExport {
  id: string;
  scoreId: string;
  userId: string;
  fileType: 'musicxml' | 'midi';
  fileName: string;
  fileUrl: string;
  fileSize: number;
  createdAt: string;
}

export type DiffType = 'added' | 'removed' | 'modified' | 'moved';

export interface NoteDiff {
  type: DiffType;
  note: NoteData;
  oldNote?: NoteData;
  changes?: Partial<NoteData>;
}

export interface StaffDiff {
  type: DiffType;
  staff: StaffData;
  oldStaff?: StaffData;
}

export interface ScoreDiff {
  notes: NoteDiff[];
  staves: StaffDiff[];
  tempo?: {
    old: number;
    new: number;
  };
  oldVersion: number;
  newVersion: number;
}

export interface WSMessage {
  type: 'join' | 'leave' | 'operation' | 'cursor' | 'heartbeat' | 'ack' | 'sync' | 'error' | 'comment' | 'comment_reply' | 'comment_update' | 'comment_delete';
  data?: unknown;
}

export interface JoinMessage extends WSMessage {
  type: 'join';
  data: {
    scoreId: string;
    token: string;
  };
}

export interface OperationMessage extends WSMessage {
  type: 'operation';
  data: Operation;
}

export interface CursorMessage extends WSMessage {
  type: 'cursor';
  data: {
    userId: string;
    username: string;
    position: number;
    color: string;
  };
}

export interface HeartbeatMessage extends WSMessage {
  type: 'heartbeat';
  data: {
    clientTime: number;
  };
}

export interface CommentMessage extends WSMessage {
  type: 'comment';
  data: Comment;
}

export interface CommentReplyMessage extends WSMessage {
  type: 'comment_reply';
  data: CommentReply;
}

export interface CommentUpdateMessage extends WSMessage {
  type: 'comment_update';
  data: {
    commentId: string;
    resolved?: boolean;
    content?: string;
  };
}

export interface CommentDeleteMessage extends WSMessage {
  type: 'comment_delete';
  data: {
    commentId: string;
  };
}
