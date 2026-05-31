import React, { useState } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Card,
  CardContent,
  Chip,
  Stack,
  Divider,
  LinearProgress,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material'
import {
  Article,
  Refresh,
  TrendingUp,
  ExpandMore,
  Search,
  Timeline,
  Flag,
  Book,
  Person,
} from '@mui/icons-material'
import { apiService } from '../services/api'
import type { LiteratureReview, TopicCluster } from '../types'

interface ReviewPanelProps {}

export const ReviewPanel: React.FC<ReviewPanelProps> = () => {
  const [query, setQuery] = useState('')
  const [review, setReview] = useState<LiteratureReview | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleGenerate = async () => {
    if (!query.trim()) return

    setIsLoading(true)
    try {
      const response = await apiService.generateReview(query.trim())
      setReview(response)
    } catch (error) {
      console.error('Failed to generate review:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const renderTrendChart = (review: LiteratureReview) => {
    if (!review.research_trends || review.research_trends.length === 0) {
      return null
    }

    const maxCount = Math.max(...review.research_trends.map((t) => t.count))
    const barWidth = 100 / review.research_trends.length

    return (
      <Card variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Timeline sx={{ mr: 1, color: 'secondary.main' }} />
            Research Trends Over Time
          </Typography>

          <Box sx={{ height: 180, position: 'relative' }}>
            {review.research_trends.map((trend, index) => {
              const height = (trend.count / maxCount) * 140
              const left = index * barWidth
              return (
                <Box
                  key={trend.year}
                  sx={{
                    position: 'absolute',
                    bottom: 40,
                    left: `${left + barWidth / 4}%`,
                    width: `${barWidth / 2}%`,
                    height: `${height}px`,
                    bgcolor: 'primary.main',
                    borderRadius: 1,
                    transition: 'all 0.3s',
                    '&:hover': {
                      bgcolor: 'primary.light',
                    },
                  }}
                  title={`${trend.year}: ${trend.count} papers`}
                />
              )
            })}

            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                display: 'flex',
                justifyContent: 'space-around',
              }}
            >
              {review.research_trends.map((trend) => (
                <Typography key={trend.year} variant="caption" color="text.secondary">
                  {trend.year}
                </Typography>
              ))}
            </Box>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Papers published per year in this research domain
          </Typography>
        </CardContent>
      </Card>
    )
  }

  const renderCluster = (cluster: TopicCluster, index: number) => {
    const years = Object.entries(cluster.trend_data)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, count]) => ({ year: Number(year), count }))

    return (
      <Accordion key={cluster.topic_name}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                size="small"
                label={`Cluster ${index + 1}`}
                color="primary"
              />
              <Typography variant="subtitle1" fontWeight="bold">
                {cluster.topic_name}
              </Typography>
              <Chip
                size="small"
                label={`${cluster.paper_count} papers`}
                variant="outlined"
              />
            </Stack>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            {cluster.keywords.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Keywords:
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                  {cluster.keywords.slice(0, 10).map((kw, i) => (
                    <Chip key={i} size="small" label={kw} color="secondary" variant="outlined" />
                  ))}
                </Stack>
              </Box>
            )}

            {cluster.dominant_authors.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  <Person sx={{ mr: 0.5, fontSize: 16 }} />
                  Dominant Authors:
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                  {cluster.dominant_authors.map((author, i) => (
                    <Chip key={i} size="small" label={author} icon={<Person />} variant="outlined" />
                  ))}
                </Stack>
              </Box>
            )}

            <Box>
              <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <Book sx={{ mr: 0.5, fontSize: 16 }} />
                Key Papers:
              </Typography>
              <List dense>
                {cluster.papers.slice(0, 5).map((paper, i) => (
                  <ListItem key={i} divider sx={{ px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Article fontSize="small" color="action" />
                    </ListItemIcon>
                    <ListItemText
                      primary={paper.title}
                      secondary={
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            {paper.authors.join(', ')}
                            {paper.year && ` (${paper.year})`}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {paper.summary}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          </Stack>
        </AccordionDetails>
      </Accordion>
    )
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
          <Article sx={{ mr: 1, color: 'primary.main' }} />
          Literature Review Generator
        </Typography>

        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField
            size="small"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter research topic (e.g., transformers, attention mechanisms)"
            fullWidth
            InputProps={{
              startAdornment: <Search fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
            onKeyPress={(e) => e.key === 'Enter' && handleGenerate()}
          />
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={isLoading || !query.trim()}
            startIcon={isLoading ? <CircularProgress size={20} /> : <Refresh />}
          >
            {isLoading ? 'Generating...' : 'Generate Review'}
          </Button>
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip
            size="small"
            icon={<TrendingUp fontSize="small" />}
            label="Topics clustering"
            variant="outlined"
          />
          <Chip
            size="small"
            icon={<Timeline fontSize="small" />}
            label="Trend analysis"
            variant="outlined"
          />
          <Chip
            size="small"
            icon={<Flag fontSize="small" />}
            label="Future directions"
            variant="outlined"
          />
        </Stack>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2,
          bgcolor: 'background.default',
        }}
      >
        {isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8 }}>
            <CircularProgress size={48} sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Analyzing papers, clustering topics, and generating review...
            </Typography>
            <Box sx={{ width: 300, mt: 2 }}>
              <LinearProgress />
            </Box>
          </Box>
        ) : !review ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'text.secondary',
            }}
          >
            <Article sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
            <Typography variant="h6" gutterBottom>
              Generate Literature Review
            </Typography>
            <Typography variant="body2" align="center" sx={{ maxWidth: 400 }}>
              Enter a research topic to automatically generate a structured literature review,
              including topic clusters, research trends, and future directions.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={3}>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant="h5" fontWeight="bold" gutterBottom>
                  {review.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Query: "{review.query}" | Papers reviewed: {review.citations.length}
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Typography variant="body1" paragraph>
                  {review.summary}
                </Typography>
              </CardContent>
            </Card>

            {renderTrendChart(review)}

            {review.clusters.length > 0 && (
              <Box>
                <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                  <TrendingUp sx={{ mr: 1, color: 'primary.main' }} />
                  Topic Clusters ({review.clusters.length})
                </Typography>
                {review.clusters.map((cluster, index) => renderCluster(cluster, index))}
              </Box>
            )}

            {review.future_directions.length > 0 && (
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Flag sx={{ mr: 1, color: 'warning.main' }} />
                    Future Research Directions
                  </Typography>
                  <List dense>
                    {review.future_directions.map((direction, i) => (
                      <ListItem key={i} divider>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Flag fontSize="small" color="warning" />
                        </ListItemIcon>
                        <ListItemText primary={direction} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            )}

            {review.citations.length > 0 && (
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Book sx={{ mr: 1, color: 'secondary.main' }} />
                    References ({review.citations.length})
                  </Typography>
                  <List dense>
                    {review.citations.slice(0, 10).map((citation, i) => (
                      <ListItem key={i} divider>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Typography variant="caption" fontWeight="bold">
                            [{i + 1}]
                          </Typography>
                        </ListItemIcon>
                        <ListItemText
                          primary={citation.title}
                          secondary={
                            <>
                              <Typography variant="caption" color="text.secondary">
                                {citation.authors.join(', ')}
                              </Typography>
                              {citation.conference && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  {citation.conference}
                                  {citation.year && ` (${citation.year})`}
                                </Typography>
                              )}
                            </>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            )}
          </Stack>
        )}
      </Box>
    </Paper>
  )
}
