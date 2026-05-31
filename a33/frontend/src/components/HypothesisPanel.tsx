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
} from '@mui/material'
import {
  Lightbulb,
  Refresh,
  Science,
  Verified,
  Warning,
  ExpandMore,
  HistoryToggleOff,
  Search,
} from '@mui/icons-material'
import { apiService } from '../services/api'
import type { HypothesisResponse, ResearchHypothesis, MissingLink } from '../types'

interface HypothesisPanelProps {}

export const HypothesisPanel: React.FC<HypothesisPanelProps> = () => {
  const [focusEntity, setFocusEntity] = useState('')
  const [data, setData] = useState<HypothesisResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleGenerate = async () => {
    setIsLoading(true)
    try {
      const response = await apiService.generateHypotheses(
        focusEntity.trim() || undefined
      )
      setData(response)
    } catch (error) {
      console.error('Failed to generate hypotheses:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return 'success'
    if (confidence >= 0.5) return 'warning'
    return 'default'
  }

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.7) return 'High'
    if (confidence >= 0.5) return 'Medium'
    return 'Low'
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
          <Lightbulb sx={{ mr: 1, color: 'warning.main' }} />
          Research Hypotheses
        </Typography>

        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField
            size="small"
            value={focusEntity}
            onChange={(e) => setFocusEntity(e.target.value)}
            placeholder="Focus on specific author/keyword (optional)"
            fullWidth
            InputProps={{
              startAdornment: <Search fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
          />
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={isLoading}
            startIcon={isLoading ? <CircularProgress size={20} /> : <Refresh />}
          >
            {isLoading ? 'Generating...' : 'Generate Hypotheses'}
          </Button>
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip
            size="small"
            icon={<Lightbulb fontSize="small" />}
            label="Identifies missing connections in knowledge graph"
            variant="outlined"
          />
          <Chip
            size="small"
            icon={<Science fontSize="small" />}
            label="Proposes verifiable experiments"
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
              Analyzing knowledge graph for potential research gaps...
            </Typography>
            <Box sx={{ width: 300, mt: 2 }}>
              <LinearProgress />
            </Box>
          </Box>
        ) : !data ? (
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
            <Lightbulb sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
            <Typography variant="h6" gutterBottom>
              Generate Research Hypotheses
            </Typography>
            <Typography variant="body2" align="center" sx={{ maxWidth: 400 }}>
              Click "Generate Hypotheses" to analyze your knowledge graph for missing connections,
              potential collaborations, and emerging research opportunities.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={3}>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Verified sx={{ mr: 1, color: 'success.main' }} />
                  <Typography variant="subtitle1" fontWeight="bold">
                    Analysis Summary
                  </Typography>
                </Box>
                <Typography variant="body2">{data.summary}</Typography>
                <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                  <Chip
                    size="small"
                    label={`${data.missing_links.length} Missing Links`}
                    color="primary"
                  />
                  <Chip
                    size="small"
                    label={`${data.hypotheses.length} Hypotheses`}
                    color="success"
                  />
                </Stack>
              </CardContent>
            </Card>

            {data.missing_links.length > 0 && (
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Warning sx={{ mr: 1, color: 'warning.main' }} />
                    <Typography variant="subtitle1" fontWeight="bold">
                      Identified Missing Connections
                    </Typography>
                  </Box>
                  <Stack spacing={1.5}>
                    {data.missing_links.slice(0, 5).map((link: MissingLink, index: number) => (
                      <Box
                        key={index}
                        sx={{
                          p: 1.5,
                          bgcolor: 'background.paper',
                          borderRadius: 1,
                          border: 1,
                          borderColor: 'divider',
                        }}
                      >
                        <Typography variant="body2" gutterBottom>
                          <Chip
                            size="small"
                            label={link.source_type}
                            sx={{ mr: 1 }}
                          />
                          <strong>{link.source_name}</strong>
                          <span style={{ color: 'text.secondary', margin: '0 8px' }}>
                            →
                          </span>
                          <Chip
                            size="small"
                            label={link.target_type}
                            sx={{ mr: 1 }}
                          />
                          <strong>{link.target_name}</strong>
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          <Chip
                            size="small"
                            label={link.missing_relation}
                            color="warning"
                            variant="outlined"
                          />
                          <Chip
                            size="small"
                            label={`Confidence: ${(link.confidence * 100).toFixed(0)}%`}
                            color={getConfidenceColor(link.confidence)}
                          />
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                          {link.evidence.join(' | ')}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            )}

            {data.hypotheses.length > 0 && (
              <Box>
                <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
                  Generated Research Hypotheses
                </Typography>
                <Stack spacing={2}>
                  {data.hypotheses.map((hypothesis: ResearchHypothesis, index: number) => (
                    <Accordion key={hypothesis.id || index}>
                      <AccordionSummary expandIcon={<ExpandMore />}>
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              size="small"
                              label={`H${index + 1}`}
                              color="primary"
                            />
                            <Typography
                              variant="body1"
                              sx={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {hypothesis.statement.substring(0, 100)}...
                            </Typography>
                            <Chip
                              size="small"
                              label={getConfidenceLabel(hypothesis.confidence)}
                              color={getConfidenceColor(hypothesis.confidence)}
                            />
                          </Box>
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Stack spacing={2}>
                          <Typography variant="body1">{hypothesis.statement}</Typography>

                          <Divider />

                          <Box>
                            <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                              <Science sx={{ mr: 0.5, fontSize: 16 }} />
                              Recommended Experiments
                            </Typography>
                            <Stack component="ul" spacing={0.5} sx={{ pl: 2, m: 0 }}>
                              {hypothesis.experiments.map((exp, i) => (
                                <Typography key={i} variant="body2" component="li">
                                  {exp}
                                </Typography>
                              ))}
                            </Stack>
                          </Box>

                          {hypothesis.based_on.length > 0 && (
                            <Box>
                              <Typography variant="subtitle2" gutterBottom>
                                Based On:
                              </Typography>
                              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                {hypothesis.based_on.map((item, i) => (
                                  <Chip key={i} size="small" label={item} variant="outlined" />
                                ))}
                              </Stack>
                            </Box>
                          )}

                          {hypothesis.related_work.length > 0 && (
                            <Box>
                              <Typography variant="subtitle2" gutterBottom>
                                Related Work:
                              </Typography>
                              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                {hypothesis.related_work.map((item, i) => (
                                  <Chip key={i} size="small" label={item} color="secondary" variant="outlined" />
                                ))}
                              </Stack>
                            </Box>
                          )}
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </Box>
    </Paper>
  )
}
