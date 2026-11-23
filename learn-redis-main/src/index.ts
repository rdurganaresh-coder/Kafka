import { createRedisHttpServer } from './server.js';

const port = Number(process.env.PORT) || 3000;
const server = createRedisHttpServer();

server.listen(port, () => {
  console.log(`[learn-redis] Redis In-Memory Architecture Server listening on port ${port}`);
  console.log(`[learn-redis] Health endpoint: http://localhost:${port}/health`);
  console.log(`[learn-redis] Cache endpoint: http://localhost:${port}/api/v1/cache`);
});
