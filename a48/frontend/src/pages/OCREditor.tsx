import React, { useState, useEffect, useCallback } from 'react';
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
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
  IconButton,
  Tooltip,
  Divider,
  Card,
  CardContent,
  LinearProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import { documentApi, ocrApi } from '../services/api';
import { Document, OCRResult, DocumentImages } from '../types';

const OCREditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const documentId = parseInt(id || '0');
  const navigate = useNavigate();

  const [document, setDocument] = useState<Document | null>(null);
  const [images, setImages] = useState<DocumentImages>({});
  const [ocrResults, setOcrResults] = useState<OCRResult[]>([]);
  const [selectedOCR, setSelectedOCR] = useState<OCRResult | null>(null);
  const [editedText, setEditedText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerticalMode, setIsVerticalMode] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [doc, imgResponse, ocr] = await Promise.all([
        documentApi.getDocument(documentId),
        documentApi.getDocumentImages(documentId),
        ocrApi.getDocumentOCR(documentId),
      ]);
      setDocument(doc);
      setImages(imgResponse.images);
      setOcrResults(ocr);
      if (ocr.length > 0) {
        setSelectedOCR(ocr[0]);
        setEditedText(ocr[0].corrected_text || ocr[0].text);
      }
      setError(null);
    } catch (err) {
      setError('加载数据失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (documentId) {
      loadData();
    }
  }, [documentId]);

  const handleSelectOCR = useCallback((ocr: OCRResult) => {
    if (selectedOCR && (editedText !== ocr.corrected_text && editedText !== ocr.text)) {
      if (!window.confirm('当前编辑未保存，是否继续？')) {
        return;
      }
    }
    setSelectedOCR(ocr);
    setEditedText(ocr.corrected_text || ocr.text);
    setIsVerticalMode(ocr.is_vertical);
  }, [selectedOCR, editedText]);

  const handleSave = async () => {
    if (!selectedOCR) return;

    try {
      setSaving(true);
      const updated = await ocrApi.updateOCR(selectedOCR.id, editedText);
      setOcrResults((prev) =>
        prev.map((o) => (o.id === updated.id ? updated : o))
      );
      setSelectedOCR(updated);
    } catch (err) {
      setError('保存失败');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedOCR) return;

    try {
      const updated = await ocrApi.approveOCR(selectedOCR.id);
      setOcrResults((prev) =>
        prev.map((o) => (o.id === updated.id ? updated : o))
      );
      setSelectedOCR(updated);
    } catch (err) {
      setError('操作失败');
      console.error(err);
    }
  };

  const handleReject = async () => {
    if (!selectedOCR) return;

    try {
      const updated = await ocrApi.rejectOCR(selectedOCR.id);
      setOcrResults((prev) =>
        prev.map((o) => (o.id === updated.id ? updated : o))
      );
      setSelectedOCR(updated);
    } catch (err) {
      setError('操作失败');
      console.error(err);
    }
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'default';
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.5) return 'warning';
    return 'error';
  };

  const getConfidenceLabel = (confidence?: number) => {
    if (!confidence) return '未知';
    if (confidence >= 0.8) return '高';
    if (confidence >= 0.5) return '中';
    return '低';
  };

  if (loading) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <IconButton onClick={() => navigate(`/documents/${documentId}`)}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          OCR校对 - {document?.title}
        </Typography>
        <Chip
          label={`${ocrResults.filter((o) => o.is_corrected).length}/${ocrResults.length} 已校对`}
          color={ocrResults.every((o) => o.is_corrected) ? 'success' : 'primary'}
        />
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {ocrResults.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            暂无OCR结果，请先运行OCR识别
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ height: '70vh', overflow: 'auto' }}>
              <List dense>
                {ocrResults.map((ocr, index) => (
                  <ListItem
                    key={ocr.id}
                    disablePadding
                    secondaryAction={
                      <Stack direction="row" spacing={1}>
                        {ocr.is_vertical && (
                          <Chip size="small" icon={<SwapVertIcon />} label="竖排" />
                        )}
                        {ocr.is_corrected && (
                          <Chip size="small" icon={<CheckIcon />} label="已校对" color="success" />
                        )}
                      </Stack>
                    }
                  >
                    <ListItemButton
                      selected={selectedOCR?.id === ocr.id}
                      onClick={() => handleSelectOCR(ocr)}
                    >
                      <ListItemText
                        primary={`#${index + 1} - ${ocr.text.substring(0, 30)}${ocr.text.length > 30 ? '...' : ''}`}
                        secondary={
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip
                              size="small"
                              label={`置信度: ${getConfidenceLabel(ocr.confidence)}`}
                              color={getConfidenceColor(ocr.confidence)}
                              variant="outlined"
                            />
                          </Stack>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>

          <Grid item xs={12} md={8}>
            <Stack spacing={3}>
              <Paper sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h6">图像预览</Typography>
                  <Stack direction="row" spacing={1}>
                    {(images.original || images.processed || images.inpainted) && (
                      <img
                        src={images.inpainted || images.processed || images.original}
                        alt="Document"
                        style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain' }}
                      />
                    )}
                  </Stack>
                </Stack>
              </Paper>

              {selectedOCR && (
                <Card>
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                      <Typography variant="h6">OCR文本编辑</Typography>
                      <Stack direction="row" spacing={1}>
                        {selectedOCR.is_vertical && (
                          <Chip icon={<SwapVertIcon />} label="竖排文本" color="info" />
                        )}
                        <Chip
                          label={`置信度: ${Math.round((selectedOCR.confidence || 0) * 100)}%`}
                          color={getConfidenceColor(selectedOCR.confidence)}
                        />
                        {selectedOCR.is_corrected && (
                          <Chip icon={<CheckIcon />} label="已校对" color="success" />
                        )}
                      </Stack>
                    </Stack>

                    <Grid container spacing={2}>
                      <Grid item xs={12}>
                        <Typography variant="subtitle2" gutterBottom>
                          原始识别结果:
                        </Typography>
                        <Paper
                          sx={{
                            p: 2,
                            backgroundColor: 'grey.100',
                            fontFamily: selectedOCR.is_vertical
                              ? '"SimSun", "宋体", serif'
                              : 'inherit',
                            writingMode: isVerticalMode ? 'vertical-rl' : 'horizontal-tb',
                            minHeight: selectedOCR.is_vertical ? 200 : 'auto',
                          }}
                        >
                          <Typography
                            variant="body1"
                            sx={{
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {selectedOCR.text || '(空)'}
                          </Typography>
                        </Paper>
                      </Grid>

                      <Grid item xs={12}>
                        <Typography variant="subtitle2" gutterBottom>
                          校对文本:
                          {selectedOCR.corrected_text && (
                            <Chip
                              size="small"
                              label="已修改"
                              color="secondary"
                              sx={{ ml: 1 }}
                            />
                          )}
                        </Typography>
                        <TextField
                          fullWidth
                          multiline
                          rows={4}
                          value={editedText}
                          onChange={(e) => setEditedText(e.target.value)}
                          variant="outlined"
                          placeholder="输入校对后的文本..."
                          sx={{
                            fontFamily: selectedOCR.is_vertical
                              ? '"SimSun", "宋体", serif'
                              : 'inherit',
                          }}
                        />
                      </Grid>
                    </Grid>

                    <Divider sx={{ my: 2 }} />

                    <Stack direction="row" spacing={2} justifyContent="flex-end">
                      <Tooltip title="标记为正确">
                        <Button
                          variant="outlined"
                          color="success"
                          startIcon={<CheckIcon />}
                          onClick={handleApprove}
                        >
                          通过
                        </Button>
                      </Tooltip>
                      <Tooltip title="标记为错误">
                        <Button
                          variant="outlined"
                          color="error"
                          startIcon={<CloseIcon />}
                          onClick={handleReject}
                        >
                          驳回
                        </Button>
                      </Tooltip>
                      <Tooltip title="保存修改">
                        <Button
                          variant="contained"
                          startIcon={<SaveIcon />}
                          onClick={handleSave}
                          disabled={saving || editedText === (selectedOCR.corrected_text || selectedOCR.text)}
                        >
                          {saving ? '保存中...' : '保存'}
                        </Button>
                      </Tooltip>
                    </Stack>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    校对进度
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={ocrResults.length > 0
                      ? (ocrResults.filter((o) => o.is_corrected).length / ocrResults.length) * 100
                      : 0
                    }
                    sx={{ height: 10, borderRadius: 5 }}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    已校对: {ocrResults.filter((o) => o.is_corrected).length} / {ocrResults.length}
                    {' '}({Math.round(ocrResults.length > 0
                      ? (ocrResults.filter((o) => o.is_corrected).length / ocrResults.length) * 100
                      : 0
                    )}%)
                  </Typography>
                </CardContent>
              </Card>
            </Stack>
          </Grid>
        </Grid>
      )}
    </Container>
  );
};

export default OCREditor;
