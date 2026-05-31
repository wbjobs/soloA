import React, { useState } from 'react'
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Stack,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Grid,
  Card,
  CardContent,
  Divider,
} from '@mui/material'
import { Search, ExpandMore, FilterList, Article, Person, LocalOffer } from '@mui/icons-material'
import type { SearchResult, FilterOptions } from '../types'

interface SearchPanelProps {
  onSearch: (query: string, filters?: any) => Promise<SearchResult[]>
  isLoading: boolean
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ onSearch, isLoading }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [filters, setFilters] = useState({
    year: [] as number[],
    conference: [] as string[],
    minCitations: 0,
  })
  const [availableFilters, setAvailableFilters] = useState<FilterOptions>({
    years: [2024, 2023, 2022, 2021, 2020, 2019, 2018],
    conferences: ['NeurIPS', 'ICML', 'CVPR', 'ACL', 'EMNLP', 'ICLR', 'KDD'],
    authors: [],
    keywords: [],
    min_citations: null,
  })

  const handleSearch = async () => {
    if (!query.trim()) return

    try {
      const searchResults = await onSearch(query, filters)
      setResults(searchResults)
    } catch (error) {
      console.error('Search failed:', error)
      setResults([])
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
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
          <Search sx={{ mr: 1, color: 'primary.main' }} />
          Paper Search
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            fullWidth
            size="small"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Search papers by keywords, topics, or content..."
            disabled={isLoading}
            InputProps={{
              startAdornment: <Search fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
          />
          <Button
            variant="contained"
            size="small"
            onClick={handleSearch}
            disabled={!query.trim() || isLoading}
          >
            {isLoading ? <CircularProgress size={20} /> : 'Search'}
          </Button>
        </Box>

        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <FilterList fontSize="small" sx={{ mr: 1 }} />
              <Typography variant="body2">Filters</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Year</InputLabel>
                  <Select
                    multiple
                    value={filters.year}
                    onChange={(e) =>
                      setFilters({ ...filters, year: e.target.value as number[] })
                    }
                    label="Year"
                    renderValue={(selected) =>
                      selected.length > 0 ? selected.join(', ') : 'All years'
                    }
                  >
                    {availableFilters.years.map((year) => (
                      <MenuItem key={year} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Conference</InputLabel>
                  <Select
                    multiple
                    value={filters.conference}
                    onChange={(e) =>
                      setFilters({ ...filters, conference: e.target.value as string[] })
                    }
                    label="Conference"
                    renderValue={(selected) =>
                      selected.length > 0 ? (selected as string[]).join(', ') : 'All conferences'
                    }
                  >
                    {availableFilters.conferences.map((conf) => (
                      <MenuItem key={conf} value={conf}>
                        {conf}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" gutterBottom>
                  Minimum Citations: {filters.minCitations}
                </Typography>
                <Slider
                  size="small"
                  value={filters.minCitations}
                  onChange={(e, value) =>
                    setFilters({ ...filters, minCitations: value as number })
                  }
                  min={0}
                  max={100}
                  marks={[
                    { value: 0, label: '0' },
                    { value: 25, label: '25' },
                    { value: 50, label: '50' },
                    { value: 75, label: '75' },
                    { value: 100, label: '100+' },
                  ]}
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
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
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : results.length === 0 ? (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.secondary',
            }}
          >
            <Article sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
            <Typography variant="h6" gutterBottom>
              No Results Yet
            </Typography>
            <Typography variant="body2">
              Search for papers or upload documents to get started
            </Typography>
          </Box>
        ) : (
          <Stack spacing={2}>
            <Typography variant="caption" color="text.secondary">
              Found {results.length} results
            </Typography>

            {results.map((result, index) => {
              const metadata = result.chunk.metadata
              return (
                <Card key={index} variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {metadata.title || 'Unknown Title'}
                      </Typography>
                      <Chip
                        size="small"
                        label={`Score: ${result.score.toFixed(3)}`}
                        color="primary"
                        variant="outlined"
                      />
                    </Box>

                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
                      {(metadata.authors || []).map((author: string, i: number) => (
                        <Chip
                          key={i}
                          icon={<Person fontSize="small" />}
                          label={author}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                      {metadata.year && (
                        <Chip label={metadata.year} size="small" />
                      )}
                      {metadata.conference && (
                        <Chip label={metadata.conference} size="small" color="secondary" />
                      )}
                    </Stack>

                    <Typography variant="body2" color="text.secondary">
                      {result.chunk.content.substring(0, 300)}...
                    </Typography>

                    {(metadata.keywords || []).length > 0 && (
                      <>
                        <Divider sx={{ my: 1.5 }} />
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                          {(metadata.keywords || []).map((kw: string, i: number) => (
                            <Chip
                              key={i}
                              icon={<LocalOffer fontSize="small" />}
                              label={kw}
                              size="small"
                              variant="outlined"
                              sx={{ mr: 0.5 }}
                            />
                          ))}
                        </Stack>
                      </>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </Stack>
        )}
      </Box>
    </Paper>
  )
}
