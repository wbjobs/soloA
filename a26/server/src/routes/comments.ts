import { FastifyInstance, FastifyRequest } from 'fastify';
import { commentService } from '../services/commentService';
import { CommentTargetType } from '../types';

interface AuthRequest extends FastifyRequest {
  user: { userId: string; username: string; email: string };
}

export async function commentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (error) {
      reply.code(401).send({ error: '未授权' });
    }
  });

  app.get('/api/scores/:id/comments', async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };

    try {
      const comments = await commentService.getCommentsByScore(id);
      return reply.code(200).send({ comments });
    } catch (error) {
      return reply.code(404).send({ 
        error: error instanceof Error ? error.message : '获取评论失败' 
      });
    }
  });

  app.post('/api/scores/:id/comments', async (request: AuthRequest, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      content: string;
      targetType: CommentTargetType;
      targetId?: string;
      staffIndex?: number;
      position?: number;
    };

    if (!body.content) {
      return reply.code(400).send({ error: '评论内容不能为空' });
    }

    if (!body.targetType) {
      return reply.code(400).send({ error: '必须指定目标类型' });
    }

    try {
      const comment = await commentService.createComment(
        id,
        request.user.userId,
        {
          content: body.content,
          targetType: body.targetType,
          targetId: body.targetId,
          staffIndex: body.staffIndex,
          position: body.position
        }
      );

      return reply.code(201).send({ comment });
    } catch (error) {
      return reply.code(400).send({ 
        error: error instanceof Error ? error.message : '创建评论失败' 
      });
    }
  });

  app.put('/api/comments/:commentId', async (request: AuthRequest, reply) => {
    const { commentId } = request.params as { commentId: string };
    const body = request.body as {
      content?: string;
      resolved?: boolean;
    };

    try {
      const comment = await commentService.updateComment(
        commentId,
        request.user.userId,
        {
          content: body.content,
          resolved: body.resolved
        }
      );

      return reply.code(200).send({ comment });
    } catch (error) {
      return reply.code(400).send({ 
        error: error instanceof Error ? error.message : '更新评论失败' 
      });
    }
  });

  app.delete('/api/comments/:commentId', async (request: AuthRequest, reply) => {
    const { commentId } = request.params as { commentId: string };

    try {
      await commentService.deleteComment(commentId, request.user.userId);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ 
        error: error instanceof Error ? error.message : '删除评论失败' 
      });
    }
  });

  app.post('/api/comments/:commentId/replies', async (request: AuthRequest, reply) => {
    const { commentId } = request.params as { commentId: string };
    const body = request.body as { content: string };

    if (!body.content) {
      return reply.code(400).send({ error: '回复内容不能为空' });
    }

    try {
      const replyData = await commentService.addReply(
        commentId,
        request.user.userId,
        body.content
      );

      return reply.code(201).send({ reply: replyData });
    } catch (error) {
      return reply.code(400).send({ 
        error: error instanceof Error ? error.message : '添加回复失败' 
      });
    }
  });

  app.delete('/api/replies/:replyId', async (request: AuthRequest, reply) => {
    const { replyId } = request.params as { replyId: string };

    try {
      await commentService.deleteReply(replyId, request.user.userId);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ 
        error: error instanceof Error ? error.message : '删除回复失败' 
      });
    }
  });
}
