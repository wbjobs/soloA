import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  Slider,
  Stack,
  Tooltip,
  IconButton,
} from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ImageViewer from './ImageViewer';
import { DocumentImages } from '../types';

interface SplitViewProps {
  images: DocumentImages;
  onImageLoad?: (dimensions: { width: number; height: number }) => void;
}

type ViewMode = 'side-by-side' | 'slider' | 'original' | 'processed' | 'inpainted';

const SplitView: React.FC<SplitViewProps> = ({ images, onImageLoad }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [swap, setSwap] = useState(false);

  const handleViewModeChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, newMode: ViewMode | null) => {
      if (newMode) {
        setViewMode(newMode);
      }
    },
    []
  );

  const handleSliderChange = useCallback((_: Event, newValue: number | number[]) => {
    setSliderPosition(newValue as number);
  }, []);

  const handleSwap = useCallback(() => {
    setSwap((prev) => !prev);
  }, []);

  const firstImage = swap ? images.processed || images.inpainted : images.original;
  const secondImage = swap ? images.original : images.processed || images.inpainted;

  const firstLabel = swap ? (images.processed ? '处理后' : '修复后') : '原始';
  const secondLabel = swap ? '原始' : (images.processed ? '处理后' : '修复后');

  const availableImages = [
    { key: 'original', url: images.original, label: '原始' },
    { key: 'processed', url: images.processed, label: '处理后' },
    { key: 'inpainted', url: images.inpainted, label: '修复后' },
  ].filter((img) => img.url) as { key: string; url: string; label: string }[];

  return (
    <Box>
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ mb: 2, p: 2, backgroundColor: 'background.paper', borderRadius: 1 }}
      >
        <Typography variant="subtitle2" sx={{ mr: 1 }}>
          视图模式:
        </Typography>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={handleViewModeChange}
          size="small"
        >
          <ToggleButton value="side-by-side" disabled={availableImages.length < 2}>
            分屏对比
          </ToggleButton>
          <ToggleButton value="slider" disabled={availableImages.length < 2}>
            滑块对比
          </ToggleButton>
          <ToggleButton value="original" disabled={!images.original}>
            原始
          </ToggleButton>
          {images.processed && (
            <ToggleButton value="processed">处理后</ToggleButton>
          )}
          {images.inpainted && (
            <ToggleButton value="inpainted">修复后</ToggleButton>
          )}
        </ToggleButtonGroup>
        {viewMode === 'side-by-side' && availableImages.length >= 2 && (
          <Tooltip title="交换左右">
            <IconButton onClick={handleSwap} size="small">
              <SwapHorizIcon />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {viewMode === 'side-by-side' && availableImages.length >= 2 && (
        <Stack direction="row" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, textAlign: 'center' }}>
              {firstLabel}
            </Typography>
            <Paper elevation={2} sx={{ p: 1 }}>
              <ImageViewer
                imageUrl={firstImage}
                alt={firstLabel}
                showControls={false}
                onImageLoad={onImageLoad}
              />
            </Paper>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, textAlign: 'center' }}>
              {secondLabel}
            </Typography>
            <Paper elevation={2} sx={{ p: 1 }}>
              <ImageViewer
                imageUrl={secondImage}
                alt={secondLabel}
                showControls={false}
                onImageLoad={onImageLoad}
              />
            </Paper>
          </Box>
        </Stack>
      )}

      {viewMode === 'slider' && availableImages.length >= 2 && (
        <Box>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
            <Slider
              value={sliderPosition}
              onChange={handleSliderChange}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${value}%`}
              sx={{ width: '50%' }}
            />
          </Box>
          <Paper elevation={2} sx={{ p: 1, position: 'relative' }}>
            <Box sx={{ position: 'relative', width: '100%' }}>
              <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', zIndex: 1 }}>
                <ImageViewer
                  imageUrl={firstImage}
                  alt={firstLabel}
                  showControls={false}
                  onImageLoad={onImageLoad}
                />
              </Box>
              <Box
                sx={{
                  position: 'relative',
                  zIndex: 2,
                  overflow: 'hidden',
                  width: `${sliderPosition}%`,
                }}
              >
                <Box sx={{ width: `${100 / (sliderPosition / 100)}%` }}>
                  <ImageViewer
                    imageUrl={secondImage}
                    alt={secondLabel}
                    showControls={false}
                  />
                </Box>
              </Box>
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: `${sliderPosition}%`,
                  bottom: 0,
                  width: 3,
                  backgroundColor: 'primary.main',
                  zIndex: 3,
                  cursor: 'ew-resize',
                }}
              />
            </Box>
          </Paper>
        </Box>
      )}

      {viewMode === 'original' && images.original && (
        <Paper elevation={2} sx={{ p: 1 }}>
          <ImageViewer
            imageUrl={images.original}
            alt="原始图像"
            onImageLoad={onImageLoad}
          />
        </Paper>
      )}

      {viewMode === 'processed' && images.processed && (
        <Paper elevation={2} sx={{ p: 1 }}>
          <ImageViewer
            imageUrl={images.processed}
            alt="处理后图像"
            onImageLoad={onImageLoad}
          />
        </Paper>
      )}

      {viewMode === 'inpainted' && images.inpainted && (
        <Paper elevation={2} sx={{ p: 1 }}>
          <ImageViewer
            imageUrl={images.inpainted}
            alt="修复后图像"
            onImageLoad={onImageLoad}
          />
        </Paper>
      )}
    </Box>
  );
};

export default SplitView;
