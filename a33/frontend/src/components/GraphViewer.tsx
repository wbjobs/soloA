import React, { useEffect, useRef, useState } from 'react'
import { Box, Paper, Typography, TextField, Button, Chip, Stack, CircularProgress, FormControl, InputLabel, Select, MenuItem, SelectChangeEvent } from '@mui/material'
import { AutoAwesome, Search, Refresh, FilterList } from '@mui/icons-material'
import type { GraphData, GraphNode, GraphEdge } from '../types'

interface GraphViewerProps {
  data: GraphData
  onRefresh: (entity?: string) => void
  isLoading: boolean
}

const NODE_COLORS: Record<string, string> = {
  Paper: '#6366f1',
  Author: '#22d3ee',
  Keyword: '#f472b6',
  Conference: '#fbbf24',
  Year: '#34d399',
  Default: '#9ca3af',
}

const RELATION_LABELS: Record<string, string> = {
  WROTE: 'Wrote',
  WRITTEN_BY: 'Written by',
  HAS_KEYWORD: 'Has keyword',
  USED_IN: 'Used in',
  PRESENTED_AT: 'Presented at',
  PUBLISHED_IN: 'Published in',
  HAS_CITATIONS: 'Has citations',
}

export const GraphViewer: React.FC<GraphViewerProps> = ({ data, onRefresh, isLoading }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const [searchEntity, setSearchEntity] = useState('')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [selectedRelation, setSelectedRelation] = useState<string>('all')

  const nodeTypes = ['all', ...Array.from(new Set(data.nodes.map((n) => n.type)))]
  const relationTypes = ['all', ...Array.from(new Set(data.edges.map((e) => e.relation)))]

  const filteredData: GraphData = {
    nodes: data.nodes.filter(
      (n) => selectedType === 'all' || n.type === selectedType
    ),
    edges: data.edges.filter(
      (e) => selectedRelation === 'all' || e.relation === selectedRelation
    ),
  }

  useEffect(() => {
    if (!containerRef.current) return

    let cleanup: (() => void) | undefined

    const initGraph = async () => {
      try {
        const ForceGraph3D = (await import('3d-force-graph')).default
        const THREE = await import('three')

        if (!containerRef.current) return

        const graphData = {
          nodes: filteredData.nodes.map((n) => ({
            id: n.id,
            name: n.name,
            type: n.type,
            color: NODE_COLORS[n.type] || NODE_COLORS.Default,
            val: n.type === 'Paper' ? 5 : n.type === 'Author' ? 4 : 3,
          })),
          links: filteredData.edges.map((e) => ({
            source: e.source,
            target: e.target,
            relation: e.relation,
            label: RELATION_LABELS[e.relation] || e.relation,
          })),
        }

        if (graphRef.current) {
          graphRef.current.graphData(graphData)
        } else {
          graphRef.current = ForceGraph3D()(containerRef.current)
            .graphData(graphData)
            .nodeColor('color')
            .nodeVal('val')
            .nodeLabel((node: any) => `${node.name} (${node.type})`)
            .nodeThreeObject((node: any) => {
              const sprite = new THREE.Sprite(
                new THREE.SpriteMaterial({
                  map: new THREE.CanvasTexture(
                    (() => {
                      const canvas = document.createElement('canvas')
                      canvas.width = 512
                      canvas.height = 128
                      const ctx = canvas.getContext('2d')!
                      ctx.fillStyle = 'rgba(0,0,0,0.8)'
                      ctx.font = '36px Sans-serif'
                      ctx.textAlign = 'center'
                      ctx.fillText(node.name, 256, 64)
                      return canvas
                    })()
                  ),
                  transparent: true,
                })
              )
              sprite.scale.set(30, 8, 1)
              return sprite
            })
            .linkWidth(1)
            .linkColor(() => 'rgba(148, 163, 184, 0.5)')
            .linkDirectionalParticles(2)
            .linkDirectionalParticleWidth(2)
            .enableNodeDrag(true)
            .enableNavigationControls(true)
            .showNavInfo(false)
            .cameraPosition({ z: 200 })
            .onNodeClick((node: any) => {
              setSearchEntity(node.name)
            })
        }
      } catch (error) {
        console.error('Failed to load 3D graph:', error)
      }
    }

    initGraph()

    cleanup = () => {
      if (graphRef.current) {
        graphRef.current._destructor?.()
        graphRef.current = null
      }
    }

    return cleanup
  }, [filteredData])

  const handleSearch = () => {
    if (searchEntity.trim()) {
      onRefresh(searchEntity.trim())
    }
  }

  const handleReset = () => {
    setSearchEntity('')
    setSelectedType('all')
    setSelectedRelation('all')
    onRefresh()
  }

  const handleTypeChange = (e: SelectChangeEvent<string>) => {
    setSelectedType(e.target.value)
  }

  const handleRelationChange = (e: SelectChangeEvent<string>) => {
    setSelectedRelation(e.target.value)
  }

  return (
    <Paper
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <AutoAwesome sx={{ mr: 1, color: 'secondary.main' }} />
          Knowledge Graph
        </Typography>

        <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 2 }}>
          <TextField
            size="small"
            value={searchEntity}
            onChange={(e) => setSearchEntity(e.target.value)}
            placeholder="Search entity..."
            sx={{ minWidth: 200 }}
            InputProps={{
              startAdornment: <Search fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
          />
          <Button
            variant="contained"
            size="small"
            onClick={handleSearch}
            disabled={!searchEntity.trim() || isLoading}
          >
            {isLoading ? <CircularProgress size={20} /> : 'Search'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={handleReset}
            startIcon={<Refresh />}
          >
            Reset
          </Button>
        </Stack>

        <Stack direction="row" spacing={2} flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Node Type</InputLabel>
            <Select value={selectedType} onChange={handleTypeChange} label="Node Type">
              {nodeTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {type === 'all' ? 'All Types' : type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Relation</InputLabel>
            <Select
              value={selectedRelation}
              onChange={handleRelationChange}
              label="Relation"
            >
              {relationTypes.map((rel) => (
                <MenuItem key={rel} value={rel}>
                  {rel === 'all' ? 'All Relations' : RELATION_LABELS[rel] || rel}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Chip
            icon={<FilterList />}
            label={`${filteredData.nodes.length} nodes, ${filteredData.edges.length} edges`}
            size="small"
          />
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          {Object.entries(NODE_COLORS).map(
            ([type, color]) =>
              type !== 'Default' && (
                <Chip
                  key={type}
                  label={type}
                  size="small"
                  sx={{ bgcolor: color, color: 'white' }}
                />
              )
          )}
        </Stack>
      </Box>

      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          position: 'relative',
          bgcolor: '#0a0a1a',
        }}
      >
        {isLoading && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(0,0,0,0.5)',
              zIndex: 10,
            }}
          >
            <CircularProgress />
          </Box>
        )}

        {data.nodes.length === 0 && !isLoading && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              color: 'text.secondary',
            }}
          >
            <AutoAwesome sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
            <Typography variant="h6" gutterBottom>
              No Graph Data
            </Typography>
            <Typography variant="body2">
              Upload papers to build the knowledge graph
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  )
}
