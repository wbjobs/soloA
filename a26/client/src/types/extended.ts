export type CommentTargetType = 'note' | 'measure' | 'staff' | 'score';

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

export type DiffType = 'added' | 'removed' | 'modified' | 'moved';

export interface NoteDiff {
  type: DiffType;
  note: any;
  oldNote?: any;
  changes?: Record<string, unknown>;
}

export interface StaffDiff {
  type: DiffType;
  staff: any;
  oldStaff?: any;
  changes?: Record<string, unknown>;
}

export interface ScoreDiff {
  notes: NoteDiff[];
  staves: StaffDiff[];
  tempo?: { old: number; new: number };
  oldVersion: number;
  newVersion: number;
}

export interface Version {
  version: number;
  timestamp: string;
  user: {
    id: string;
    username: string;
  };
  type: string;
  description: string;
}

export interface FileExport {
  id: string;
  scoreId: string;
  userId: string;
  fileName: string;
  fileType: 'musicxml' | 'midi';
  fileSize: number;
  createdAt: string;
}

export interface ExtendedWSMessage {
  type: 'comment_created' | 'comment_updated' | 'comment_deleted' | 'reply_created' | 'reply_deleted';
  data?: unknown;
}
