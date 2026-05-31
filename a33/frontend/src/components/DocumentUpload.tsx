import React, { useState } from 'react'
import {
  Box,
  Button,
  Paper,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Stack,
  Divider,
  LinearProgress,
} from '@mui/material'
import { UploadFile, CloudUpload, CheckCircle, Error } from '@mui/icons-material'
import type { UploadResponse } from '../types'

interface DocumentUploadProps {
  onUpload: (file: File) => Promise<UploadResponse>
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({ onUpload }) => {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      await handleFile(files[0])
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      await handleFile(files[0])
    }
  }

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a PDF file')
      return
    }

    setError(null)
    setUploadResult(null)
    setIsUploading(true)

    try {
      const result = await onUpload(file)
      setUploadResult(result)
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Paper
      sx={{
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          p: 3,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
          <UploadFile sx={{ mr: 1, color: 'primary.main' }} />
          Upload Documents
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Upload PDF papers to analyze and add to the knowledge base
        </Typography>
      </Box>

      <Box sx={{ p: 3 }}>
        <Box
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          sx={{
            border: 2,
            borderStyle: 'dashed',
            borderColor: isDragging ? 'primary.main' : 'divider',
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
            bgcolor: isDragging ? 'action.hover' : 'background.default',
            transition: 'all 0.2s',
            cursor: 'pointer',
            '&:hover': {
              borderColor: 'primary.light',
              bgcolor: 'action.hover',
            },
          }}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="file-upload"
            disabled={isUploading}
          />

          {isUploading ? (
            <Box>
              <CircularProgress size={48} sx={{ mb: 2 }} />
              <Typography variant="body1" gutterBottom>
                Processing Document...
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Extracting text, metadata, and building embeddings
              </Typography>
              <LinearProgress sx={{ mt: 2 }} />
            </Box>
          ) : (
            <Box>
              <CloudUpload sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Drag & Drop PDF Here
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                or
              </Typography>
              <label htmlFor="file-upload">
                <Button
                  variant="contained"
                  component="span"
                  disabled={isUploading}
                  sx={{ mt: 1 }}
                >
                  Choose File
                </Button>
              </label>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
                Supports PDF files with text extraction
              </Typography>
            </Box>
          )}
        </Box>

        {error && (
          <Alert severity="error" icon={<Error />} sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {uploadResult && (
          <Alert
            severity="success"
            icon={<CheckCircle />}
            sx={{ mt: 2 }}
          >
            <Typography variant="subtitle2" gutterBottom>
              Document Uploaded Successfully!
            </Typography>
            <Typography variant="body2" gutterBottom>
              <strong>Title:</strong> {uploadResult.title}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
              {uploadResult.authors.map((author, i) => (
                <Chip key={i} label={author} size="small" color="primary" variant="outlined" />
              ))}
            </Stack>
            {uploadResult.keywords.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                  Keywords:
                </Typography>
                {uploadResult.keywords.map((kw, i) => (
                  <Chip key={i} label={kw} size="small" color="secondary" variant="outlined" />
                ))}
              </Stack>
            )}
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
              Split into {uploadResult.chunk_count} chunks for vector search
            </Typography>
          </Alert>
        )}
      </Box>
    </Paper>
  )
}
