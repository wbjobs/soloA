import { FastifyInstance, FastifyRequest } from 'fastify';
import prisma from '../config/db';
import { ScoreData } from '../types';

interface AuthRequest extends FastifyRequest {
  user: { userId: string; username: string; email: string };
}

export async function scoreRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (error) {
      reply.code(401).send({ error: '未授权' });
    }
  });

  app.get('/api/scores', async (request: AuthRequest, reply) => {
    const scores = await prisma.score.findMany({
      where: { ownerId: request.user.userId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    return reply.code(200).send({ scores });
  });

  app.get('/api/scores/:id', async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    
    const score = await prisma.score.findUnique({
      where: { id },
      include: {
        operations: {
          orderBy: { version: 'asc' },
          include: {
            user: {
              select: { id: true, username: true }
            }
          }
        }
      }
    });

    if (!score) {
      return reply.code(404).send({ error: '乐谱不存在' });
    }

    if (score.ownerId !== request.user.userId) {
      return reply.code(403).send({ error: '无权访问此乐谱' });
    }

    return reply.code(200).send({
      id: score.id,
      title: score.title,
      data: score.data,
      createdAt: score.createdAt,
      updatedAt: score.updatedAt,
      operations: score.operations.map(op => ({
        id: op.id,
        type: op.type,
        operation: op.operation,
        timestamp: op.timestamp,
        version: op.version,
        user: {
          id: op.user.id,
          username: op.user.username
        }
      }))
    });
  });

  app.post('/api/scores', async (request: AuthRequest, reply) => {
    const body = request.body as { title?: string; data?: ScoreData };
    
    const defaultData: ScoreData = {
      title: body.title || '新建乐谱',
      staves: [
        { index: 0, clef: 'treble', key: 'C', timeSignature: '4/4' }
      ],
      notes: [],
      tempo: 120,
      version: 0
    };

    const score = await prisma.score.create({
      data: {
        title: body.title || '新建乐谱',
        data: body.data || defaultData,
        ownerId: request.user.userId
      }
    });

    return reply.code(201).send({
      id: score.id,
      title: score.title,
      data: score.data,
      createdAt: score.createdAt,
      updatedAt: score.updatedAt
    });
  });

  app.put('/api/scores/:id', async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { title?: string; data?: ScoreData };

    const existing = await prisma.score.findUnique({ where: { id } });
    
    if (!existing) {
      return reply.code(404).send({ error: '乐谱不存在' });
    }

    if (existing.ownerId !== request.user.userId) {
      return reply.code(403).send({ error: '无权修改此乐谱' });
    }

    const score = await prisma.score.update({
      where: { id },
      data: {
        title: body.title ?? existing.title,
        data: body.data ?? existing.data
      }
    });

    return reply.code(200).send({
      id: score.id,
      title: score.title,
      data: score.data,
      updatedAt: score.updatedAt
    });
  });

  app.delete('/api/scores/:id', async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.score.findUnique({ where: { id } });
    
    if (!existing) {
      return reply.code(404).send({ error: '乐谱不存在' });
    }

    if (existing.ownerId !== request.user.userId) {
      return reply.code(403).send({ error: '无权删除此乐谱' });
    }

    await prisma.$transaction([
      prisma.operation.deleteMany({ where: { scoreId: id } }),
      prisma.score.delete({ where: { id } })
    ]);

    return reply.code(204).send();
  });

  app.get('/api/scores/:id/history', async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };

    const score = await prisma.score.findUnique({ 
      where: { id },
      select: { ownerId: true }
    });
    
    if (!score) {
      return reply.code(404).send({ error: '乐谱不存在' });
    }

    if (score.ownerId !== request.user.userId) {
      return reply.code(403).send({ error: '无权访问此乐谱历史' });
    }

    const operations = await prisma.operation.findMany({
      where: { scoreId: id },
      orderBy: { version: 'desc' },
      include: {
        user: {
          select: { id: true, username: true }
        }
      },
      take: 100
    });

    return reply.code(200).send({
      history: operations.map(op => ({
        id: op.id,
        type: op.type,
        operation: op.operation,
        timestamp: op.timestamp,
        version: op.version,
        user: {
          id: op.user.id,
          username: op.user.username
        }
      }))
    });
  });
}
