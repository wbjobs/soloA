import React, { useState, useCallback, useRef } from 'react';
import {
  Box,
  IconButton,
  Typography,
  Paper,
  Slider,
  Stack,
  Tooltip,
} from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PanToolIcon from '@mui/icons-material/PanTool';

interface ImageViewerProps {
  imageUrl?: string;
  alt?: string;
  showControls?: boolean;
  maxWidth?: string | number;
  onImageLoad?: (dimensions: { width: number; height: number }) => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({
  imageUrl,
  alt = 'Document image',
  showControls = true,
  maxWidth = '100%',
  onImageLoad,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const startPanRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  }, []);

  const handleZoomChange = useCallback((_: Event, newValue: number | number[]) => {
    setZoom(newValue as number);
  }, []);

  const handleRotateLeft = useCallback(() => {
    setRotation((prev) => (prev - 90) % 360);
  }, []);

  const handleRotateRight = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPanPosition({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setIsDragging(true);
    startPanRef.current = {
      x: e.clientX - panPosition.x,
      y: e.clientY - panPosition.y,
    };
  }, [isPanning, panPosition]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !isPanning) return;
    setPanPosition({
      x: e.clientX - startPanRef.current.x,
      y: e.clientY - startPanRef.current.y,
    });
  }, [isDragging, isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    if (onImageLoad) {
      onImageLoad({
        width: e.currentTarget.naturalWidth,
        height: e.currentTarget.naturalHeight,
      });
    }
  }, [onImageLoad]);

  if (!imageUrl) {
    return (
      <Paper
        elevation={2}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          backgroundColor: '#f5f5f5',
        }}
      >
        <Typography color="text.secondary">暂无图像</Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {showControls && (
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          sx={{ mb: 2, p: 2, backgroundColor: 'background.paper', borderRadius: 1 }}
        >
          <Tooltip title="放大">
            <IconButton onClick={handleZoomIn} size="small">
              <ZoomInIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="缩小">
            <IconButton onClick={handleZoomOut} size="small">
              <ZoomOutIcon />
            </IconButton>
          </Tooltip>
          <Slider
            value={zoom}
            onChange={handleZoomChange}
            min={0.25}
            max={5}
            step={0.25}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
            sx={{ width: 150 }}
          />
          <Typography variant="body2">{Math.round(zoom * 100)}%</Typography>
          <Tooltip title="向左旋转">
            <IconButton onClick={handleRotateLeft} size="small">
              <RotateLeftIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="向右旋转">
            <IconButton onClick={handleRotateRight} size="small">
              <RotateRightIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={isPanning ? '停止平移' : '平移模式'}>
            <IconButton
              onClick={() => setIsPanning((prev) => !prev)}
              color={isPanning ? 'primary' : 'default'}
              size="small"
            >
              <PanToolIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="重置">
            <IconButton onClick={handleReset} size="small">
              <RestartAltIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
      <Box
        ref={containerRef}
        sx={{
          overflow: 'hidden',
          position: 'relative',
          cursor: isPanning ? (isDragging ? 'grabbing' : 'grab') : 'default',
          maxWidth,
          maxHeight: '70vh',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={imageUrl}
          alt={alt}
          onLoad={handleImageLoad}
          style={{
            maxWidth: '100%',
            transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.2s ease',
          }}
        />
      </Box>
    </Box>
  );
};

export default ImageViewer;
