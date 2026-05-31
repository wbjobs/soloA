import { apiClient } from './client';
import { Project, Branch, CreateProjectData } from '@/types';

export const projectsApi = {
  async getProjects(): Promise<Project[]> {
    const response = await apiClient.get<{ projects: Project[] }>('/projects');
    return response.data.projects;
  },

  async getProject(id: string): Promise<Project> {
    const response = await apiClient.get<{ project: Project }>(`/projects/${id}`);
    return response.data.project;
  },

  async createProject(data: CreateProjectData): Promise<Project> {
    const response = await apiClient.post<{ project: Project }>('/projects', data);
    return response.data.project;
  },

  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    const response = await apiClient.put<{ project: Project }>(`/projects/${id}`, data);
    return response.data.project;
  },

  async deleteProject(id: string): Promise<void> {
    await apiClient.delete(`/projects/${id}`);
  },

  async getBranches(projectId: string): Promise<Branch[]> {
    const response = await apiClient.get<{ branches: Branch[] }>(`/projects/${projectId}/branches`);
    return response.data.branches;
  },

  async createBranch(projectId: string, name: string, baseBranch?: string): Promise<Branch> {
    const response = await apiClient.post<{ branch: Branch }>(`/projects/${projectId}/branches`, {
      name,
      baseBranch
    });
    return response.data.branch;
  }
};
