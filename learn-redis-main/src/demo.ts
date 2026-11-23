import { redis } from './redis-engine.js';

async function main() {
  console.log('=== Redis Architecture Masterclass Live Demo ===\n');

  // 1. Basic Key-Value with TTL
  console.log('1. Setting key with TTL:');
  await redis.set('session:user_101', JSON.stringify({ name: 'Alice', role: 'admin' }), 10);
  const session = await redis.get('session:user_101');
  const ttl = await redis.ttl('session:user_101');
  console.log(`Value: ${session}, TTL: ${ttl}s\n`);

  // 2. Distributed Redlock Algorithm
  console.log('2. Demonstrating Distributed Locking (Redlock):');
  const lock1 = await redis.acquireLock('order:checkout_99', 5000);
  console.log('Attempt 1 to acquire lock:', lock1);

  const lock2 = await redis.acquireLock('order:checkout_99', 5000);
  console.log('Attempt 2 to acquire lock (expected conflict):', lock2);

  if (lock1.acquired && lock1.token) {
    const released = await redis.releaseLock('order:checkout_99', lock1.token);
    console.log(`Lock released with valid token: ${released}`);
  }

  // 3. Sliding Window Rate Limiting
  console.log('\n3. Demonstrating Sliding Window Rate Limiting (Limit: 3 req / min):');
  for (let i = 1; i <= 5; i++) {
    const rateCheck = await redis.slidingWindowRateLimit('client_ip_192.168.1.1', 3, 60000);
    console.log(`Request #${i}: Allowed = ${rateCheck.allowed} (Count = ${rateCheck.currentRequests}/${rateCheck.limit})`);
  }

  console.log('\nDemo complete!');
}

main().catch(console.error);
