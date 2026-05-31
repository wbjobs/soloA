import React, { useState, useMemo } from 'react';
import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { LayoutRegion } from '../types';

interface LayoutOverlayProps {
  regions: LayoutRegion[];
  imageDimensions?: { width: number; height: number };
  onRegionClick?: (region: LayoutRegion) => void;
  selectedRegionId?: number;
  showLabels?: boolean;
}

const REGION_COLORS: Record<string, { border: string; bg: string }> = {
  text: { border: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' },
  illustration: { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
  table: { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
  seal: { border: '#a855f7', bg: 'rgba(168, 85, 247, 0.1)' },
  default: { border: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)' },
};

const REGION_LABELS: Record<string, string> = {
  text: '文本',
  illustration: '插图',
  table: '表格',
  seal: '印章',
};

const LayoutOverlay: React.FC<LayoutOverlayProps> = ({
  regions,
  imageDimensions,
  onRegionClick,
  selectedRegionId,
  showLabels = true,
}) => {
  const [hoveredRegion, setHoveredRegion] = useState<number | null>(null);

  const getRegionColor = (type: string) => {
    return REGION_COLORS[type] || REGION_COLORS.default;
  };

  const regionStats = useMemo(() => {
    const stats: Record<string, number> = {};
    regions.forEach((r) => {
      stats[r.region_type] = (stats[r.region_type] || 0) + 1;
    });
    return stats;
  }, [regions]);

  return (
    <Box sx={{ position: 'relative' }}>
      {showLabels && Object.keys(regionStats).length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
          {Object.entries(regionStats).map(([type, count]) => {
            const color = getRegionColor(type);
            return (
              <Chip
                key={type}
                label={`${REGION_LABELS[type] || type}: ${count}`}
                size="small"
                sx={{
                  borderColor: color.border,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  backgroundColor: color.bg,
                }}
              />
            );
          })}
        </Stack>
      )}

      <Box sx={{ position: 'relative' }}>
        {regions.map((region) => {
          const color = getRegionColor(region.region_type);
          const isHovered = hoveredRegion === region.id;
          const isSelected = selectedRegionId === region.id;
          const x = imageDimensions
            ? (region.x / imageDimensions.width) * 100
            : region.x;
          const y = imageDimensions
            ? (region.y / imageDimensions.height) * 100
            : region.y;
          const width = imageDimensions
            ? (region.width / imageDimensions.width) * 100
            : region.width;
          const height = imageDimensions
            ? (region.height / imageDimensions.height) * 100
            : region.height;

          return (
            <Tooltip
              key={region.id}
              title={
                <Box>
                  <Typography variant="subtitle2">
                    {REGION_LABELS[region.region_type] || region.region_type}
                  </Typography>
                  <Typography variant="caption">
                    位置: ({region.x}, {region.y})
                  </Typography>
                  <Typography variant="caption" display="block">
                    尺寸: {region.width} x {region.height}
                  </Typography>
                  {region.confidence && (
                    <Typography variant="caption" display="block">
                      置信度: {Math.round(region.confidence * 100)}%
                    </Typography>
                  )}
                  {region.is_vertical && (
                    <Typography variant="caption" display="block">
                      竖排文本
                    </Typography>
                  )}
                </Box>
              }
            >
              <Box
                sx={{
                  position: imageDimensions ? 'absolute' : 'absolute',
                  left: imageDimensions ? `${x}%` : x,
                  top: imageDimensions ? `${y}%` : y,
                  width: imageDimensions ? `${width}%` : width,
                  height: imageDimensions ? `${height}%` : height,
                  border: isSelected
                    ? `3px solid ${color.border}`
                    : isHovered
                    ? `2px solid ${color.border}`
                    : `1px solid ${color.border}`,
                  backgroundColor: isHovered || isSelected ? color.bg : 'transparent',
                  cursor: onRegionClick ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box',
                }}
                onClick={() => onRegionClick?.(region)}
                onMouseEnter={() => setHoveredRegion(region.id)}
                onMouseLeave={() => setHoveredRegion(null)}
              >
                {showLabels && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -24,
                      left: 0,
                      fontSize: 12,
                      backgroundColor: color.border,
                      color: 'white',
                      px: 1,
                      py: 0.5,
                      borderRadius: 0.5,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {REGION_LABELS[region.region_type] || region.region_type}
                    {region.confidence && ` ${Math.round(region.confidence * 100)}%`}
                  </Box>
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
};

export default LayoutOverlay;
