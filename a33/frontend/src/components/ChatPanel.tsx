import React, { useState, useRef, useEffect } from 'react'
import {
  Box,
  TextField,
  IconButton,
  Paper,
  Typography,
  CircularProgress,
  Chip,
  Tooltip,
  Divider,
} from '@mui/material'
import { Send, AutoAwesome, Description, Person, Article } from '@mui/icons-material'
import type { Message, Citation } from '../types'

interface ChatPanelProps {
  messages: Message[]
  onSend: (text: string) => void
  isLoading: boolean
}

const NODE_COLORS: Record<string, string> = {
  Paper: '#6366f1',
  Author: '#22d3ee',
  Keyword: '#f472b6',
  Conference: '#fbbf24',
  Year: '#34d399',
}

const CitationBadge: React.FC<{ citation: Citation }> = ({ citation }) => {
  return (
    <Tooltip
      title={
        <Box sx={{ maxWidth: 400, p: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            {citation.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">
            {citation.authors.join(', ')}
          </Typography>
          <Typography variant="body2">{citation.snippet}...</Typography>
          <Typography variant="caption" color="text.secondary">
            Score: {citation.score.toFixed(3)}
          </Typography>
        </Box>
      }
      placement="top"
    >
      <Chip
        size="small"
        label={`[${citation.index}]`}
        icon={<Description fontSize="small" />}
        color="primary"
        variant="outlined"
        sx={{ mr: 0.5, mb: 0.5 }}
      />
    </Tooltip>
  )
}

const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === 'user'

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        mb: 2,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          maxWidth: '80%',
        }}
      >
        <Box
          sx={{
            bgcolor: isUser ? 'primary.main' : 'background.paper',
            color: isUser ? 'white' : 'text.primary',
            borderRadius: isUser ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
            p: 2,
            boxShadow: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            {isUser ? (
              <Person fontSize="small" sx={{ mr: 1 }} />
            ) : (
              <AutoAwesome fontSize="small" sx={{ mr: 1, color: 'secondary.main' }} />
            )}
            <Typography variant="caption" fontWeight="bold">
              {isUser ? 'You' : 'Assistant'}
            </Typography>
          </Box>

          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
            {message.content}
          </Typography>

          {message.citations && message.citations.length > 0 && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Box>
                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                  Sources:
                </Typography>
                {message.citations.map((citation) => (
                  <CitationBadge key={citation.index} citation={citation} />
                ))}
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  )
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ messages, onSend, isLoading }) => {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSend(input.trim())
      setInput('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
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
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
          <Article sx={{ mr: 1, color: 'primary.main' }} />
          Academic Chat
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Ask questions about your research papers
        </Typography>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 3,
          bgcolor: 'background.default',
        }}
      >
        {messages.length === 0 ? (
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
            <AutoAwesome sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
            <Typography variant="h6" gutterBottom>
              Start a Conversation
            </Typography>
            <Typography variant="body2" align="center" sx={{ maxWidth: 400 }}>
              Upload papers and ask questions about them. I'll combine semantic search with
              knowledge graph reasoning to give you accurate answers.
            </Typography>
          </Box>
        ) : (
          messages.map((message, index) => (
            <MessageBubble key={index} message={message} />
          ))
        )}

        {isLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
            <CircularProgress size={20} sx={{ mr: 2 }} />
            <Typography variant="body2">Thinking...</Typography>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      <Box
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about your papers... (e.g., 'What is the main contribution of the transformer paper?')"
            disabled={isLoading}
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
          />
          <IconButton
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            color="primary"
            sx={{
              alignSelf: 'flex-end',
              bgcolor: 'primary.main',
              color: 'white',
              '&:hover': { bgcolor: 'primary.dark' },
              '&:disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' },
            }}
          >
            <Send />
          </IconButton>
        </Box>
      </Box>
    </Paper>
  )
}
