import { spawn, IPty } from 'node-pty';
import * as os from 'os';
import { EventEmitter } from 'events';

export interface TerminalEventMap {
  output: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  close: () => void;
}

export class TerminalManager extends EventEmitter {
  private pty: IPty | null = null;
  private roomId: string;
  private cols = 80;
  private rows = 24;

  constructor(roomId: string) {
    super();
    this.roomId = roomId;
  }

  start(cols = 80, rows = 24): void {
    if (this.pty) return;
    this.cols = cols;
    this.rows = rows;

    const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';

    this.pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME || process.env.USERPROFILE || process.cwd(),
      env: process.env as Record<string, string>,
    });

    this.pty.onData((data) => {
      this.emit('output', data);
    });

    this.pty.onExit(() => {
      this.emit('close');
      this.pty = null;
    });
  }

  write(data: string): void {
    if (this.pty) {
      this.pty.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    if (this.pty) {
      this.pty.resize(cols, rows);
      this.emit('resize', cols, rows);
    }
  }

  getSize(): { cols: number; rows: number } {
    return { cols: this.cols, rows: this.rows };
  }

  stop(): void {
    if (this.pty) {
      this.pty.kill();
      this.pty = null;
    }
  }
}
