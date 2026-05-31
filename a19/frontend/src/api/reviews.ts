import { apiClient } from './client';
import { Review, DiffFile, AnalysisResult, CreateReviewData } from '@/types';

export const reviewsApi = {
  async getReviews(projectId?: string, status?: string): Promise<Review[]> {
    const params = new URLSearchParams();
    if (projectId) params.append('projectId', projectId);
    if (status) params.append('status', status);
    
    const queryString = params.toString();
    const url = queryString ? `/reviews?${queryString}` : '/reviews';
    
    const response = await apiClient.get<{ reviews: Review[] }>(url);
    return response.data.reviews;
  },

  async getReview(id: string): Promise<Review> {
    const response = await apiClient.get<{ review: Review }>(`/reviews/${id}`);
    return response.data.review;
  },

  async createReview(data: CreateReviewData): Promise<Review> {
    const response = await apiClient.post<{ review: Review }>('/reviews', data);
    return response.data.review;
  },

  async updateStatus(id: string, status: string): Promise<Review> {
    const response = await apiClient.put<{ review: Review }>(`/reviews/${id}/status`, {
      status
    });
    return response.data.review;
  },

  async getDiff(id: string): Promise<DiffFile[]> {
    const response = await apiClient.get<{ diff: DiffFile[] }>(`/reviews/${id}/diff`);
    return response.data.diff;
  },

  async getAnalysis(id: string): Promise<AnalysisResult[]> {
    const response = await apiClient.get<{ analyses: AnalysisResult[] }>(`/reviews/${id}/analysis`);
    return response.data.analyses;
  },

  async assignReviewer(id: string, userId: string): Promise<void> {
    await apiClient.post(`/reviews/${id}/assign`, { userId });
  }
};
