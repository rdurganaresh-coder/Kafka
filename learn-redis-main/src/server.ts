import http from 'node:http';
import { redis } from './redis-engine.js';

const port = Number(process.env.PORT) || 3000;

export function createRedisHttpServer(): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    const json = (data: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data, null, 2));
    };

    // 1. Health & SRE Telemetry
    if (url.pathname === '/health' && req.method === 'GET') {
      const mem = process.memoryUsage();
      return json({
        status: 'healthy',
        engine: 'Redis Architecture Masterclass',
        memoryUsageMb: Math.round(mem.heapUsed / 1024 / 1024),
        uptimeSeconds: Math.round(process.uptime())
      });
    }

    // 2. GET /api/v1/cache/:key
    if (url.pathname.startsWith('/api/v1/cache/') && req.method === 'GET') {
      const key = url.pathname.slice('/api/v1/cache/'.length);
      const val = await redis.get(key);
      const ttl = await redis.ttl(key);
      if (val === null) {
        return json({ success: false, error: `Key '${key}' not found or expired` }, 404);
      }
      return json({ success: true, key, value: val, ttlSeconds: ttl });
    }

    // 3. POST /api/v1/cache (SET key value [ttl])
    if (url.pathname === '/api/v1/cache' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body);
          if (!parsed.key || parsed.value === undefined) {
            return json({ success: false, error: 'Both key and value are required' }, 400);
          }
          await redis.set(parsed.key, String(parsed.value), parsed.ttlSeconds);
          return json({ success: true, key: parsed.key, ttlSeconds: parsed.ttlSeconds || -1 }, 201);
        } catch {
          return json({ success: false, error: 'Malformed JSON payload' }, 400);
        }
      });
      return;
    }

    // 4. POST /api/v1/lock/acquire
    if (url.pathname === '/api/v1/lock/acquire' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body);
          const result = await redis.acquireLock(parsed.resource || 'default', parsed.ttlMs || 10000);
          return json({ success: result.acquired, ...result }, result.acquired ? 200 : 409);
        } catch {
          return json({ success: false, error: 'Malformed JSON payload' }, 400);
        }
      });
      return;
    }

    // 5. POST /api/v1/lock/release
    if (url.pathname === '/api/v1/lock/release' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body);
          const released = await redis.releaseLock(parsed.resource, parsed.token);
          return json({ success: released, resource: parsed.resource });
        } catch {
          return json({ success: false, error: 'Malformed JSON payload' }, 400);
        }
      });
      return;
    }

    // 6. GET /api/v1/ratelimit/:userId
    if (url.pathname.startsWith('/api/v1/ratelimit/') && req.method === 'GET') {
      const userId = url.pathname.slice('/api/v1/ratelimit/'.length);
      const result = await redis.slidingWindowRateLimit(userId, 5, 60000);
      return json({ success: true, userId, ...result }, result.allowed ? 200 : 429);
    }

    return json({ success: false, error: 'Route not found' }, 404);
  });
}
