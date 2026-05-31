import { apiClient } from './client';
import { Comment, CreateCommentData } from '@/types';

export const commentsApi = {
  async getComments(reviewId: string, filePath?: string): Promise<Comment[]> {
    const params = new URLSearchParams();
    params.append('reviewId', reviewId);
    if (filePath) params.append('filePath', filePath);
    
    const response = await apiClient.get<{ comments: Comment[] }>(
      `/comments?${params.toString()}`
    );
    return response.data.comments;
  },

  async createComment(data: CreateCommentData): Promise<Comment> {
    const response = await apiClient.post<{ comment: Comment }>('/comments', data);
    return response.data.comment;
  },

  async updateComment(id: string, data: Partial<Comment>): Promise<Comment> {
    const response = await apiClient.put<{ comment: Comment }>(`/comments/${id}`, data);
    return response.data.comment;
  },

  async deleteComment(id: string): Promise<void> {
    await apiClient.delete(`/comments/${id}`);
  },

  async replyToComment(commentId: string, content: string): Promise<Comment> {
    const response = await apiClient.post<{ reply: Comment }>(`/comments/${commentId}/reply`, {
      content
    });
    return response.data.reply;
  },

  async resolveComment(id: string): Promise<Comment> {
    const response = await apiClient.post<{ comment: Comment }>(`/comments/${id}/resolve`);
    return response.data.comment;
  }
};
