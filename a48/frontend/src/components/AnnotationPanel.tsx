import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemButton,
  Divider,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Collapse,
  Button,
  Stack,
  Badge,
} from '@mui/material';
import {
  MessageOutlined,
  ExpandLess,
  ExpandMore,
  VerifiedUser,
  Unpublished,
  Sync,
  Analyze,
  Navigation,
  Delete,
  Edit,
} from '@mui/icons-material';
import { Annotation, AnnotationAnalysisResult, OCRResult } from '../types';
import { annotationApi } from '../services/api';

const ANNOTATION_TYPE_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  meipi: { color: '#d32f2f', bg: '#ffebee', label: '眉批' },
  jiapi: { color: '#c2185b', bg: '#fce4ec', label: '夹批' },
  weipi: { color: '#7b1fa2', bg: '#f3e5f5', label: '尾批' },
  pangzhu: { color: '#303f9f', bg: '#e8eaf6', label: '旁注' },
};

interface AnnotationPanelProps {
  documentId: number;
  ocrResults?: OCRResult[];
  onAnnotationSelect?: (annotation: Annotation) => void;
  onOCRFocus?: (ocrResultId: number) => void;
}

export const AnnotationPanel: React.FC<AnnotationPanelProps> = ({
  documentId,
  ocrResults,
  onAnnotationSelect,
  onOCRFocus,
}) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [analysis, setAnalysis] = useState<AnnotationAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);

  const loadAnnotations = async () => {
    setLoading(true);
    setError(null);
    try {
      const [anns, anal] = await Promise.all([
        annotationApi.getDocumentAnnotations(documentId),
        annotationApi.analyzeAnnotations(documentId),
      ]);
      setAnnotations(anns);
      setAnalysis(anal);
      const types = [...new Set(anns.map((a) => a.annotation_type))];
      const initialExpanded: Record<string, boolean> = {};
      types.forEach((t) => (initialExpanded[t] = true));
      setExpandedTypes(initialExpanded);
    } catch (err: any) {
      setError(err.message || '加载批注失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (documentId) {
      loadAnnotations();
    }
  }, [documentId]);

  const toggleType = (type: string) => {
    setExpandedTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const handleDetectAnnotations = async () => {
    setLoading(true);
    try {
      await annotationApi.detectAnnotations(documentId, true);
      await loadAnnotations();
    } catch (err: any) {
      setError(err.message || '检测批注失败');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkAnnotations = async () => {
    setLoading(true);
    try {
      await annotationApi.linkAnnotationsToText(documentId);
      await loadAnnotations();
    } catch (err: any) {
      setError(err.message || '关联批注失败');
    } finally {
      setLoading(false);
    }
  };

  const getLinkedOCRText = (ocrResultId?: number): string => {
    if (!ocrResultId || !ocrResults) return '';
    const ocr = ocrResults.find((o) => o.id === ocrResultId);
    if (!ocr) return '';
    return ocr.corrected_text || ocr.text;
  };

  const groupedAnnotations = annotations.reduce<Record<string, Annotation[]>>((acc, ann) => {
    if (filterType && ann.annotation_type !== filterType) return acc;
    if (!acc[ann.annotation_type]) acc[ann.annotation_type] = [];
    acc[ann.annotation_type].push(ann);
    return acc;
  }, {});

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={1}>
          <MessageOutlined color="primary" />
          <Typography variant="h6">批注导航</Typography>
          {analysis && (
            <Badge badgeContent={analysis.total_annotations} color="primary" sx={{ ml: 'auto' }}>
              <MessageOutlined />
            </Badge>
          )}
        </Stack>

        <Stack direction="row" spacing={1} mb={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Sync />}
            onClick={handleDetectAnnotations}
            disabled={loading}
          >
            检测批注
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Analyze />}
            onClick={handleLinkAnnotations}
            disabled={loading || annotations.length === 0}
          >
            关联正文
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={loadAnnotations}
            disabled={loading}
          >
            刷新
          </Button>
        </Stack>

        {analysis && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
            <Chip
              label={`已关联: ${analysis.linked_annotations}/${analysis.total_annotations}`}
              color={analysis.link_rate > 0.8 ? 'success' : analysis.link_rate > 0.5 ? 'warning' : 'default'}
              size="small"
            />
            <Chip
              label={`关联率: ${(analysis.link_rate * 100).toFixed(1)}%`}
              size="small"
            />
            <Chip
              label={`高置信度: ${analysis.high_confidence_count}`}
              color="info"
              size="small"
            />
          </Box>
        )}

        {Object.keys(ANNOTATION_TYPE_COLORS).map((type) => {
          const info = ANNOTATION_TYPE_COLORS[type];
          const count = analysis?.type_distribution[type] || 0;
          if (count === 0 && !filterType) return null;
          return (
            <Chip
              key={type}
              label={`${info.label} (${count})`}
              onClick={() => setFilterType(filterType === type ? null : type)}
              color={filterType === type ? 'primary' : 'default'}
              size="small"
              sx={{ mr: 0.5, mb: 0.5 }}
            />
          );
        })}
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && annotations.length === 0 && (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <MessageOutlined sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography color="text.secondary">
              暂无批注数据
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>
              点击"检测批注"按钮开始自动检测
            </Typography>
          </Box>
        )}

        {!loading && !error && Object.entries(groupedAnnotations).map(([type, typeAnns]) => {
          const typeInfo = ANNOTATION_TYPE_COLORS[type] || { color: '#666', bg: '#f5f5f5', label: type };
          return (
            <Box key={type}>
              <ListItemButton
                onClick={() => toggleType(type)}
                sx={{ bgcolor: typeInfo.bg }}
              >
                <ListItemIcon>
                  <Chip
                    label={typeInfo.label}
                    size="small"
                    sx={{ bgcolor: typeInfo.color, color: 'white' }}
                  />
                </ListItemIcon>
                <ListItemText primary={`${typeInfo.label} (${typeAnns.length})`} />
                {expandedTypes[type] ? <ExpandLess /> : <ExpandMore />}
              </ListItemButton>

              <Collapse in={expandedTypes[type]} timeout="auto" unmountOnExit>
                <List dense disablePadding>
                  {typeAnns.map((ann) => (
                    <React.Fragment key={ann.id}>
                      <ListItem
                        disablePadding
                        sx={{
                          bgcolor: selectedAnnotationId === ann.id ? 'action.selected' : 'transparent',
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                      >
                        <ListItemButton
                          onClick={() => {
                            setSelectedAnnotationId(ann.id);
                            onAnnotationSelect?.(ann);
                            if (ann.linked_text_region_id && onOCRFocus) {
                              onOCRFocus(ann.linked_text_region_id);
                            }
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            {ann.is_verified ? (
                              <VerifiedUser color="success" fontSize="small" />
                            ) : (
                              <Unpublished fontSize="small" color="action" />
                            )}
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                                  {ann.text || `批注 #${ann.id}`}
                                </Typography>
                                {ann.confidence !== undefined && (
                                  <Chip
                                    label={`${(ann.confidence * 100).toFixed(0)}%`}
                                    size="small"
                                    color={ann.confidence > 0.7 ? 'success' : ann.confidence > 0.4 ? 'warning' : 'default'}
                                    variant="outlined"
                                  />
                                )}
                              </Box>
                            }
                            secondary={
                              <Box>
                                <Typography variant="caption" color="text.secondary">
                                  位置: ({ann.x}, {ann.y}) {ann.width}x{ann.height}
                                </Typography>
                                {ann.linked_text_region_id && (
                                  <Typography
                                    variant="caption"
                                    display="block"
                                    color="primary"
                                    sx={{ mt: 0.5, fontStyle: 'italic' }}
                                  >
                                    关联: {getLinkedOCRText(ann.linked_text_region_id).slice(0, 20)}
                                    {getLinkedOCRText(ann.linked_text_region_id).length > 20 ? '...' : ''}
                                  </Typography>
                                )}
                                {(ann.proximity_score !== undefined || ann.semantic_score !== undefined) && (
                                  <Typography variant="caption" display="block" color="text.secondary">
                                    位置: {((ann.proximity_score || 0) * 100).toFixed(0)}% | 
                                    语义: {((ann.semantic_score || 0) * 100).toFixed(0)}%
                                  </Typography>
                                )}
                              </Box>
                            }
                          />
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {ann.linked_text_region_id && onOCRFocus && (
                              <Tooltip title="定位到正文">
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (ann.linked_text_region_id) {
                                      onOCRFocus(ann.linked_text_region_id);
                                    }
                                  }}
                                >
                                  <Navigation fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </ListItemButton>
                      </ListItem>
                      <Divider variant="inset" component="li" />
                    </React.Fragment>
                  ))}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
};
