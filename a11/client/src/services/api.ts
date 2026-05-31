import axios from 'axios';
import type {
  User,
  Note,
  NoteVersion,
  Folder,
  Comment,
  MentionableUser,
  ImportResult,
  LoginCredentials,
  RegisterCredentials
} from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<{ token: string; user: User }> => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  register: async (credentials: RegisterCredentials): Promise<{ token: string; user: User }> => {
    const response = await api.post('/auth/register', credentials);
    return response.data;
  },

  getCurrentUser: async (): Promise<{ user: User }> => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

export const notesApi = {
  getAll: async (folderId?: string | null): Promise<{ notes: Note[] }> => {
    const params = folderId ? { folderId } : {};
    const response = await api.get('/notes', { params });
    return response.data;
  },

  getById: async (id: string): Promise<{ note: Note }> => {
    const response = await api.get(`/notes/${id}`);
    return response.data;
  },

  create: async (data: { title?: string; content?: string; folderId?: string }): Promise<{ note: Note }> => {
    const response = await api.post('/notes', data);
    return response.data;
  },

  update: async (
    id: string,
    data: { title?: string; content?: string; folderId?: string; tags?: string[]; isStarred?: boolean; createVersion?: boolean; changeSummary?: string }
  ): Promise<{ note: Note }> => {
    const response = await api.put(`/notes/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/notes/${id}`);
  },

  getVersions: async (id: string): Promise<{ versions: NoteVersion[] }> => {
    const response = await api.get(`/notes/${id}/versions`);
    return response.data;
  },

  getVersion: async (noteId: string, versionId: string): Promise<{ version: NoteVersion }> => {
    const response = await api.get(`/notes/${noteId}/versions/${versionId}`);
    return response.data;
  },

  restoreVersion: async (noteId: string, versionId: string): Promise<{ note: Note }> => {
    const response = await api.post(`/notes/${noteId}/versions/${versionId}/restore`);
    return response.data;
  },

  updatePermissions: async (
    id: string,
    data: {
      permissions?: Record<string, string | null>;
      isPublic?: boolean;
      publicPermission?: 'none' | 'reader' | 'editor';
    }
  ): Promise<{ note: Note }> => {
    const response = await api.put(`/notes/${id}/permissions`, data);
    return response.data;
  },
};

export const foldersApi = {
  getAll: async (parentId?: string | null): Promise<{ folders: Folder[] }> => {
    const params = parentId !== undefined ? { parentId: parentId || 'null' } : {};
    const response = await api.get('/folders', { params });
    return response.data;
  },

  getTree: async (): Promise<{ tree: Folder[] }> => {
    const response = await api.get('/folders/tree');
    return response.data;
  },

  getById: async (id: string): Promise<{ folder: Folder; path: Array<{ id: string; name: string }> }> => {
    const response = await api.get(`/folders/${id}`);
    return response.data;
  },

  create: async (data: { name: string; description?: string; parentId?: string; color?: string; icon?: string }): Promise<{ folder: Folder }> => {
    const response = await api.post('/folders', data);
    return response.data;
  },

  update: async (
    id: string,
    data: { name?: string; description?: string; parentId?: string | null; color?: string; icon?: string; isStarred?: boolean; sortOrder?: number }
  ): Promise<{ folder: Folder }> => {
    const response = await api.put(`/folders/${id}`, data);
    return response.data;
  },

  delete: async (id: string, deleteNotes: boolean = false): Promise<{ message: string; deletedFolders: number }> => {
    const response = await api.delete(`/folders/${id}`, { params: { deleteNotes } });
    return response.data;
  },

  move: async (id: string, targetFolderId: string | null): Promise<{ folder: Folder }> => {
    const response = await api.post(`/folders/${id}/move`, { targetFolderId });
    return response.data;
  },
};

export const commentsApi = {
  getByNote: async (noteId: string): Promise<{ comments: Comment[]; mentionedUserIds: string[] }> => {
    const response = await api.get(`/comments/notes/${noteId}`);
    return response.data;
  },

  create: async (
    noteId: string,
    data: { content: string; parentId?: string; position?: any }
  ): Promise<{ comment: Comment }> => {
    const response = await api.post(`/comments/notes/${noteId}`, data);
    return response.data;
  },

  update: async (
    commentId: string,
    data: { content?: string; resolved?: boolean }
  ): Promise<{ comment: Comment }> => {
    const response = await api.put(`/comments/${commentId}`, data);
    return response.data;
  },

  delete: async (commentId: string): Promise<{ message: string }> => {
    const response = await api.delete(`/comments/${commentId}`);
    return response.data;
  },

  toggleReaction: async (commentId: string, emoji: string): Promise<{ reactions: any[]; toggledEmoji: string }> => {
    const response = await api.post(`/comments/${commentId}/reactions`, { emoji });
    return response.data;
  },

  getMentionableUsers: async (noteId: string, search?: string): Promise<{ users: MentionableUser[] }> => {
    const params = search ? { search } : {};
    const response = await api.get(`/comments/notes/${noteId}/mentionable-users`, { params });
    return response.data;
  },
};

export const importExportApi = {
  exportMarkdown: async (noteId: string): Promise<void> => {
    const response = await api.get(`/export/markdown/${noteId}`, { responseType: 'blob' });
    downloadFile(response.data, `${Date.now()}.md`, 'text/markdown');
  },

  exportHtml: async (noteId: string): Promise<void> => {
    const response = await api.get(`/export/html/${noteId}`, { responseType: 'blob' });
    downloadFile(response.data, `${Date.now()}.html`, 'text/html');
  },

  exportBatch: async (data: { noteIds?: string[]; folderId?: string; includeSubfolders?: boolean }): Promise<void> => {
    const response = await api.post('/export/batch/markdown', data, { responseType: 'blob' });
    downloadFile(response.data, `notes-export-${Date.now()}.json`, 'application/json');
  },

  importMarkdown: async (file: File, folderId?: string): Promise<{ note: Note; imported: boolean; wasNew: boolean }> => {
    const formData = new FormData();
    formData.append('file', file);
    if (folderId) {
      formData.append('folderId', folderId);
    }
    
    const response = await api.post('/import/markdown', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  importBatch: async (file: File, folderId?: string): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    if (folderId) {
      formData.append('folderId', folderId);
    }
    
    const response = await api.post('/import/batch', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
};

function downloadFile(blob: Blob, filename: string, mimeType: string): void {
  const url = window.URL.createObjectURL(new Blob([blob], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export default api;
