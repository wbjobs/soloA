import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';

import { initDatabase } from './database';
import { SignalingServer } from './signaling';
import { createRoutes } from './routes';

dotenv.config();

const PORT = parseInt(process.env.PORT || '8080');

async function main() {
  console.log('Initializing database...');
  await initDatabase();
  console.log('Database initialized.');

  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  const signalingServer = new SignalingServer(wss);
  const routes = createRoutes(signalingServer);

  app.use('/api', routes);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`API: http://localhost:${PORT}/api`);
  });

  const shutdown = () => {
    console.log('Shutting down...');
    signalingServer.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(console.error);
