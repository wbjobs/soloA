import { SignalingMessage } from '../types';

type WebSocketEventMap = {
  open: [];
  close: [];
  message: [SignalingMessage];
  error: [Event];
};

type Listener<K extends keyof WebSocketEventMap> = (
  ...args: WebSocketEventMap[K]
) => void;

export class SignalingService {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners: Map<string, Set<Function>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(url: string = '/ws') {
    this.url = url;
  }

  on<K extends keyof WebSocketEventMap>(
    event: K,
    listener: Listener<K>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  private emit<K extends keyof WebSocketEventMap>(
    event: K,
    ...args: WebSocketEventMap[K]
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        (listener as Function)(...args);
      }
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}${this.url}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.emit('open');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this.emit('message', msg);
          } catch (err) {
            console.error('Failed to parse message:', err);
          }
        };

        this.ws.onclose = () => {
          this.emit('close');
        };

        this.ws.onerror = (err) => {
          this.emit('error', err);
          reject(err);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  joinRoom(roomId: string, userName: string): void {
    this.send({ type: 'join', roomId, userName });
  }

  sendOffer(toUserId: string, offer: RTCSessionDescriptionInit): void {
    this.send({ type: 'rtc-offer', toUserId, offer });
  }

  sendAnswer(toUserId: string, answer: RTCSessionDescriptionInit): void {
    this.send({ type: 'rtc-answer', toUserId, answer });
  }

  sendCandidate(toUserId: string, candidate: RTCIceCandidateInit): void {
    this.send({ type: 'rtc-candidate', toUserId, candidate });
  }

  sendInput(data: string): void {
    this.send({ type: 'terminal-input', data });
  }

  sendCursor(cursor: { row: number; col: number }): void {
    this.send({ type: 'cursor-update', userId: '', cursor });
  }

  setPermission(userId: string, permission: 'write' | 'read'): void {
    this.send({ type: 'set-permission', userId, permission });
  }

  sendResize(cols: number, rows: number): void {
    this.send({ type: 'resize', cols, rows });
  }
}
