import crypto from 'node:crypto';
import type { LockResult, RateLimitResult } from './types.js';

export class RedisEngine {
  private kv = new Map<string, { value: string; expiresAt?: number }>();
  private hashes = new Map<string, Map<string, string>>();
  private sortedSets = new Map<string, Array<{ score: number; member: string }>>();
  private subscribers = new Map<string, Set<(message: string) => void>>();

  // 1. Strings & Expirations
  async set(key: string, value: string, ttlSeconds?: number): Promise<'OK'> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.kv.set(key, { value, expiresAt });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const item = this.kv.get(key);
    if (!item) return null;

    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.kv.delete(key);
      return null;
    }
    return item.value;
  }

  async del(key: string): Promise<number> {
    const deleted = this.kv.delete(key) || this.hashes.delete(key) || this.sortedSets.delete(key);
    return deleted ? 1 : 0;
  }

  async ttl(key: string): Promise<number> {
    const item = this.kv.get(key);
    if (!item) return -2; // Key does not exist
    if (!item.expiresAt) return -1; // Key exists without TTL
    const remaining = Math.ceil((item.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  // 2. Hashes (HSET / HGETALL)
  async hset(key: string, field: string, value: string): Promise<number> {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    const hash = this.hashes.get(key)!;
    const isNew = !hash.has(field);
    hash.set(field, value);
    return isNew ? 1 : 0;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.hashes.get(key);
    if (!hash) return {};
    return Object.fromEntries(hash.entries());
  }

  // 3. Distributed Redlock Algorithm Simulation (SET NX PX)
  async acquireLock(resource: string, ttlMs = 10000): Promise<LockResult> {
    const lockKey = `lock:${resource}`;
    const token = crypto.randomUUID();

    const existing = await this.get(lockKey);
    if (existing !== null) {
      return { acquired: false, resource, error: 'Resource currently locked' };
    }

    // Atomic SET NX PX
    await this.set(lockKey, token, Math.ceil(ttlMs / 1000));
    return { acquired: true, resource, token };
  }

  // Atomic Lua script unlock: release lock only if the token matches caller
  async releaseLock(resource: string, token: string): Promise<boolean> {
    const lockKey = `lock:${resource}`;
    const currentToken = await this.get(lockKey);
    if (currentToken === token) {
      await this.del(lockKey);
      return true;
    }
    return false;
  }

  // 4. Sliding Window Rate Limiting using Sorted Sets
  async slidingWindowRateLimit(key: string, limit = 5, windowMs = 60000): Promise<RateLimitResult> {
    const now = Date.now();
    const clearBefore = now - windowMs;
    const zKey = `ratelimit:${key}`;

    if (!this.sortedSets.has(zKey)) {
      this.sortedSets.set(zKey, []);
    }

    let zset = this.sortedSets.get(zKey)!;
    // Evict timestamps older than sliding window
    zset = zset.filter((entry) => entry.score > clearBefore);

    const currentRequests = zset.length;

    if (currentRequests >= limit) {
      this.sortedSets.set(zKey, zset);
      return {
        allowed: false,
        currentRequests,
        limit,
        remainingTtlMs: zset[0] ? Math.max(0, zset[0].score + windowMs - now) : windowMs
      };
    }

    // Add current request
    zset.push({ score: now, member: `${now}_${crypto.randomBytes(4).toString('hex')}` });
    this.sortedSets.set(zKey, zset);

    return {
      allowed: true,
      currentRequests: currentRequests + 1,
      limit,
      remainingTtlMs: windowMs
    };
  }

  // 5. Pub/Sub Channels
  subscribe(channel: string, listener: (message: string) => void): () => void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel)!.add(listener);

    return () => {
      this.subscribers.get(channel)?.delete(listener);
    };
  }

  publish(channel: string, message: string): number {
    const listeners = this.subscribers.get(channel);
    if (!listeners || listeners.size === 0) return 0;
    listeners.forEach((fn) => fn(message));
    return listeners.size;
  }
}

export const redis = new RedisEngine();
