import fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import jwt from '@fastify/jwt';
import { authRoutes } from './routes/auth';
import { scoreRoutes } from './routes/scores';
import { commentRoutes } from './routes/comments';
import { fileRoutes } from './routes/files';
import { diffRoutes } from './routes/diffs';
import { WebSocketManager } from './websocket/connection';
import config from './config/env';

const app = fastify({
  logger: true
});

async function start() {
  try {
    await app.register(cors, {
      origin: true,
      credentials: true
    });

    await app.register(jwt, {
      secret: config.jwtSecret
    });

    await app.register(websocket);

    app.decorateRequest('user', null);

    await app.register(authRoutes);
    await app.register(scoreRoutes);
    await app.register(commentRoutes);
    await app.register(fileRoutes);
    await app.register(diffRoutes);

    const wsManager = new WebSocketManager(app);

    app.get('/ws', { websocket: true }, (connection, request) => {
      wsManager.handleConnection(connection, request);
    });

    app.get('/health', async () => {
      return { status: 'ok' };
    });

    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`Server running on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
