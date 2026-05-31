import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Button,
  Box,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ImageIcon from '@mui/icons-material/Image';
import GridViewIcon from '@mui/icons-material/GridView';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import MessageOutlinedIcon from '@mui/icons-material/MessageOutlined';
import PaletteIcon from '@mui/icons-material/Palette';
import { documentApi, pipelineApi } from '../services/api';
import { Document, DocumentImages, Entity, EntityRelation, Annotation } from '../types';
import SplitView from '../components/SplitView';
import LayoutOverlay from '../components/LayoutOverlay';
import { AnnotationPanel } from '../components/AnnotationPanel';
import { StyleTransferPreview } from '../components/StyleTransferPreview';

const ENTITY_TYPE_LABELS: Record<string, string> = {
  PERSON: '人物',
  GPE: '地名',
  Position: '官职',
  Dynasty: '朝代',
};

const RELATION_TYPE_LABELS: Record<string, string> = {
  holds_position: '担任官职',
  from_place: '来自',
  in_dynasty: '朝代',
};

const DocumentViewer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const documentId = parseInt(id || '0');
  const navigate = useNavigate();

  const [document, setDocument] = useState<Document | null>(null);
  const [images, setImages] = useState<DocumentImages>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [rightTab, setRightTab] = useState(0);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);

  const handleAnnotationSelect = (annotation: Annotation) => {
    setSelectedAnnotation(annotation);
  };

  const handleOCRFocus = (ocrResultId: number) => {
    console.log('Focusing OCR:', ocrResultId);
  };

  const loadDocument = async () => {
    try {
      setLoading(true);
      const [doc, imgResponse] = await Promise.all([
        documentApi.getDocument(documentId),
        documentApi.getDocumentImages(documentId),
      ]);
      setDocument(doc);
      setImages(imgResponse.images);
      setError(null);
    } catch (err) {
      setError('加载文档失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (documentId) {
      loadDocument();
    }
  }, [documentId]);

  const handleRunPipeline = async () => {
    try {
      setProcessing(true);
      await pipelineApi.runFullPipeline(documentId);
      loadDocument();
    } catch (err) {
      setError('运行流水线失败');
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const handleStepAction = async (step: 'preprocess' | 'inpaint' | 'layout' | 'ocr' | 'kg') => {
    try {
      setProcessing(true);
      switch (step) {
        case 'preprocess':
          await pipelineApi.preprocess(documentId);
          break;
        case 'inpaint':
          await pipelineApi.inpaint(documentId);
          break;
        case 'layout':
          await pipelineApi.analyzeLayout(documentId);
          break;
        case 'ocr':
          await pipelineApi.runOCR(documentId);
          break;
        case 'kg':
          await pipelineApi.buildKnowledgeGraph(documentId);
          break;
      }
      loadDocument();
    } catch (err) {
      setError(`操作失败: ${step}`);
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const handleImageLoad = (dims: { width: number; height: number }) => {
    setImageDimensions(dims);
  };

  const getEntityLabel = (type: string) => ENTITY_TYPE_LABELS[type] || type;
  const getRelationLabel = (type: string) => RELATION_TYPE_LABELS[type] || type;

  if (loading) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Container>
    );
  }

  if (!document) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">文档不存在</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <IconButton onClick={() => navigate('/documents')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {document.title}
        </Typography>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={handleRunPipeline}
          disabled={processing}
        >
          {processing ? '处理中...' : '运行完整流水线'}
        </Button>
        {document.ocr_results.length > 0 && (
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => navigate(`/documents/${documentId}/ocr`)}
          >
            OCR校对
          </Button>
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2, mb: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <ImageIcon color="primary" />
              <Typography variant="h6">图像查看</Typography>
            </Stack>
            <SplitView images={images} onImageLoad={handleImageLoad} />
          </Paper>

          {document.layout_analysis.length > 0 && (
            <Paper sx={{ p: 2, mb: 3 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <GridViewIcon color="primary" />
                <Typography variant="h6">版面分析结果</Typography>
              </Stack>
              {(images.processed || images.inpainted || images.original) && imageDimensions && (
                <Box sx={{ position: 'relative' }}>
                  <img
                    src={images.processed || images.inpainted || images.original}
                    alt="Document with layout"
                    style={{ maxWidth: '100%', display: 'block' }}
                    onLoad={(e) =>
                      setImageDimensions({
                        width: e.currentTarget.naturalWidth,
                        height: e.currentTarget.naturalHeight,
                      })
                    }
                  />
                  <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                    <LayoutOverlay
                      regions={document.layout_analysis}
                      imageDimensions={imageDimensions}
                      showLabels={true}
                    />
                  </Box>
                </Box>
              )}
            </Paper>
          )}
        </Grid>

        <Grid item xs={12} lg={4}>
          <Box sx={{ height: 'calc(100vh - 200px)', minHeight: 600 }}>
            <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Tabs
                value={rightTab}
                onChange={(_e, newValue) => setRightTab(newValue)}
                variant="fullWidth"
                sx={{ borderBottom: 1, borderColor: 'divider' }}
              >
                <Tab icon={<MessageOutlinedIcon />} label="批注" />
                <Tab icon={<PaletteIcon />} label="风格迁移" />
                <Tab icon={<AccountTreeIcon />} label="文档信息" />
              </Tabs>

              <Box sx={{ flex: 1, overflow: 'hidden' }}>
                {rightTab === 0 && (
                  <AnnotationPanel
                    documentId={documentId}
                    ocrResults={document.ocr_results}
                    onAnnotationSelect={handleAnnotationSelect}
                    onOCRFocus={handleOCRFocus}
                  />
                )}

                {rightTab === 1 && (
                  <StyleTransferPreview
                    documentId={documentId}
                  />
                )}

                {rightTab === 2 && (
                  <Box sx={{ p: 2, overflow: 'auto', height: '100%' }}>
                    <Paper sx={{ p: 2, mb: 2 }}>
                      <Typography variant="h6" sx={{ mb: 2 }}>文档信息</Typography>
                      <List dense>
                        <ListItem>
                          <ListItemText primary="标题" secondary={document.title} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="作者" secondary={document.author || '未知'} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="朝代" secondary={document.dynasty || '未知'} />
                        </ListItem>
                        <ListItem>
                          <ListItemText
                            primary="状态"
                            secondary={
                              <Chip
                                size="small"
                                label={document.status}
                                color={document.status === 'completed' ? 'success' : document.status === 'error' ? 'error' : 'primary'}
                              />
                            }
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemText
                            primary="创建时间"
                            secondary={new Date(document.created_at).toLocaleString('zh-CN')}
                          />
                        </ListItem>
                        {document.description && (
                          <ListItem>
                            <ListItemText primary="描述" secondary={document.description} />
                          </ListItem>
                        )}
                      </List>
                    </Paper>

                    <Paper sx={{ p: 2, mb: 2 }}>
                      <Typography variant="h6" sx={{ mb: 2 }}>处理步骤</Typography>
                      <Stack spacing={2}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Chip
                            icon={<AutoFixHighIcon />}
                            label="图像预处理"
                            color={images.processed ? 'success' : 'default'}
                            size="small"
                          />
                          {!images.processed && (
                            <Button size="small" onClick={() => handleStepAction('preprocess')} disabled={processing}>
                              运行
                            </Button>
                          )}
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Chip
                            icon={<AutoFixHighIcon />}
                            label="墨迹修复"
                            color={images.inpainted ? 'success' : 'default'}
                            size="small"
                          />
                          {images.processed && !images.inpainted && (
                            <Button size="small" onClick={() => handleStepAction('inpaint')} disabled={processing}>
                              运行
                            </Button>
                          )}
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Chip
                            icon={<GridViewIcon />}
                            label={`版面分析 (${document.layout_analysis.length})`}
                            color={document.layout_analysis.length > 0 ? 'success' : 'default'}
                            size="small"
                          />
                          {(images.processed || images.original) && document.layout_analysis.length === 0 && (
                            <Button size="small" onClick={() => handleStepAction('layout')} disabled={processing}>
                              运行
                            </Button>
                          )}
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Chip
                            icon={<TextFieldsIcon />}
                            label={`OCR识别 (${document.ocr_results.length})`}
                            color={document.ocr_results.length > 0 ? 'success' : 'default'}
                            size="small"
                          />
                          {document.layout_analysis.length > 0 && document.ocr_results.length === 0 && (
                            <Button size="small" onClick={() => handleStepAction('ocr')} disabled={processing}>
                              运行
                            </Button>
                          )}
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Chip
                            icon={<AccountTreeIcon />}
                            label={`知识图谱 (${document.entities.length}实体)`}
                            color={document.entities.length > 0 ? 'success' : 'default'}
                            size="small"
                          />
                          {document.ocr_results.length > 0 && document.entities.length === 0 && (
                            <Button size="small" onClick={() => handleStepAction('kg')} disabled={processing}>
                              运行
                            </Button>
                          )}
                        </Box>
                      </Stack>
                    </Paper>

                    {document.entities.length > 0 && (
                      <Accordion sx={{ mb: 1 }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography>
                            实体识别 ({document.entities.length})
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <List dense>
                            {document.entities.map((entity: Entity) => (
                              <ListItem key={entity.id}>
                                <Chip
                                  size="small"
                                  label={getEntityLabel(entity.entity_type)}
                                  color="primary"
                                  sx={{ mr: 1 }}
                                />
                                <ListItemText
                                  primary={entity.entity_text}
                                  secondary={`置信度: ${Math.round((entity.confidence || 0) * 100)}%`}
                                />
                              </ListItem>
                            ))}
                          </List>
                        </AccordionDetails>
                      </Accordion>
                    )}

                    {document.relations.length > 0 && (
                      <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography>
                            实体关系 ({document.relations.length})
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <List dense>
                            {document.relations.map((rel: EntityRelation) => {
                              const sourceEntity = document.entities.find((e: Entity) => e.id === rel.source_entity_id);
                              const targetEntity = document.entities.find((e: Entity) => e.id === rel.target_entity_id);
                              return (
                                <ListItem key={rel.id}>
                                  <ListItemText
                                    primary={
                                      <>
                                        <Chip size="small" label={sourceEntity?.entity_text || ''} sx={{ mr: 0.5 }} />
                                        <Chip size="small" label={getRelationLabel(rel.relation_type)} color="secondary" sx={{ mr: 0.5 }} />
                                        <Chip size="small" label={targetEntity?.entity_text || ''} />
                                      </>
                                    }
                                  />
                                </ListItem>
                              );
                            })}
                          </List>
                        </AccordionDetails>
                      </Accordion>
                    )}
                  </Box>
                )}
              </Box>
            </Paper>
          </Box>
        </Grid>
      </Grid>
    </Container>
  );
};

export default DocumentViewer;
