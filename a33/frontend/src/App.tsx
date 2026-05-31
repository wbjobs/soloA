import React, { useState, useEffect } from 'react'
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Tabs,
  Tab,
  Container,
  Snackbar,
  Alert,
} from '@mui/material'
import { SmartToy, Description, Hub, Search, Lightbulb, Article, ChatBubble } from '@mui/icons-material'
import { ChatPanel } from './components/ChatPanel'
import { GraphViewer } from './components/GraphViewer'
import { DocumentUpload } from './components/DocumentUpload'
import { SearchPanel } from './components/SearchPanel'
import { HypothesisPanel } from './components/HypothesisPanel'
import { ReviewPanel } from './components/ReviewPanel'
import { AnnotationPanel } from './components/AnnotationPanel'
import { apiService } from './services/api'
import type { Message, GraphData, SearchResult, UploadResponse } from './types'

type TabValue = 'chat' | 'graph' | 'upload' | 'search' | 'hypothesis' | 'review' | 'annotation'

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabValue>('chat')
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [isSearchLoading, setIsSearchLoading] = useState(false)

  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] })
  const [isGraphLoading, setIsGraphLoading] = useState(false)

  const [notification, setNotification] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error' | 'info'
  }>({ open: false, message: '', severity: 'info' })

  useEffect(() => {
    loadGraph()
  }, [])

  const showNotification = (message: string, severity: 'success' | 'error' | 'info') => {
    setNotification({ open: true, message, severity })
  }

  const closeNotification = () => {
    setNotification((prev) => ({ ...prev, open: false }))
  }

  const loadGraph = async (entity?: string) => {
    setIsGraphLoading(true)
    try {
      const data = await apiService.getGraph(entity)
      setGraphData(data)
    } catch (error) {
      console.error('Failed to load graph:', error)
      setGraphData({ nodes: [], edges: [] })
    } finally {
      setIsGraphLoading(false)
    }
  }

  const handleSendMessage = async (text: string) => {
    const userMessage: Message = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    setIsChatLoading(true)

    try {
      const response = await apiService.ask(text, conversationId)
      setConversationId(response.conversation_id)

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.answer.content,
        citations: response.answer.citations,
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error: any) {
      showNotification(
        error.response?.data?.detail || 'Failed to get response',
        'error'
      )
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsChatLoading(false)
    }
  }

  const handleUpload = async (file: File): Promise<UploadResponse> => {
    try {
      const result = await apiService.uploadDocument(file)
      showNotification('Document uploaded successfully!', 'success')
      await loadGraph()
      return result
    } catch (error: any) {
      showNotification(
        error.response?.data?.detail || 'Upload failed',
        'error'
      )
      throw error
    }
  }

  const handleSearch = async (
    query: string,
    filters?: any
  ): Promise<SearchResult[]> => {
    setIsSearchLoading(true)
    try {
      const result = await apiService.search(query)
      return result.results
    } catch (error) {
      showNotification('Search failed', 'error')
      return []
    } finally {
      setIsSearchLoading(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'background.paper' }}>
        <Toolbar>
          <SmartToy sx={{ mr: 2, color: 'primary.main' }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            Academic RAG & Knowledge Graph
          </Typography>
        </Toolbar>
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            value="chat"
            label="Chat"
            icon={<SmartToy />}
            iconPosition="start"
          />
          <Tab
            value="graph"
            label="Knowledge Graph"
            icon={<Hub />}
            iconPosition="start"
          />
          <Tab
            value="search"
            label="Search"
            icon={<Search />}
            iconPosition="start"
          />
          <Tab
            value="hypothesis"
            label="Hypotheses"
            icon={<Lightbulb />}
            iconPosition="start"
          />
          <Tab
            value="review"
            label="Literature Review"
            icon={<Article />}
            iconPosition="start"
          />
          <Tab
            value="annotation"
            label="Annotations"
            icon={<ChatBubble />}
            iconPosition="start"
          />
          <Tab
            value="upload"
            label="Upload"
            icon={<Description />}
            iconPosition="start"
          />
        </Tabs>
      </AppBar>

      <Box sx={{ flex: 1, p: 2, overflow: 'hidden' }}>
        <Container
          maxWidth={false}
          sx={{
            height: '100%',
            maxWidth: '100%',
          }}
        >
          {activeTab === 'chat' && (
            <ChatPanel
              messages={messages}
              onSend={handleSendMessage}
              isLoading={isChatLoading}
            />
          )}

          {activeTab === 'graph' && (
            <GraphViewer
              data={graphData}
              onRefresh={loadGraph}
              isLoading={isGraphLoading}
            />
          )}

          {activeTab === 'search' && (
            <SearchPanel onSearch={handleSearch} isLoading={isSearchLoading} />
          )}

          {activeTab === 'hypothesis' && <HypothesisPanel />}

          {activeTab === 'review' && <ReviewPanel />}

          {activeTab === 'annotation' && <AnnotationPanel />}

          {activeTab === 'upload' && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                pt: 4,
              }}
            >
              <Box sx={{ maxWidth: 800, width: '100%' }}>
                <DocumentUpload onUpload={handleUpload} />
              </Box>
            </Box>
          )}
        </Container>
      </Box>

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={closeNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={closeNotification}
          severity={notification.severity}
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default App
