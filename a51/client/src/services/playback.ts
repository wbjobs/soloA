import { LogEntry, ActiveUser } from '../types';

const USER_COLORS = ['#FF5555', '#55FF55', '#5555FF', '#FFFF55', '#FF55FF', '#55FFFF', '#FFAA00', '#00AAFF'];

export interface PlaybackEvent {
  type: 'output' | 'input' | 'join' | 'leave' | 'permission';
  timestamp: number;
  data: string;
  userId: string;
}

interface QueuedEvent {
  timestamp: number;
  delay: number;
  event: PlaybackEvent;
}

export type PlaybackEventCallback = (event: PlaybackEvent, index: number) => void;

export class PlaybackService {
  private logs: LogEntry[] = [];
  private events: PlaybackEvent[] = [];
  private userMap: Map<string, ActiveUser> = new Map();
  private colorCounter = 0;
  private startTime = 0;
  private totalTime = 0;

  private isPlaying = false;
  private speed = 1;
  private currentTime = 0;
  private currentIndex = 0;
  private lastTickTime = 0;
  private tickTimer: number | null = null;

  private onEventCallbacks: PlaybackEventCallback[] = [];
  private onStateChangeCallbacks: Array<(state: {
    isPlaying: boolean;
    speed: number;
    currentTime: number;
    totalTime: number;
    currentIndex: number;
  }) => void> = [];
  private onUsersChangeCallbacks: Array<(users: ActiveUser[]) => void> = [];
  private onHighlightCallbacks: Array<(userId: string | null, text: string) => void> = [];

  constructor(logs: LogEntry[]) {
    this.logs = logs;
    this.processLogs();
  }

  private getNextColor(): string {
    const color = USER_COLORS[this.colorCounter % USER_COLORS.length];
    this.colorCounter++;
    return color;
  }

  private processLogs(): void {
    if (this.logs.length === 0) return;

    this.startTime = this.logs[0].timestamp;
    this.totalTime = this.logs[this.logs.length - 1].timestamp - this.startTime;

    const events: PlaybackEvent[] = [];
    const userMap = new Map<string, ActiveUser>();

    for (const entry of this.logs) {
      const relativeTime = entry.timestamp - this.startTime;

      if (entry.type === 'join') {
        try {
          const parsed = JSON.parse(entry.data);
          if (!userMap.has(entry.userId)) {
            userMap.set(entry.userId, {
              id: entry.userId,
              name: parsed.name,
              color: this.getNextColor(),
              joinedAt: relativeTime,
            });
          }
        } catch (e) {}
      }

      if (entry.type === 'leave') {
        const user = userMap.get(entry.userId);
        if (user) {
          user.leftAt = relativeTime;
        }
      }

      if (entry.type === 'input' || entry.type === 'output') {
        events.push({
          type: entry.type as 'input' | 'output',
          timestamp: relativeTime,
          data: entry.data,
          userId: entry.userId,
        });
      }

      if (entry.type === 'join' || entry.type === 'leave' || entry.type === 'permission') {
        events.push({
          type: entry.type as 'join' | 'leave' | 'permission',
          timestamp: relativeTime,
          data: entry.data,
          userId: entry.userId,
        });
      }
    }

    this.events = events.sort((a, b) => a.timestamp - b.timestamp);
    this.userMap = userMap;
  }

  private emitState(): void {
    const state = {
      isPlaying: this.isPlaying,
      speed: this.speed,
      currentTime: this.currentTime,
      totalTime: this.totalTime,
      currentIndex: this.currentIndex,
    };
    for (const cb of this.onStateChangeCallbacks) {
      cb(state);
    }
  }

  private emitUsersAtTime(time: number): void {
    const activeUsers: ActiveUser[] = [];
    this.userMap.forEach((user) => {
      const isJoined = user.joinedAt <= time;
      const isLeft = user.leftAt !== undefined && user.leftAt < time;
      if (isJoined && !isLeft) {
        activeUsers.push(user);
      }
    });
    for (const cb of this.onUsersChangeCallbacks) {
      cb(activeUsers);
    }
  }

  private emitHighlight(userId: string | null, text: string): void {
    for (const cb of this.onHighlightCallbacks) {
      cb(userId, text);
    }
  }

  private scheduleEvent(event: PlaybackEvent, index: number, baseTime: number): void {
    const delay = Math.max(0, (event.timestamp - baseTime) / this.speed);

    setTimeout(() => {
      if (this.isPlaying) {
        for (const cb of this.onEventCallbacks) {
          cb(event, index);
        }

        if (event.type === 'input' && event.userId) {
          const user = this.userMap.get(event.userId);
          if (user) {
            this.emitHighlight(event.userId, event.data);
          }
        }

        this.currentIndex = index;
        this.currentTime = event.timestamp;
        this.emitState();
        this.emitUsersAtTime(event.timestamp);
      }
    }, delay);
  }

  private tick(): void {
    if (!this.isPlaying) return;

    const now = performance.now();
    const elapsed = (now - this.lastTickTime) * this.speed;
    this.lastTickTime = now;

    this.currentTime = Math.min(this.currentTime + elapsed, this.totalTime);

    while (
      this.currentIndex < this.events.length &&
      this.events[this.currentIndex].timestamp <= this.currentTime
    ) {
      const event = this.events[this.currentIndex];

      for (const cb of this.onEventCallbacks) {
        cb(event, this.currentIndex);
      }

      if (event.type === 'input' && event.userId) {
        this.emitHighlight(event.userId, event.data);
      }

      this.currentIndex++;
      this.emitUsersAtTime(event.timestamp);
    }

    if (this.currentIndex >= this.events.length) {
      this.pause();
    }

    this.emitState();
    this.tickTimer = requestAnimationFrame(() => this.tick());
  }

  play(): void {
    if (this.isPlaying) return;

    if (this.currentIndex >= this.events.length) {
      this.currentIndex = 0;
      this.currentTime = 0;
    }

    this.isPlaying = true;
    this.lastTickTime = performance.now();
    this.emitState();
    this.emitUsersAtTime(this.currentTime);
    this.tickTimer = requestAnimationFrame(() => this.tick());
  }

  pause(): void {
    this.isPlaying = false;
    if (this.tickTimer) {
      cancelAnimationFrame(this.tickTimer);
      this.tickTimer = null;
    }
    this.emitState();
  }

  toggle(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  setSpeed(speed: number): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.speed = Math.max(0.25, Math.min(8, speed));
    this.emitState();
    if (wasPlaying) this.play();
  }

  seekTo(time: number): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();

    this.currentTime = Math.max(0, Math.min(time, this.totalTime));

    this.currentIndex = 0;
    while (
      this.currentIndex < this.events.length &&
      this.events[this.currentIndex].timestamp <= this.currentTime
    ) {
      this.currentIndex++;
    }

    this.emitState();
    this.emitUsersAtTime(this.currentTime);

    if (wasPlaying) this.play();
  }

  seekToPercent(percent: number): void {
    const time = (percent / 100) * this.totalTime;
    this.seekTo(time);
  }

  seekToEnd(): void {
    this.seekTo(this.totalTime);
  }

  jumpForward(seconds: number): void {
    this.seekTo(this.currentTime + seconds * 1000);
  }

  jumpBackward(seconds: number): void {
    this.seekTo(this.currentTime - seconds * 1000);
  }

  onEvent(callback: PlaybackEventCallback): () => void {
    this.onEventCallbacks.push(callback);
    return () => {
      const idx = this.onEventCallbacks.indexOf(callback);
      if (idx >= 0) this.onEventCallbacks.splice(idx, 1);
    };
  }

  onStateChange(
    callback: (state: {
      isPlaying: boolean;
      speed: number;
      currentTime: number;
      totalTime: number;
      currentIndex: number;
    }) => void
  ): () => void {
    this.onStateChangeCallbacks.push(callback);
    return () => {
      const idx = this.onStateChangeCallbacks.indexOf(callback);
      if (idx >= 0) this.onStateChangeCallbacks.splice(idx, 1);
    };
  }

  onUsersChange(callback: (users: ActiveUser[]) => void): () => void {
    this.onUsersChangeCallbacks.push(callback);
    return () => {
      const idx = this.onUsersChangeCallbacks.indexOf(callback);
      if (idx >= 0) this.onUsersChangeCallbacks.splice(idx, 1);
    };
  }

  onHighlight(callback: (userId: string | null, text: string) => void): () => void {
    this.onHighlightCallbacks.push(callback);
    return () => {
      const idx = this.onHighlightCallbacks.indexOf(callback);
      if (idx >= 0) this.onHighlightCallbacks.splice(idx, 1);
    };
  }

  getUserById(id: string): ActiveUser | undefined {
    return this.userMap.get(id);
  }

  getEventCount(): number {
    return this.events.length;
  }

  getTotalTime(): number {
    return this.totalTime;
  }

  getState() {
    return {
      isPlaying: this.isPlaying,
      speed: this.speed,
      currentTime: this.currentTime,
      totalTime: this.totalTime,
      currentIndex: this.currentIndex,
    };
  }

  dispose(): void {
    this.pause();
    this.onEventCallbacks = [];
    this.onStateChangeCallbacks = [];
    this.onUsersChangeCallbacks = [];
    this.onHighlightCallbacks = [];
  }
}

export function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const secs = seconds % 60;
  const mins = minutes % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
