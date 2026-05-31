export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'editor' | 'reader';
}

export interface Folder {
  _id: string;
  name: string;
  description: string;
  createdBy: string;
  parentId: string | null;
  color: string;
  icon: string;
  isStarred: boolean;
  sortOrder: number;
  noteCount?: number;
  children?: Folder[];
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  _id: string;
  title: string;
  content: string;
  createdBy: string;
  folderId: string | null;
  permissions: Record<string, string>;
  isPublic: boolean;
  publicPermission: 'none' | 'reader' | 'editor';
  tags: string[];
  isStarred: boolean;
  createdAt: string;
  updatedAt: string;
  lastModifiedBy?: string;
  userPermission: 'owner' | 'editor' | 'reader' | 'none';
}

export interface NoteVersion {
  _id: string;
  noteId: string;
  title: string;
  content: string;
  createdBy: string | User;
  versionNumber: number;
  changeSummary: string;
  createdAt: string;
}

export interface Collaborator {
  id: string;
  username: string;
  cursor?: CursorPosition;
  permission: string;
}

export interface RemoteDocUpdate {
  userId: string;
  username: string;
  content: string;
  cursor?: CursorPosition;
  serverTime?: number;
}

export interface RemoteTitleUpdate {
  userId: string;
  username: string;
  title: string;
}

export interface RemoteCursorUpdate {
  userId: string;
  username: string;
  cursor: CursorPosition;
}

export interface CommentMention {
  userId: string;
  username: string;
  mentionedAt: number;
}

export interface CommentReaction {
  emoji: string;
  users: string[];
}

export interface CommentPosition {
  start: {
    line: number;
    column: number;
    offset: number;
  };
  end: {
    line: number;
    column: number;
    offset: number;
  };
  selectedText?: string;
}

export interface Comment {
  _id: string;
  noteId: string;
  parentId: string | null;
  content: string;
  createdBy: string | User;
  mentions: CommentMention[];
  resolvedAt: string | null;
  resolvedBy: string | User | null;
  position?: CommentPosition;
  reactions: CommentReaction[];
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  replies?: Comment[];
}

export interface MentionableUser {
  _id: string;
  username: string;
  email: string;
}

export interface ExportNoteData {
  title: string;
  content: string;
  folderId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ImportResult {
  imported: number;
  updated: number;
  failed: number;
  errors: Array<{ title: string; error: string }>;
}

export interface CursorPosition {
  from: number;
  to: number;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
  role?: 'admin' | 'editor' | 'reader';
}
