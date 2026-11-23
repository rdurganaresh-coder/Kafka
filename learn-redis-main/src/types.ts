export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  ttlSeconds?: number;
  createdAt: number;
}

export interface LockResult {
  acquired: boolean;
  resource: string;
  token?: string;
  error?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  currentRequests: number;
  limit: number;
  remainingTtlMs: number;
}
