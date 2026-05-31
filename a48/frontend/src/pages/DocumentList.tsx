import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Box,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  CircularProgress,
  Alert,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { documentApi, pipelineApi } from '../services/api';
import { Document } from '../types';

const STATUS_LABELS: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' }> = {
  uploaded: { label: '已上传', color: 'default' },
  preprocessed: { label: '已预处理', color: 'info' },
  inpainted: { label: '已修复', color: 'info' },
  layout_analyzed: { label: '版面已分析', color: 'info' },
  ocr_completed: { label: 'OCR完成', color: 'info' },
  kg_completed: { label: '知识图谱完成', color: 'info' },
  completed: { label: '全部完成', color: 'success' },
  processing: { label: '处理中', color: 'warning' },
  error: { label: '错误', color: 'error' },
};

const DocumentList: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    author: '',
    dynasty: '',
    description: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [processingId, setProcessingId] = useState<number | null>(null);

  const navigate = useNavigate();

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const docs = await documentApi.listDocuments(
        statusFilter || undefined
      );
      setDocuments(docs);
      setError(null);
    } catch (err) {
      setError('加载文档列表失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [statusFilter]);

  const handleUpload = async () => {
    if (!selectedFile || !uploadForm.title) {
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('title', uploadForm.title);
      if (uploadForm.author) formData.append('author', uploadForm.author);
      if (uploadForm.dynasty) formData.append('dynasty', uploadForm.dynasty);
      if (uploadForm.description) formData.append('description', uploadForm.description);
      formData.append('file', selectedFile);

      await documentApi.createDocument(formData);
      setUploadDialogOpen(false);
      setUploadForm({ title: '', author: '', dynasty: '', description: '' });
      setSelectedFile(null);
      loadDocuments();
    } catch (err) {
      setError('上传文档失败');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除这个文档吗？')) return;

    try {
      await documentApi.deleteDocument(id);
      loadDocuments();
    } catch (err) {
      setError('删除文档失败');
      console.error(err);
    }
  };

  const handleRunPipeline = async (id: number) => {
    try {
      setProcessingId(id);
      await pipelineApi.runFullPipeline(id);
      loadDocuments();
    } catch (err) {
      setError('运行流水线失败');
      console.error(err);
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusChip = (status: string) => {
    const statusInfo = STATUS_LABELS[status] || { label: status, color: 'default' as const };
    return (
      <Chip
        size="small"
        label={statusInfo.label}
        color={statusInfo.color}
      />
    );
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">文档管理</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setUploadDialogOpen(true)}
        >
          上传文档
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>状态筛选</InputLabel>
          <Select
            value={statusFilter}
            label="状态筛选"
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value="">全部</MenuItem>
            {Object.entries(STATUS_LABELS).map(([key, value]) => (
              <MenuItem key={key} value={key}>
                {value.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>标题</TableCell>
                <TableCell>作者</TableCell>
                <TableCell>朝代</TableCell>
                <TableCell>状态</TableCell>
                <TableCell>创建时间</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>{doc.id}</TableCell>
                  <TableCell>{doc.title}</TableCell>
                  <TableCell>{doc.author || '-'}</TableCell>
                  <TableCell>{doc.dynasty || '-'}</TableCell>
                  <TableCell>{getStatusChip(doc.status)}</TableCell>
                  <TableCell>
                    {new Date(doc.created_at).toLocaleString('zh-CN')}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <IconButton
                        size="small"
                        onClick={() => navigate(`/documents/${doc.id}`)}
                        title="查看"
                      >
                        <VisibilityIcon />
                      </IconButton>
                      {doc.status !== 'completed' && doc.status !== 'processing' && (
                        <IconButton
                          size="small"
                          onClick={() => handleRunPipeline(doc.id)}
                          disabled={processingId === doc.id}
                          title="运行流水线"
                          color="primary"
                        >
                          {processingId === doc.id ? (
                            <CircularProgress size={20} />
                          ) : (
                            <PlayArrowIcon />
                          )}
                        </IconButton>
                      )}
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(doc.id)}
                        title="删除"
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    暂无文档
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={uploadDialogOpen}
        onClose={() => !uploading && setUploadDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>上传文档</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="标题"
              required
              fullWidth
              value={uploadForm.title}
              onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
            />
            <TextField
              label="作者"
              fullWidth
              value={uploadForm.author}
              onChange={(e) => setUploadForm({ ...uploadForm, author: e.target.value })}
            />
            <TextField
              label="朝代"
              fullWidth
              value={uploadForm.dynasty}
              onChange={(e) => setUploadForm({ ...uploadForm, dynasty: e.target.value })}
            />
            <TextField
              label="描述"
              fullWidth
              multiline
              rows={3}
              value={uploadForm.description}
              onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
            />
            <Button
              variant="outlined"
              component="label"
              startIcon={<CloudUploadIcon />}
              fullWidth
            >
              {selectedFile ? selectedFile.name : '选择图像文件'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setUploadDialogOpen(false)}
            disabled={uploading}
          >
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!selectedFile || !uploadForm.title || uploading}
          >
            {uploading ? '上传中...' : '上传'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default DocumentList;
