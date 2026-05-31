import { FastifyInstance, FastifyRequest } from 'fastify';
import prisma from '../config/db';
import { diffService } from '../services/diffService';
import { ScoreData } from '../types';

interface AuthRequest extends FastifyRequest {
  user: { userId: string; username: string; email: string };
}

export async function diffRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (error) {
      reply.code(401).send({ error: '未授权' });
    }
  });

  app.get('/api/scores/:id/diff', async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { 
      oldVersion?: string; 
      newVersion?: string 
    };

    const score = await prisma.score.findUnique({ 
      where: { id },
      select: { ownerId: true, data: true }
    });
    
    if (!score) {
      return reply.code(404).send({ error: '乐谱不存在' });
    }

    if (score.ownerId !== request.user.userId) {
      return reply.code(403).send({ error: '无权访问此乐谱' });
    }

    try {
      const operations = await prisma.operation.findMany({
        where: { scoreId: id },
        orderBy: { version: 'asc' }
      });

      let oldVersion = parseInt(query.oldVersion || '0', 10);
      let newVersion = query.newVersion 
        ? parseInt(query.newVersion, 10) 
        : (score.data as ScoreData).version;

      if (oldVersion >= newVersion) {
        return reply.code(400).send({ 
          error: '旧版本必须小于新版本' 
        });
      }

      const operationsInRange = operations.filter(
        op => op.version > oldVersion && op.version <= newVersion
      );

      if (operationsInRange.length === 0) {
        const scoreData = score.data as ScoreData;
        return reply.code(200).send({
          diff: {
            notes: [],
            staves: [],
            tempo: undefined,
            oldVersion,
            newVersion: scoreData.version
          },
          summary: {
            added: 0,
            removed: 0,
            modified: 0,
            moved: 0
          }
        });
      }

      let oldScore: ScoreData = {
        title: (score.data as ScoreData).title,
        staves: (score.data as ScoreData).staves,
        notes: [],
        tempo: (score.data as ScoreData).tempo,
        version: oldVersion
      };

      const allNotes = (score.data as ScoreData).notes;
      const oldNotes = allNotes.filter(note => {
        const noteOps = operationsInRange.filter(op => {
          if (op.type === 'add_note') {
            return (op.operation as any).note?.id === note.id;
          }
          return false;
        });
        return noteOps.length === 0;
      });

      oldScore.notes = oldNotes;

      const diff = diffService.computeDiff(oldScore, score.data as ScoreData);
      const summary = diffService.getDiffSummary(diff);

      return reply.code(200).send({
        diff,
        summary
      });
    } catch (error) {
      return reply.code(400).send({ 
        error: error instanceof Error ? error.message : '计算差异失败' 
      });
    }
  });

  app.get('/api/scores/:id/versions', async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };

    const score = await prisma.score.findUnique({ 
      where: { id },
      select: { ownerId: true, data: true }
    });
    
    if (!score) {
      return reply.code(404).send({ error: '乐谱不存在' });
    }

    if (score.ownerId !== request.user.userId) {
      return reply.code(403).send({ error: '无权访问此乐谱' });
    }

    try {
      const operations = await prisma.operation.findMany({
        where: { scoreId: id },
        orderBy: { version: 'desc' },
        include: {
          user: {
            select: { id: true, username: true }
          }
        },
        take: 50
      });

      const currentScore = score.data as ScoreData;
      const versions = [
        {
          version: currentScore.version,
          timestamp: new Date().toISOString(),
          user: { id: score.ownerId, username: '当前版本' },
          type: 'current',
          description: '当前版本'
        }
      ];

      for (const op of operations) {
        let description = '';
        switch (op.type) {
          case 'add_note':
            const addNote = (op.operation as any).note;
            description = `添加 ${addNote?.pitch || ''}${addNote?.octave || ''}`;
            break;
          case 'delete_note':
            const delNote = (op.operation as any).oldNote || (op.operation as any);
            description = '删除音符';
            break;
          case 'update_note':
            description = '修改音符';
            break;
          case 'update_tempo':
            description = `修改速度: ${(op.operation as any).tempo} BPM`;
            break;
          default:
            description = op.type;
        }

        versions.push({
          version: op.version,
          timestamp: op.timestamp.toISOString(),
          user: {
            id: op.user.id,
            username: op.user.username
          },
          type: op.type,
          description
        });
      }

      return reply.code(200).send({ versions });
    } catch (error) {
      return reply.code(400).send({ 
        error: error instanceof Error ? error.message : '获取版本列表失败' 
      });
    }
  });
}
