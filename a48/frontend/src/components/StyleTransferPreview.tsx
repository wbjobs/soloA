import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Slider,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Button,
  Chip,
  Stack,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Divider,
  LinearProgress,
  Grid,
  SelectChangeEvent,
} from '@mui/material';
import {
  Palette,
  Image,
  PlayArrow,
  History,
  AutoFixHigh,
  Brush,
} from '@mui/icons-material';
import { StyleInfo, StyleTransferResponse, StyleTransferHistory, OCRResult } from '../types';
import { styleTransferApi } from '../services/api';

const STYLE_PRESETS: Array<{ strength: number; label: string }> = [
  { strength: 0.2, label: '轻微' },
  { strength: 0.4, label: '适度' },
  { strength: 0.6, label: '标准' },
  { strength: 0.8, label: '强烈' },
  { strength: 1.0, label: '完全' },
];

interface StyleTransferPreviewProps {
  documentId?: number;
  selectedOCR?: OCRResult;
  onApply?: (result: any) => void;
}

export const StyleTransferPreview: React.FC<StyleTransferPreviewProps> = ({
  documentId,
  selectedOCR,
  onApply,
}) => {
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<string>('kaishu');
  const [strength, setStrength] = useState<number>(0.7);
  const [inputText, setInputText] = useState<string>('');
  const [result, setResult] = useState<StyleTransferResponse | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<StyleTransferHistory[]>([]);
  const [detectedStyle, setDetectedStyle] = useState<any>(null);
  const [previewStrengths, setPreviewStrengths] = useState<Array<{ strength: number; styled_text: string }>>([]);

  const loadStyles = useCallback(async () => {
    try {
      const data = await styleTransferApi.getStyles();
      setStyles(data);
    } catch (err: any) {
      setError(err.message || '加载风格列表失败');
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (!documentId) return;
    try {
      const data = await styleTransferApi.getHistory(documentId);
      setHistory(data.history);
    } catch (err: any) {
      console.error('加载历史记录失败:', err);
    }
  }, [documentId]);

  const detectDocumentStyle = useCallback(async () => {
    if (!documentId) return;
    try {
      const data = await styleTransferApi.detectStyle(documentId);
      setDetectedStyle(data);
      if (data.detected_style) {
        setSelectedStyle(data.detected_style);
      }
    } catch (err: any) {
      console.error('检测风格失败:', err);
    }
  }, [documentId]);

  useEffect(() => {
    loadStyles();
    if (documentId) {
      loadHistory();
    }
  }, [loadStyles, loadHistory, documentId]);

  useEffect(() => {
    if (selectedOCR) {
      setInputText(selectedOCR.corrected_text || selectedOCR.text);
    }
  }, [selectedOCR]);

  const handleStyleChange = (event: SelectChangeEvent<string>) => {
    setSelectedStyle(event.target.value);
    setResult(null);
    setImageData(null);
  };

  const handleStrengthChange = (_event: Event, newValue: number | number[]) => {
    setStrength(newValue as number);
  };

  const handlePreview = async () => {
    if (!inputText.trim()) {
      setError('请输入要转换的文本');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setImageData(null);

    try {
      const [transferResult, imageResult, previewResult] = await Promise.all([
        styleTransferApi.transferStyle({
          text: inputText,
          style_name: selectedStyle,
          strength: strength,
          generate_image: false,
        }),
        styleTransferApi.transferStyleWithImage(
          inputText,
          selectedStyle,
          strength
        ),
        styleTransferApi.previewStyle({
          text: inputText,
          style_name: selectedStyle,
          strength: strength,
        }),
      ]);

      setResult(transferResult);
      setImageData(imageResult.image_data);
      setPreviewStrengths(previewResult.previews);

      if (documentId) {
        loadHistory();
      }
    } catch (err: any) {
      setError(err.message || '风格迁移失败');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyToOCR = async () => {
    if (!selectedOCR) {
      setError('请先选择OCR文本');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await styleTransferApi.applyToOcr(
        selectedOCR.id,
        selectedStyle,
        strength
      );

      if (onApply) {
        onApply(result);
      }

      if (documentId) {
        loadHistory();
      }
    } catch (err: any) {
      setError(err.message || '应用风格迁移失败');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentStyleInfo = () => {
    return styles.find((s) => s.key === selectedStyle);
  };

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Palette color="primary" />
          <Typography variant="h6">风格迁移</Typography>
        </Stack>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box sx={{ mb: 2 }}>
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel id="style-select-label">书法风格</InputLabel>
            <Select
              labelId="style-select-label"
              value={selectedStyle}
              label="书法风格"
              onChange={handleStyleChange}
              startAdornment={<Brush sx={{ mr: 1, color: 'action.active' }} />}
            >
              {styles.map((style) => (
                <MenuItem key={style.key} value={style.key}>
                  <Box>
                    <Typography variant="body1">{style.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {style.description}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {documentId && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<AutoFixHigh />}
              onClick={detectDocumentStyle}
              sx={{ mb: 2 }}
            >
              自动检测文档风格
            </Button>
          )}

          {detectedStyle && (
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent sx={{ py: 1.5 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Chip
                    label={`检测到: ${detectedStyle.style_name}`}
                    color="primary"
                    size="small"
                  />
                  <Chip
                    label={`置信度: ${(detectedStyle.confidence * 100).toFixed(1)}%`}
                    size="small"
                  />
                </Stack>
              </CardContent>
            </Card>
          )}
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            迁移强度: {(strength * 100).toFixed(0)}%
          </Typography>
          <Slider
            value={strength}
            onChange={handleStrengthChange}
            min={0}
            max={1}
            step={0.05}
            marks={STYLE_PRESETS.map((p) => ({ value: p.strength, label: p.label }))}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${(v * 100).toFixed(0)}%`}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            {STYLE_PRESETS.map((preset) => (
              <Chip
                key={preset.strength}
                label={preset.label}
                size="small"
                onClick={() => setStrength(preset.strength)}
                color={Math.abs(strength - preset.strength) < 0.05 ? 'primary' : 'default'}
                variant={Math.abs(strength - preset.strength) < 0.05 ? 'filled' : 'outlined'}
              />
            ))}
          </Stack>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            输入文本
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="输入要转换为书法风格的文本..."
            variant="outlined"
            size="small"
          />
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={20} /> : <PlayArrow />}
              onClick={handlePreview}
              disabled={loading || !inputText.trim()}
            >
              预览效果
            </Button>
            {selectedOCR && (
              <Button
                variant="outlined"
                startIcon={<Image />}
                onClick={handleApplyToOCR}
                disabled={loading}
              >
                应用到选中OCR
              </Button>
            )}
          </Stack>
        </Box>

        {result && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              转换结果
            </Typography>
            <Card variant="outlined">
              <CardContent>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">
                      原文
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 0.5, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                      {result.original_text}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">
                      转换后 ({getCurrentStyleInfo()?.name})
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{
                        mt: 0.5,
                        p: 1,
                        bgcolor: 'primary.50',
                        borderRadius: 1,
                        fontFamily: '"KaiTi", "STKaiti", serif',
                      }}
                    >
                      {result.styled_text}
                    </Typography>
                  </Grid>
                </Grid>

                {result.metadata?.style_characteristics && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      风格特征:
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                      {result.metadata.style_characteristics.map((char: string, i: number) => (
                        <Chip key={i} label={char} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Box>
        )}

        {imageData && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              图像预览
            </Typography>
            <Card variant="outlined" sx={{ overflow: 'hidden' }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  p: 2,
                  bgcolor: '#fafafa',
                  minHeight: 120,
                }}
              >
                <img
                  src={imageData}
                  alt="风格迁移预览"
                  style={{ maxWidth: '100%', maxHeight: 200 }}
                />
              </Box>
            </Card>
          </Box>
        )}

        {previewStrengths.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              强度对比预览
            </Typography>
            <Grid container spacing={1}>
              {previewStrengths.map((preview) => (
                <Grid item xs={12} sm={6} key={preview.strength}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardContent sx={{ py: 1.5 }}>
                      <Chip
                        label={`${(preview.strength * 100).toFixed(0)}%`}
                        size="small"
                        color="primary"
                        sx={{ mb: 1 }}
                      />
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: '"KaiTi", "STKaiti", serif',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {preview.styled_text}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {history.length > 0 && (
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <History fontSize="small" color="action" />
              <Typography variant="subtitle2">历史记录</Typography>
            </Stack>
            <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
              {history.slice(0, 5).map((item) => (
                <Card key={item.id} variant="outlined" sx={{ mb: 1 }}>
                  <CardContent sx={{ py: 1.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        label={styles.find((s) => s.key === item.style_name)?.name || item.style_name}
                        size="small"
                        color="primary"
                      />
                      <Chip
                        label={`${(item.transfer_strength * 100).toFixed(0)}%`}
                        size="small"
                      />
                    </Stack>
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                      {item.original_text.slice(0, 30)}
                      {item.original_text.length > 30 ? '...' : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(item.created_at).toLocaleString('zh-CN')}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  );
};
