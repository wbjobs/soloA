import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { roomManager } from './roomManager';
import { LogStorage } from './logStorage';
import { SignalingMessage, Permission } from './types';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json());

const PORT = 3000;

interface ClientInfo {
  userId: string;
  roomId: string;
  ws: WebSocket;
}

const clients = new Map<WebSocket, ClientInfo>();

app.post('/api/room/create', (req, res) => {
  const roomId = roomManager.createRoom();
  res.json({ roomId });
});

app.get('/api/room/:id/exists', (req, res) => {
  const exists = roomManager.getRoom(req.params.id) !== undefined;
  res.json({ exists });
});

app.get('/api/room/:id/participants', (req, res) => {
  const participants = roomManager.getParticipants(req.params.id);
  res.json({ participants });
});

app.get('/api/log/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  if (!LogStorage.exists(roomId)) {
    return res.status(404).json({ error: 'Log not found' });
  }
  const logs = LogStorage.read(roomId);
  res.json({ logs });
});

app.get('/api/log/:roomId/export', (req, res) => {
  const roomId = req.params.roomId;
  if (!LogStorage.exists(roomId)) {
    return res.status(404).json({ error: 'Log not found' });
  }
  const logs = LogStorage.read(roomId);
  const jsonData = JSON.stringify(logs, null, 2);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="session-${roomId}.json"`);
  res.send(jsonData);
});

app.get('/api/logs', (req, res) => {
  const path = require('path');
  const fs = require('fs');
  const LOG_DIR = path.join(process.cwd(), 'logs');

  if (!fs.existsSync(LOG_DIR)) {
    return res.json({ sessions: [] });
  }

  const files = fs.readdirSync(LOG_DIR).filter((f: string) => f.endsWith('.log'));
  const sessions = files.map((f: string) => {
    const roomId = f.replace('.log', '');
    const stats = fs.statSync(path.join(LOG_DIR, f));
    const logs = LogStorage.read(roomId);
    const duration = logs.length > 1
      ? logs[logs.length - 1].timestamp - logs[0].timestamp
      : 0;
    return {
      roomId,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      size: stats.size,
      entryCount: logs.length,
      duration,
    };
  });

  res.json({ sessions: sessions.sort((a: any, b: any) => b.modifiedAt - a.modifiedAt) });
});

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as SignalingMessage;
      handleMessage(ws, msg);
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (info) {
      roomManager.broadcastToRoom(info.roomId, {
        type: 'user-left',
        userId: info.userId,
      });
      roomManager.leaveRoom(info.roomId, info.userId);
      clients.delete(ws);
    }
  });
});

function handleMessage(ws: WebSocket, msg: SignalingMessage): void {
  switch (msg.type) {
    case 'join': {
      const user = roomManager.joinRoom(msg.roomId, msg.userName, ws);
      const participants = roomManager.getParticipants(msg.roomId);

      clients.set(ws, {
        userId: user.id,
        roomId: msg.roomId,
        ws,
      });

      ws.send(
        JSON.stringify({
          type: 'join-ack',
          success: true,
          roomId: msg.roomId,
          user,
          participants,
        })
      );

      roomManager.broadcastToRoom(
        msg.roomId,
        {
          type: 'user-joined',
          user,
        },
        user.id
      );
      break;
    }

    case 'set-permission': {
      const info = clients.get(ws);
      if (!info) return;

      const success = roomManager.setPermission(
        info.roomId,
        info.userId,
        msg.userId,
        msg.permission as Permission
      );

      if (success) {
        roomManager.broadcastToRoom(info.roomId, {
          type: 'permission-changed',
          userId: msg.userId,
          permission: msg.permission,
        });
      }
      break;
    }

    case 'rtc-offer':
    case 'rtc-answer':
    case 'rtc-candidate': {
      const info = clients.get(ws);
      if (!info) return;

      const room = roomManager.getRoom(info.roomId);
      if (!room) return;

      const target = room.participants.get(msg.toUserId);
      if (target && target.ws.readyState === 1) {
        const fromUserId = info.userId;
        const forward = { ...msg, fromUserId };
        target.ws.send(JSON.stringify(forward));
      }
      break;
    }

    case 'terminal-input': {
      const info = clients.get(ws);
      if (!info) return;
      roomManager.queueTerminalInput(info.roomId, info.userId, msg.data);
      break;
    }

    case 'cursor-update': {
      const info = clients.get(ws);
      if (!info) return;
      roomManager.updateCursor(info.roomId, info.userId, msg.cursor);
      roomManager.broadcastToRoom(
        info.roomId,
        {
          type: 'cursor-update',
          userId: info.userId,
          cursor: msg.cursor,
        },
        info.userId
      );
      break;
    }

    case 'resize': {
      const info = clients.get(ws);
      if (!info) return;
      const participant = roomManager.getRoom(info.roomId)?.participants.get(info.userId);
      if (participant && participant.user.permission !== 'read') {
        roomManager.resizeTerminal(info.roomId, msg.cols, msg.rows);
      }
      break;
    }
  }
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
