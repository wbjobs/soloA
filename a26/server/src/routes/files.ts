import { FastifyInstance, FastifyRequest } from 'fastify';
import fs from 'fs';
import path from 'path';
import { fileService } from '../services/fileService';
import { ScoreData } from '../types';

interface AuthRequest extends FastifyRequest {
  user: { userId: string; username: string; email: string };
}

export async function fileRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (error) {
      reply.code(401).send({ error: '未授权' });
    }
  });

  app.post('/api/scores/:id/export', async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      fileType: 'musicxml' | 'midi';
      fileName: string;
      content: string;
    };

    if (!body.fileType || !body.fileName || !body.content) {
      return reply.code(400).send({ error: '缺少必要参数' });
    }

    try {
      const buffer = Buffer.from(body.content, 'base64');
      const result = await fileService.saveExportedFile(
        id,
        request.user.userId,
        body.fileName,
        body.fileType,
        buffer
      );

      return reply.code(201).send(result);
    } catch (error) {
      return reply.code(400).send({ 
        error: error instanceof Error ? error.message : '导出失败' 
      });
    }
  });

  app.get('/api/scores/:id/exports', async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };

    try {
      const history = await fileService.getExportHistory(id, request.user.userId);
      return reply.code(200).send({ exports: history });
    } catch (error) {
      return reply.code(400).send({ 
        error: error instanceof Error ? error.message : '获取导出历史失败' 
      });
    }
  });

  app.get('/api/files/download/:fileName', async (request: FastifyRequest, reply) => {
    const { fileName } = request.params as { fileName: string };

    try {
      const { filePath, originalName } = await fileService.getExportedFile(fileName);
      
      const fileStream = fs.createReadStream(filePath);
      
      reply.type('application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${originalName}"`);
      
      return reply.send(fileStream);
    } catch (error) {
      return reply.code(404).send({ 
        error: error instanceof Error ? error.message : '文件不存在' 
      });
    }
  });

  app.post('/api/scores/import', async (request: AuthRequest, reply) => {
    const body = request.body as {
      scoreData: ScoreData;
      title?: string;
    };

    if (!body.scoreData) {
      return reply.code(400).send({ error: '缺少乐谱数据' });
    }

    try {
      const result = await fileService.importScore(
        request.user.userId,
        body.scoreData,
        body.title || '导入的乐谱'
      );

      return reply.code(201).send(result);
    } catch (error) {
      return reply.code(400).send({ 
        error: error instanceof Error ? error.message : '导入失败' 
      });
    }
  });
}
