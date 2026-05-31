import { LogEntry } from './types';
import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

export class LogStorage {
  private static ensureDir(): void {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  private static getLogPath(roomId: string): string {
    this.ensureDir();
    return path.join(LOG_DIR, `${roomId}.log`);
  }

  static append(entry: LogEntry): void {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.getLogPath(entry.roomId), line, 'utf8');
  }

  static read(roomId: string): LogEntry[] {
    const logPath = this.getLogPath(roomId);
    if (!fs.existsSync(logPath)) {
      return [];
    }
    const content = fs.readFileSync(logPath, 'utf8');
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }

  static exists(roomId: string): boolean {
    return fs.existsSync(this.getLogPath(roomId));
  }
}
