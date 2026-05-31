import axios from 'axios';
import {
  Document,
  OCRResult,
  ProcessingStatus,
  PipelineResult,
  DocumentImages,
  Annotation,
  StyleInfo,
  StyleTransferRequest,
  StyleTransferResponse,
  AnnotationAnalysisResult,
  StyleTransferHistory,
} from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

export const documentApi = {
  async listDocuments(status?: string, dynasty?: string): Promise<Document[]> {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (dynasty) params.dynasty = dynasty;
    const response = await api.get<Document[]>('/api/documents/', { params });
    return response.data;
  },

  async getDocument(id: number): Promise<Document> {
    const response = await api.get<Document>(`/api/documents/${id}`);
    return response.data;
  },

  async createDocument(formData: FormData): Promise<Document> {
    const response = await api.post<Document>('/api/documents/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async updateDocument(id: number, data: Partial<Document>): Promise<Document> {
    const response = await api.put<Document>(`/api/documents/${id}`, data);
    return response.data;
  },

  async deleteDocument(id: number): Promise<void> {
    await api.delete(`/api/documents/${id}`);
  },

  async getDocumentImages(id: number): Promise<{ document_id: number; images: DocumentImages }> {
    const response = await api.get(`/api/documents/${id}/images`);
    return response.data;
  },
};

export const pipelineApi = {
  async preprocess(id: number): Promise<ProcessingStatus> {
    const response = await api.post<ProcessingStatus>(`/api/pipeline/${id}/preprocess`);
    return response.data;
  },

  async inpaint(id: number): Promise<ProcessingStatus> {
    const response = await api.post<ProcessingStatus>(`/api/pipeline/${id}/inpaint`);
    return response.data;
  },

  async analyzeLayout(id: number): Promise<ProcessingStatus> {
    const response = await api.post<ProcessingStatus>(`/api/pipeline/${id}/analyze-layout`);
    return response.data;
  },

  async runOCR(id: number): Promise<ProcessingStatus> {
    const response = await api.post<ProcessingStatus>(`/api/pipeline/${id}/ocr`);
    return response.data;
  },

  async buildKnowledgeGraph(id: number): Promise<ProcessingStatus> {
    const response = await api.post<ProcessingStatus>(`/api/pipeline/${id}/knowledge-graph`);
    return response.data;
  },

  async runFullPipeline(id: number): Promise<PipelineResult> {
    const response = await api.post<PipelineResult>(`/api/pipeline/${id}/full`);
    return response.data;
  },
};

export const ocrApi = {
  async getDocumentOCR(documentId: number): Promise<OCRResult[]> {
    const response = await api.get<OCRResult[]>(`/api/ocr/document/${documentId}`);
    return response.data;
  },

  async getOCR(id: number): Promise<OCRResult> {
    const response = await api.get<OCRResult>(`/api/ocr/${id}`);
    return response.data;
  },

  async updateOCR(id: number, correctedText: string): Promise<OCRResult> {
    const response = await api.put<OCRResult>(`/api/ocr/${id}`, {
      corrected_text: correctedText,
      is_corrected: true,
    });
    return response.data;
  },

  async approveOCR(id: number): Promise<OCRResult> {
    const response = await api.post<OCRResult>(`/api/ocr/${id}/approve`);
    return response.data;
  },

  async rejectOCR(id: number): Promise<OCRResult> {
    const response = await api.post<OCRResult>(`/api/ocr/${id}/reject`);
    return response.data;
  },
};

export const annotationApi = {
  async getDocumentAnnotations(
    documentId: number,
    annotationType?: string,
    onlyLinked?: boolean
  ): Promise<Annotation[]> {
    const params: Record<string, any> = {};
    if (annotationType) params.annotation_type = annotationType;
    if (onlyLinked) params.only_linked = onlyLinked;
    const response = await api.get<Annotation[]>(`/api/annotations/document/${documentId}`, { params });
    return response.data;
  },

  async getAnnotation(id: number): Promise<Annotation> {
    const response = await api.get<Annotation>(`/api/annotations/${id}`);
    return response.data;
  },

  async createAnnotation(
    documentId: number,
    data: Partial<Annotation>
  ): Promise<Annotation> {
    const response = await api.post<Annotation>(`/api/annotations/?document_id=${documentId}`, data);
    return response.data;
  },

  async updateAnnotation(id: number, data: Partial<Annotation>): Promise<Annotation> {
    const response = await api.put<Annotation>(`/api/annotations/${id}`, data);
    return response.data;
  },

  async deleteAnnotation(id: number): Promise<void> {
    await api.delete(`/api/annotations/${id}`);
  },

  async detectAnnotations(documentId: number, autoLink = true): Promise<any> {
    const response = await api.post(`/api/annotations/document/${documentId}/detect?auto_link=${autoLink}`);
    return response.data;
  },

  async linkAnnotationsToText(documentId: number): Promise<any> {
    const response = await api.post(`/api/annotations/document/${documentId}/link`);
    return response.data;
  },

  async verifyAnnotation(id: number, verified = true): Promise<Annotation> {
    const response = await api.post<Annotation>(`/api/annotations/${id}/verify?verified=${verified}`);
    return response.data;
  },

  async analyzeAnnotations(documentId: number): Promise<AnnotationAnalysisResult> {
    const response = await api.get<AnnotationAnalysisResult>(
      `/api/annotations/document/${documentId}/analysis`
    );
    return response.data;
  },

  async getAnnotationsGroupedByText(documentId: number): Promise<{
    linked_groups: Array<{ ocr_result_id: number; text: string; annotations: Annotation[] }>;
    unlinked_annotations: Annotation[];
  }> {
    const response = await api.get(`/api/annotations/document/${documentId}/grouped-by-text`);
    return response.data;
  },
};

export const styleTransferApi = {
  async getStyles(): Promise<StyleInfo[]> {
    const response = await api.get<StyleInfo[]>('/api/style-transfer/styles');
    return response.data;
  },

  async transferStyle(request: StyleTransferRequest): Promise<StyleTransferResponse> {
    const response = await api.post<StyleTransferResponse>('/api/style-transfer/transfer', request);
    return response.data;
  },

  async transferStyleWithImage(
    text: string,
    styleName: string,
    strength: number,
    fontSize = 48
  ): Promise<any> {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('style_name', styleName);
    formData.append('strength', strength.toString());
    formData.append('font_size', fontSize.toString());
    const response = await api.post('/api/style-transfer/transfer/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async detectStyle(documentId?: number, ocrResultId?: number): Promise<any> {
    const params: Record<string, any> = {};
    if (documentId) params.document_id = documentId;
    if (ocrResultId) params.ocr_result_id = ocrResultId;
    const response = await api.post('/api/style-transfer/detect-style', null, { params });
    return response.data;
  },

  async previewStyle(request: StyleTransferRequest): Promise<any> {
    const response = await api.post('/api/style-transfer/preview', request);
    return response.data;
  },

  async applyToOcr(ocrResultId: number, styleName: string, strength: number): Promise<any> {
    const formData = new FormData();
    formData.append('style_name', styleName);
    formData.append('strength', strength.toString());
    const response = await api.post(
      `/api/style-transfer/apply-to-ocr/${ocrResultId}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  async getHistory(documentId: number): Promise<{ history: StyleTransferHistory[] }> {
    const response = await api.get(`/api/style-transfer/history/document/${documentId}`);
    return response.data;
  },
};

export default api;
