import prisma from '../config/db';
import { Comment, CommentReply, CommentTargetType } from '../types';
import { roomService } from './roomService';

export class CommentService {
  async getCommentsByScore(scoreId: string): Promise<Comment[]> {
    const comments = await prisma.comment.findMany({
      where: { scoreId },
      include: {
        user: {
          select: { id: true, username: true }
        },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: { id: true, username: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return comments.map(comment => this.mapComment(comment));
  }

  async createComment(
    scoreId: string,
    userId: string,
    data: {
      content: string;
      targetType: CommentTargetType;
      targetId?: string;
      staffIndex?: number;
      position?: number;
    }
  ): Promise<Comment> {
    const score = await prisma.score.findUnique({
      where: { id: scoreId }
    });

    if (!score) {
      throw new Error('乐谱不存在');
    }

    const comment = await prisma.comment.create({
      data: {
        scoreId,
        userId,
        content: data.content,
        targetType: data.targetType,
        targetId: data.targetId || null,
        staffIndex: data.staffIndex ?? null,
        position: data.position ?? null
      },
      include: {
        user: {
          select: { id: true, username: true }
        },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: { id: true, username: true }
            }
          }
        }
      }
    });

    const mappedComment = this.mapComment(comment);
    roomService.broadcastComment(scoreId, mappedComment, 'created');

    return mappedComment;
  }

  async updateComment(
    commentId: string,
    userId: string,
    data: {
      content?: string;
      resolved?: boolean;
    }
  ): Promise<Comment> {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId }
    });

    if (!comment) {
      throw new Error('评论不存在');
    }

    if (comment.userId !== userId) {
      throw new Error('无权修改此评论');
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: {
        content: data.content ?? undefined,
        resolved: data.resolved ?? undefined
      },
      include: {
        user: {
          select: { id: true, username: true }
        },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: { id: true, username: true }
            }
          }
        }
      }
    });

    const mappedComment = this.mapComment(updated);
    roomService.broadcastComment(comment.scoreId, mappedComment, 'updated');

    return mappedComment;
  }

  async deleteComment(commentId: string, userId: string): Promise<void> {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId }
    });

    if (!comment) {
      throw new Error('评论不存在');
    }

    if (comment.userId !== userId) {
      throw new Error('无权删除此评论');
    }

    const commentForBroadcast: Comment = {
      id: commentId,
      scoreId: comment.scoreId,
      userId: comment.userId,
      content: comment.content,
      targetType: comment.targetType as CommentTargetType,
      targetId: comment.targetId ?? undefined,
      staffIndex: comment.staffIndex ?? undefined,
      position: comment.position ?? undefined,
      resolved: comment.resolved,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      user: { id: userId, username: '' },
      replies: []
    };

    await prisma.comment.delete({
      where: { id: commentId }
    });

    roomService.broadcastComment(comment.scoreId, commentForBroadcast, 'deleted');
  }

  async addReply(
    commentId: string,
    userId: string,
    content: string
  ): Promise<CommentReply> {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId }
    });

    if (!comment) {
      throw new Error('评论不存在');
    }

    const reply = await prisma.commentReply.create({
      data: {
        commentId,
        userId,
        content
      },
      include: {
        user: {
          select: { id: true, username: true }
        }
      }
    });

    const mappedReply = this.mapReply(reply);
    roomService.broadcastCommentReply(comment.scoreId, mappedReply, 'created');

    return mappedReply;
  }

  async deleteReply(replyId: string, userId: string): Promise<void> {
    const reply = await prisma.commentReply.findUnique({
      where: { id: replyId },
      include: {
        comment: {
          select: { scoreId: true }
        }
      }
    });

    if (!reply) {
      throw new Error('回复不存在');
    }

    if (reply.userId !== userId) {
      throw new Error('无权删除此回复');
    }

    const replyForBroadcast: CommentReply = {
      id: replyId,
      commentId: reply.commentId,
      userId: reply.userId,
      content: reply.content,
      createdAt: reply.createdAt.toISOString(),
      user: { id: userId, username: '' }
    };

    await prisma.commentReply.delete({
      where: { id: replyId }
    });

    roomService.broadcastCommentReply(reply.comment.scoreId, replyForBroadcast, 'deleted');
  }

  private mapComment(comment: any): Comment {
    return {
      id: comment.id,
      scoreId: comment.scoreId,
      userId: comment.userId,
      content: comment.content,
      targetType: comment.targetType as CommentTargetType,
      targetId: comment.targetId ?? undefined,
      staffIndex: comment.staffIndex ?? undefined,
      position: comment.position ?? undefined,
      resolved: comment.resolved,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      user: {
        id: comment.user.id,
        username: comment.user.username
      },
      replies: comment.replies.map((reply: any) => this.mapReply(reply))
    };
  }

  private mapReply(reply: any): CommentReply {
    return {
      id: reply.id,
      commentId: reply.commentId,
      userId: reply.userId,
      content: reply.content,
      createdAt: reply.createdAt.toISOString(),
      user: {
        id: reply.user.id,
        username: reply.user.username
      }
    };
  }
}

export const commentService = new CommentService();
