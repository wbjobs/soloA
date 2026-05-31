import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as crypto from 'crypto';

export const LOCK_PREFIX = 'etl:lock:';
export const LOCK_TIMEOUT = 60 * 1000;
export const LOCK_REFRESH_INTERVAL = 30 * 1000;

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);
  private activeLocks = new Map<string, string>();
  private refreshTimers = new Map<string, NodeJS.Timeout>();

  constructor(@InjectQueue('etl_queue') private queue: Queue) {}

  private getRedisClient() {
    return (this.queue as any).client;
  }

  private generateToken(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  async acquireLock(
    key: string,
    timeout: number = LOCK_TIMEOUT,
  ): Promise<{ acquired: boolean; token?: string }> {
    const lockKey = `${LOCK_PREFIX}${key}`;
    const token = this.generateToken();
    const redis = this.getRedisClient();

    try {
      const result = await redis.set(
        lockKey,
        token,
        'NX',
        'PX',
        timeout,
      );

      if (result === 'OK') {
        this.activeLocks.set(key, token);
        this.startLockRefresh(key, token, timeout);
        return { acquired: true, token };
      }

      return { acquired: false };
    } catch (error) {
      this.logger.error(`Failed to acquire lock ${key}: ${error.message}`);
      return { acquired: false };
    }
  }

  async releaseLock(key: string): Promise<boolean> {
    const lockKey = `${LOCK_PREFIX}${key}`;
    const token = this.activeLocks.get(key);
    const redis = this.getRedisClient();

    this.stopLockRefresh(key);

    if (!token) {
      return false;
    }

    try {
      const currentToken = await redis.get(lockKey);
      if (currentToken === token) {
        await redis.del(lockKey);
        this.activeLocks.delete(key);
        return true;
      }

      this.activeLocks.delete(key);
      return false;
    } catch (error) {
      this.logger.error(`Failed to release lock ${key}: ${error.message}`);
      this.activeLocks.delete(key);
      return false;
    }
  }

  private startLockRefresh(key: string, token: string, timeout: number) {
    this.stopLockRefresh(key);

    const refreshInterval = Math.max(timeout / 3, 1000);
    const timer = setInterval(async () => {
      const lockKey = `${LOCK_PREFIX}${key}`;
      const redis = this.getRedisClient();

      try {
        const currentToken = await redis.get(lockKey);
        if (currentToken === token) {
          await redis.pexpire(lockKey, timeout);
          this.logger.debug(`Refreshed lock ${key}`);
        } else {
          this.stopLockRefresh(key);
        }
      } catch (error) {
        this.logger.warn(`Failed to refresh lock ${key}: ${error.message}`);
      }
    }, refreshInterval);

    this.refreshTimers.set(key, timer);
  }

  private stopLockRefresh(key: string) {
    const timer = this.refreshTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.refreshTimers.delete(key);
    }
  }

  async isLocked(key: string): Promise<boolean> {
    const lockKey = `${LOCK_PREFIX}${key}`;
    const redis = this.getRedisClient();

    try {
      const value = await redis.get(lockKey);
      return value !== null;
    } catch (error) {
      this.logger.warn(`Failed to check lock ${key}: ${error.message}`);
      return false;
    }
  }

  async runWithLock<T>(
    key: string,
    callback: () => Promise<T>,
    timeout: number = LOCK_TIMEOUT,
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    const lock = await this.acquireLock(key, timeout);

    if (!lock.acquired) {
      this.logger.debug(`Could not acquire lock for ${key}, another instance is running`);
      return { success: false, error: 'Lock not acquired' };
    }

    try {
      const result = await callback();
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      await this.releaseLock(key);
    }
  }
}
