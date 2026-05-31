import React, { useState, useEffect, useCallback } from 'react';
import {
  Target, MessageSquare, CheckCircle, XCircle, Edit3, Trash2, Plus,
  ChevronDown, ChevronUp, Circle, Square, Minus, Type, ArrowRight
} from 'lucide-react';
import type { Annotation, AnnotationType, ReviewStatus, Series, Instance } from '../types';
import { annotationApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

interface AnnotationPanelProps {
  series: Series | null;
  instances: Instance[];
  currentIndex: number;
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
  onAnnotationSelect?: (annotation: Annotation) => void;
}

const annotationTypeIcons: Record<AnnotationType, React.ReactNode> = {
  nodule: <Target className="w-4 h-4" />,
  lesion: <Target className="w-4 h-4" />,
  lymph_node: <Circle className="w-4 h-4" />,
  calcification: <Square className="w-4 h-4" />,
  text: <Type className="w-4 h-4" />,
  arrow: <ArrowRight className="w-4 h-4" />,
  circle: <Circle className="w-4 h-4" />,
  rectangle: <Square className="w-4 h-4" />,
  line: <Minus className="w-4 h-4" />,
  angle: <Minus className="w-4 h-4" />,
};

const annotationTypeLabels: Record<AnnotationType, string> = {
  nodule: '结节',
  lesion: '病灶',
  lymph_node: '淋巴结',
  calcification: '钙化',
  text: '文字',
  arrow: '箭头',
  circle: '圆形',
  rectangle: '矩形',
  line: '直线',
  angle: '角度',
};

const reviewStatusColors: Record<ReviewStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  agree: 'bg-green-500/20 text-green-400',
  disagree: 'bg-red-500/20 text-red-400',
  modified: 'bg-blue-500/20 text-blue-400',
};

const reviewStatusLabels: Record<ReviewStatus, string> = {
  pending: '待评审',
  agree: '同意',
  disagree: '不同意',
  modified: '已修改',
};

const AnnotationPanel: React.FC<AnnotationPanelProps> = ({
  series,
  instances,
  currentIndex,
  annotations,
  onAnnotationsChange,
  onAnnotationSelect,
}) => {
  const { user } = useAuthStore();
  const [expanded, setExpanded] = useState(true);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAnnotation, setNewAnnotation] = useState({
    annotation_type: 'nodule' as AnnotationType,
    description: '',
    pathology: '',
    coordinates: { x: 256, y: 256, width: 30, height: 30 },
  });
  const [reviews, setReviews] = useState<Record<number, any[]>>({});
  const [showReviewForm, setShowReviewForm] = useState<number | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('agree');
  const [reviewComment, setReviewComment] = useState('');
  const [loading, setLoading] = useState(false);

  const currentInstance = instances[currentIndex];

  const loadAnnotations = useCallback(async () => {
    if (!series) return;
    try {
      setLoading(true);
      const res = await annotationApi.getBySeries(series.id);
      onAnnotationsChange(res.data);
    } catch (e) {
      console.error('Failed to load annotations:', e);
    } finally {
      setLoading(false);
    }
  }, [series, onAnnotationsChange]);

  useEffect(() => {
    if (series) {
      loadAnnotations();
    }
  }, [series, loadAnnotations]);

  const loadReviews = useCallback(async (annotationId: number) => {
    try {
      const res = await annotationApi.getReviews(annotationId);
      setReviews((prev) => ({ ...prev, [annotationId]: res.data }));
    } catch (e) {
      console.error('Failed to load reviews:', e);
    }
  }, []);

  const handleCreateAnnotation = async () => {
    if (!series || !currentInstance) return;

    try {
      const res = await annotationApi.create({
        series_id: series.id,
        instance_id: currentInstance.id,
        annotation_type: newAnnotation.annotation_type,
        coordinates: newAnnotation.coordinates,
        description: newAnnotation.description,
        pathology: newAnnotation.pathology,
        is_draft: true,
      });

      setShowCreateForm(false);
      setNewAnnotation({
        annotation_type: 'nodule',
        description: '',
        pathology: '',
        coordinates: { x: 256, y: 256, width: 30, height: 30 },
      });

      await loadAnnotations();
    } catch (e) {
      console.error('Failed to create annotation:', e);
    }
  };

  const handleDeleteAnnotation = async (annotation: Annotation) => {
    if (!confirm('确定要删除此标注吗？')) return;
    try {
      await annotationApi.delete(annotation.id);
      await loadAnnotations();
      if (selectedAnnotation?.id === annotation.id) {
        setSelectedAnnotation(null);
      }
    } catch (e) {
      console.error('Failed to delete annotation:', e);
    }
  };

  const handleSubmitReview = async () => {
    if (!showReviewForm) return;
    try {
      await annotationApi.createReview({
        annotation_id: showReviewForm,
        status: reviewStatus,
        comment: reviewComment,
      });
      setShowReviewForm(null);
      setReviewStatus('agree');
      setReviewComment('');
      await loadReviews(showReviewForm);
    } catch (e) {
      console.error('Failed to submit review:', e);
    }
  };

  const handleFinalizeAnnotation = async (annotation: Annotation) => {
    try {
      await annotationApi.finalize(annotation.id);
      await loadAnnotations();
    } catch (e) {
      console.error('Failed to finalize annotation:', e);
    }
  };

  const currentInstanceAnnotations = annotations.filter(
    (a) => a.instance_id === currentInstance?.id
  );

  const getConsensusStatus = (annotation: Annotation) => {
    const annReviews = reviews[annotation.id] || [];
    if (annReviews.length === 0) return null;

    const agreeCount = annReviews.filter((r) => r.status === 'agree').length;
    const disagreeCount = annReviews.filter((r) => r.status === 'disagree').length;

    if (agreeCount >= 2) return 'consensus';
    if (disagreeCount >= 2) return 'dispute';
    return 'reviewing';
  };

  return (
    <div className="bg-slate-900/50 border-l border-slate-800 w-80 flex flex-col">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-4 py-3 border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-orange-400" />
          <span className="text-white font-medium">影像标注</span>
          <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">
            {annotations.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-800">
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              disabled={!currentInstance}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              添加标注
            </button>
          </div>

          {showCreateForm && (
            <div className="p-3 border-b border-slate-800 bg-slate-800/30 space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">标注类型</label>
                <select
                  value={newAnnotation.annotation_type}
                  onChange={(e) => setNewAnnotation({ ...newAnnotation, annotation_type: e.target.value as AnnotationType })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white"
                >
                  {(Object.keys(annotationTypeLabels) as AnnotationType[]).map((type) => (
                    <option key={type} value={type}>{annotationTypeLabels[type]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">描述</label>
                <input
                  type="text"
                  value={newAnnotation.description}
                  onChange={(e) => setNewAnnotation({ ...newAnnotation, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white"
                  placeholder="标注描述..."
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">病理类型</label>
                <input
                  type="text"
                  value={newAnnotation.pathology}
                  onChange={(e) => setNewAnnotation({ ...newAnnotation, pathology: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white"
                  placeholder="如：肺腺癌、炎症、良性结节..."
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateAnnotation}
                  className="flex-1 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors"
                >
                  保存
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {loading ? (
              <div className="text-center py-8 text-slate-500">加载中...</div>
            ) : annotations.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                暂无标注。当前切片：{currentIndex + 1}
              </div>
            ) : (
              annotations.map((annotation) => {
                const consensus = getConsensusStatus(annotation);
                const isCurrentSlice = annotation.instance_id === currentInstance?.id;

                return (
                  <div
                    key={annotation.id}
                    onClick={() => {
                      setSelectedAnnotation(annotation);
                      onAnnotationSelect?.(annotation);
                      loadReviews(annotation.id);
                    }}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedAnnotation?.id === annotation.id
                        ? 'bg-orange-500/20 border border-orange-500/30'
                        : isCurrentSlice
                        ? 'bg-slate-800 hover:bg-slate-700/50'
                        : 'bg-slate-800/50 hover:bg-slate-700/50 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {annotationTypeIcons[annotation.annotation_type]}
                        <div>
                          <div className="text-white text-sm font-medium">
                            {annotationTypeLabels[annotation.annotation_type]}
                            {annotation.is_draft && (
                              <span className="ml-2 text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">
                                草稿
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            切片 {instances.findIndex((i) => i.id === annotation.instance_id) + 1}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {consensus === 'consensus' && (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        )}
                        {consensus === 'dispute' && (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}

                        {user?.id === annotation.created_by && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAnnotation(annotation);
                            }}
                            className="p-1 hover:bg-red-500/20 rounded transition-colors"
                          >
                            <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-400" />
                          </button>
                        )}
                      </div>
                    </div>

                    {annotation.description && (
                      <div className="mt-1 text-xs text-slate-400">
                        {annotation.description}
                      </div>
                    )}

                    {annotation.pathology && (
                      <div className="mt-1 text-xs text-cyan-400">
                        {annotation.pathology}
                      </div>
                    )}

                    {(reviews[annotation.id] || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {reviews[annotation.id].map((review: any, idx: number) => (
                          <span
                            key={idx}
                            className={`text-xs px-1.5 py-0.5 rounded ${reviewStatusColors[review.status]}`}
                          >
                            {reviewStatusLabels[review.status]}
                          </span>
                        ))}
                      </div>
                    )}

                    {selectedAnnotation?.id === annotation.id && (
                      <div className="mt-3 pt-3 border-t border-slate-700">
                        {annotation.is_draft && user?.id === annotation.created_by && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFinalizeAnnotation(annotation);
                            }}
                            className="w-full mb-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                          >
                            终结标注（提交评审）
                          </button>
                        )}

                        {!annotation.is_draft && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowReviewForm(showReviewForm === annotation.id ? null : annotation.id);
                              }}
                              className="w-full mb-2 flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                            >
                              <MessageSquare className="w-3 h-3" />
                              添加评审意见
                            </button>

                            {showReviewForm === annotation.id && (
                              <div className="space-y-2">
                                <select
                                  value={reviewStatus}
                                  onChange={(e) => setReviewStatus(e.target.value as ReviewStatus)}
                                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-white"
                                >
                                  <option value="agree">同意</option>
                                  <option value="disagree">不同意</option>
                                  <option value="modified">建议修改</option>
                                </select>
                                <textarea
                                  value={reviewComment}
                                  onChange={(e) => setReviewComment(e.target.value)}
                                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-white resize-none"
                                  rows={2}
                                  placeholder="评审意见..."
                                />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSubmitReview();
                                  }}
                                  className="w-full px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                                >
                                  提交评审
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnotationPanel;
