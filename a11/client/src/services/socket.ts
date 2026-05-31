import { io, Socket } from 'socket.io-client';
import type { CursorPosition, Collaborator } from '../types';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';

function throttle<T extends (...args: any[]) => void>(func: T, limit: number): (...args: Parameters<T>) => void {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;
  
  return function(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          func(...lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
}

function debounce<T extends (...args: any[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

class SocketService {
  private socket: Socket | null = null;
  private currentNoteId: string | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private pendingDocUpdates: Map<string, { content?: string; title?: string; cursor?: CursorPosition }> = new Map();
  private lastSentContent: Map<string, string> = new Map();
  private lastSentTitle: Map<string, string> = new Map();
  private sendUpdateThrottled: ((noteId: string, data: { content?: string; title?: string; cursor?: CursorPosition }) => void) | null = null;
  private sendCursorThrottled: ((noteId: string, cursor: CursorPosition) => void) | null = null;

  constructor() {
    this.sendUpdateThrottled = throttle((noteId: string, data: { content?: string; title?: string; cursor?: CursorPosition }) => {
      this.flushPendingUpdate(noteId);
    }, 50);

    this.sendCursorThrottled = throttle((noteId: string, cursor: CursorPosition) => {
      if (!this.socket) return;
      this.socket.emit('cursor-update', { noteId, cursor });
    }, 30);
  }

  connect(token: string): void {
    if (this.socket) {
      this.disconnect();
    }

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.emit('connected', {});
      
      if (this.currentNoteId) {
        this.socket?.emit('join-note', { noteId: this.currentNoteId });
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.emit('disconnected', {});
    });

    this.socket.on('reconnect', () => {
      console.log('Socket reconnected');
      this.emit('reconnected', {});
    });

    this.socket.on('note-joined', (data: any) => {
      this.emit('note-joined', data);
    });

    this.socket.on('doc-update', (data: { userId: string; username: string; content: string; cursor?: CursorPosition; serverTime?: number }) => {
      this.emit('doc-update', data);
    });

    this.socket.on('title-update', (data: { userId: string; username: string; title: string }) => {
      this.emit('title-update', data);
    });

    this.socket.on('cursor-update', (data: { userId: string; username: string; cursor: CursorPosition }) => {
      this.emit('cursor-update', data);
    });

    this.socket.on('users-updated', (data: { users: Collaborator[] }) => {
      this.emit('users-updated', data);
    });

    this.socket.on('note-saved', (data: any) => {
      this.emit('note-saved', data);
    });

    this.socket.on('save-success', (data: any) => {
      this.emit('save-success', data);
    });

    this.socket.on('save-error', (data: { message: string }) => {
      this.emit('save-error', data);
    });

    this.socket.on('error', (data: { message: string }) => {
      this.emit('error', data);
    });
  }

  disconnect(): void {
    if (this.socket) {
      if (this.currentNoteId) {
        this.flushPendingUpdate(this.currentNoteId);
        this.leaveNote(this.currentNoteId);
      }
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
    this.pendingDocUpdates.clear();
    this.lastSentContent.clear();
    this.lastSentTitle.clear();
  }

  joinNote(noteId: string): void {
    if (!this.socket) return;
    this.currentNoteId = noteId;
    this.socket.emit('join-note', { noteId });
  }

  leaveNote(noteId: string): void {
    if (!this.socket) return;
    this.flushPendingUpdate(noteId);
    this.socket.emit('leave-note', { noteId });
    if (this.currentNoteId === noteId) {
      this.currentNoteId = null;
    }
  }

  private flushPendingUpdate(noteId: string): void {
    if (!this.socket) return;
    
    const pending = this.pendingDocUpdates.get(noteId);
    if (!pending) return;

    const lastContent = this.lastSentContent.get(noteId);
    const lastTitle = this.lastSentTitle.get(noteId);

    const data: {
      content?: string;
      title?: string;
      cursor?: CursorPosition;
      baseContent?: string;
      baseTitle?: string;
    } = {};

    if (pending.content !== undefined && pending.content !== lastContent) {
      data.content = pending.content;
      if (lastContent !== undefined) {
        data.baseContent = lastContent;
      }
      this.lastSentContent.set(noteId, pending.content);
    }

    if (pending.title !== undefined && pending.title !== lastTitle) {
      data.title = pending.title;
      if (lastTitle !== undefined) {
        data.baseTitle = lastTitle;
      }
      this.lastSentTitle.set(noteId, pending.title);
    }

    if (pending.cursor !== undefined) {
      data.cursor = pending.cursor;
    }

    if (data.content !== undefined || data.title !== undefined || data.cursor !== undefined) {
      this.socket.emit('doc-update', { noteId, ...data });
    }

    this.pendingDocUpdates.delete(noteId);
  }

  sendDocUpdate(noteId: string, data: { content?: string; title?: string; cursor?: CursorPosition }): void {
    if (!this.socket) return;

    const existing = this.pendingDocUpdates.get(noteId) || {};
    
    if (data.content !== undefined) existing.content = data.content;
    if (data.title !== undefined) existing.title = data.title;
    if (data.cursor !== undefined) existing.cursor = data.cursor;
    
    this.pendingDocUpdates.set(noteId, existing);
    this.sendUpdateThrottled?.(noteId, existing);
  }

  sendCursorUpdate(noteId: string, cursor: CursorPosition): void {
    if (!this.socket) return;
    this.sendCursorThrottled?.(noteId, cursor);
  }

  saveNote(noteId: string, data: { content: string; title: string }): void {
    if (!this.socket) return;
    
    this.lastSentContent.set(noteId, data.content);
    this.lastSentTitle.set(noteId, data.title);
    
    this.socket.emit('save-note', { noteId, ...data });
  }

  on(event: string, callback: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in listener for ${event}:`, error);
      }
    });
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getCurrentNoteId(): string | null {
    return this.currentNoteId;
  }
}

export const socketService = new SocketService();
export default socketService;
