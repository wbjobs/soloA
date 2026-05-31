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

export interface Collaborator {
  userId: string;
  username: string;
  color: string;
  position: number;
}

export interface HistoryEntry {
  id: string;
  type: string;
  operation: Operation;
  timestamp: string;
  version: number;
  user: {
    id: string;
    username: string;
  };
}

export interface WSMessage {
  type: 'join' | 'leave' | 'operation' | 'cursor' | 'heartbeat' | 'ack' | 'sync' | 'error' | 'user_joined' | 'user_left';
  data?: unknown;
}
