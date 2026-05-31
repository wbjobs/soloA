import React, { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Divider,
  CircularProgress,
  Badge,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Avatar,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import {
  ChatBubble,
  Comment,
  Add,
  Reply,
  Check,
  ThumbUp,
  ExpandMore,
  Person,
  Notifications,
  Refresh,
  Send,
  Delete,
  Edit,
} from '@mui/icons-material'
import { apiService } from '../services/api'
import type { Annotation, Notification } from '../types'

const MOCK_USERS = [
  { id: 'user-1', name: 'Alice Johnson' },
  { id: 'user-2', name: 'Bob Smith' },
  { id: 'user-3', name: 'Carol Chen' },
  { id: 'user-4', name: 'David Lee' },
]

const MOCK_DOCUMENTS = [
  { id: 'doc-1', title: 'Attention Is All You Need', chunks: 12 },
  { id: 'doc-2', title: 'Deep Residual Learning for Image Recognition', chunks: 10 },
  { id: 'doc-3', title: 'BERT: Pre-training of Deep Bidirectional Transformers', chunks: 15 },
]

export const AnnotationPanel: React.FC = () => {
  const [currentUser] = useState(MOCK_USERS[0])
  const [selectedDocId, setSelectedDocId] = useState(MOCK_DOCUMENTS[0].id)
  const [selectedDocTitle, setSelectedDocTitle] = useState(MOCK_DOCUMENTS[0].title)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [newAnnotation, setNewAnnotation] = useState({
    chunkIndex: 0,
    highlightedText: '',
    content: '',
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  useEffect(() => {
    loadAnnotations()
    loadNotifications()
  }, [selectedDocId])

  const loadAnnotations = async () => {
    setIsLoading(true)
    try {
      const response = await apiService.getDocumentAnnotations(selectedDocId)
      setAnnotations(response.annotations)
    } catch (error) {
      console.error('Failed to load annotations:', error)
      setAnnotations([])
    } finally {
      setIsLoading(false)
    }
  }

  const loadNotifications = async () => {
    try {
      const response = await apiService.getNotifications(currentUser.id)
      setNotifications(response.notifications)
    } catch (error) {
      console.error('Failed to load notifications:', error)
      setNotifications([])
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  const extractMentions = (text: string): string[] => {
    const mentionRegex = /@(\w+[\s]?\w*)/g
    const matches: string[] = []
    let match
    while ((match = mentionRegex.exec(text)) !== null) {
      matches.push(match[1])
    }
    return matches
  }

  const handleCreateAnnotation = async () => {
    if (!newAnnotation.content.trim()) return

    try {
      const response = await apiService.createAnnotation({
        document_id: selectedDocId,
        chunk_index: newAnnotation.chunkIndex,
        start_offset: 0,
        end_offset: newAnnotation.highlightedText.length,
        highlighted_text: newAnnotation.highlightedText || 'Manual annotation',
        user_id: currentUser.id,
        user_name: currentUser.name,
        content: newAnnotation.content,
        mentions: extractMentions(newAnnotation.content),
      })
      setAnnotations((prev) => [...prev, response])
      setNewAnnotation({ chunkIndex: 0, highlightedText: '', content: '' })
      loadNotifications()
    } catch (error) {
      console.error('Failed to create annotation:', error)
    }
  }

  const handleReply = async (parentId: string, content: string) => {
    if (!content.trim()) return

    try {
      const parentAnnotation = annotations.find((a) => a.id === parentId)
      const response = await apiService.createAnnotation({
        document_id: selectedDocId,
        chunk_index: parentAnnotation?.chunk_index || 0,
        start_offset: 0,
        end_offset: 0,
        highlighted_text: '',
        user_id: currentUser.id,
        user_name: currentUser.name,
        content,
        parent_id: parentId,
        mentions: extractMentions(content),
      })
      setAnnotations((prev) => [...prev, response])
      setReplyTo(null)
      loadNotifications()
    } catch (error) {
      console.error('Failed to reply:', error)
    }
  }

  const handleVote = async (annotationId: string) => {
    const annotation = annotations.find((a) => a.id === annotationId)
    if (!annotation) return

    const hasVoted = annotation.voters.includes(currentUser.id)
    try {
      const response = await apiService.voteAnnotation(
        annotationId,
        currentUser.id,
        hasVoted ? 'remove' : 'up'
      )
      setAnnotations((prev) =>
        prev.map((a) => (a.id === annotationId ? response : a))
      )
    } catch (error) {
      console.error('Failed to vote:', error)
    }
  }

  const handleResolve = async (annotationId: string) => {
    try {
      const response = await apiService.resolveAnnotation(annotationId, currentUser.id)
      setAnnotations((prev) =>
        prev.map((a) => (a.id === annotationId ? response : a))
      )
    } catch (error) {
      console.error('Failed to resolve:', error)
    }
  }

  const handleDelete = async (annotationId: string) => {
    try {
      await apiService.deleteAnnotation(annotationId, currentUser.id)
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId))
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  const handleEdit = async (annotationId: string) => {
    if (!editContent.trim()) return
    try {
      const response = await apiService.updateAnnotation(
        annotationId,
        currentUser.id,
        editContent
      )
      setAnnotations((prev) =>
        prev.map((a) => (a.id === annotationId ? response : a))
      )
      setEditingId(null)
      setEditContent('')
    } catch (error) {
      console.error('Failed to update:', error)
    }
  }

  const handleMarkRead = async (notificationId: string) => {
    try {
      await apiService.markNotificationRead(currentUser.id, notificationId)
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      )
    } catch (error) {
      console.error('Failed to mark read:', error)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await apiService.markAllNotificationsRead(currentUser.id)
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch (error) {
      console.error('Failed to mark all read:', error)
    }
  }

  const topLevelAnnotations = annotations.filter((a) => !a.parent_id)
  const getReplies = (parentId: string) => annotations.filter((a) => a.parent_id === parentId)

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return 'Now'
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const renderAnnotation = (annotation: Annotation, depth: number = 0) => {
    const replies = getReplies(annotation.id!)
    const isOwner = annotation.user_id === currentUser.id
    const hasVoted = annotation.voters.includes(currentUser.id)

    return (
      <Card
        key={annotation.id}
        variant="outlined"
        sx={{
          borderRadius: 2,
          ml: depth * 2,
          mb: 1,
          opacity: annotation.resolved ? 0.6 : 1,
        }}
      >
        <CardContent sx={{ py: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
              <Person fontSize="small" />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="subtitle2" fontWeight="bold">
                  {annotation.user_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatTime(annotation.created_at)}
                </Typography>
                {annotation.resolved && (
                  <Chip
                    size="small"
                    icon={<Check fontSize="small" />}
                    label="Resolved"
                    color="success"
                    variant="outlined"
                  />
                )}
                {annotation.mentions && annotation.mentions.length > 0 && (
                  <Stack direction="row" spacing={0.5}>
                    {annotation.mentions.map((m, i) => (
                      <Chip
                        key={i}
                        size="small"
                        label={`@${m}`}
                        color="secondary"
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                )}
              </Box>

              {editingId === annotation.id ? (
                <Box>
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    size="small"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    sx={{ mb: 1 }}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleEdit(annotation.id!)}
                    >
                      Save
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        setEditingId(null)
                        setEditContent('')
                      }}
                    >
                      Cancel
                    </Button>
                  </Stack>
                </Box>
              ) : (
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {annotation.content}
                </Typography>
              )}

              {annotation.highlighted_text && (
                <Box
                  sx={{
                    p: 1,
                    bgcolor: 'info.light',
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                    mb: 1,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                    Highlighted text:
                  </Typography>
                  <Typography variant="body2" color="text.primary">
                    {annotation.highlighted_text}
                  </Typography>
                </Box>
              )}

              <Stack direction="row" spacing={0.5}>
                <Tooltip title={hasVoted ? 'Remove vote' : 'Useful'}>
                  <IconButton
                    size="small"
                    color={hasVoted ? 'primary' : 'default'}
                    onClick={() => handleVote(annotation.id!)}
                  >
                    <ThumbUp fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', mr: 1 }}>
                  {annotation.votes}
                </Typography>

                <Tooltip title="Reply">
                  <IconButton
                    size="small"
                    onClick={() => {
                      setReplyTo(replyTo === annotation.id ? null : annotation.id!)
                    }}
                  >
                    <Reply fontSize="small" />
                  </IconButton>
                </Tooltip>

                {isOwner && (
                  <>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setEditingId(annotation.id!)
                          setEditContent(annotation.content)
                        }}
                      >
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {!annotation.resolved && (
                      <Tooltip title="Mark as resolved">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleResolve(annotation.id!)}
                        >
                          <Check fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete(annotation.id!)}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </Stack>

              {replyTo === annotation.id && (
                <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Reply... Use @ to mention users"
                    multiline
                    minRows={1}
                    id={`reply-${annotation.id}`}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        const input = document.getElementById(`reply-${annotation.id}`) as HTMLTextAreaElement
                        if (input) handleReply(annotation.id!, input.value)
                      }
                    }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => {
                      const input = document.getElementById(`reply-${annotation.id}`) as HTMLTextAreaElement
                      if (input) handleReply(annotation.id!, input.value)
                    }}
                  >
                    <Send fontSize="small" />
                  </Button>
                </Box>
              )}
            </Box>
          </Box>
        </CardContent>

        {replies.length > 0 && (
          <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1, px: 2, pb: 1 }}>
            {replies.map((reply) => renderAnnotation(reply, depth + 1))}
          </Box>
        )}
      </Card>
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
          <ChatBubble sx={{ mr: 1, color: 'primary.main' }} />
          Collaborative Annotations
          <Box sx={{ flex: 1 }} />
          <Badge badgeContent={unreadCount} color="error">
            <IconButton
              onClick={() => setNotifOpen(true)}
              sx={{ ml: 1 }}
            >
              <Notifications />
            </IconButton>
          </Badge>
        </Typography>

        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 300 }}>
            <InputLabel>Document</InputLabel>
            <Select
              value={selectedDocId}
              label="Document"
              onChange={(e) => {
                const doc = MOCK_DOCUMENTS.find((d) => d.id === e.target.value)
                setSelectedDocId(e.target.value)
                if (doc) setSelectedDocTitle(doc.title)
              }}
            >
              {MOCK_DOCUMENTS.map((doc) => (
                <MenuItem key={doc.id} value={doc.id}>
                  {doc.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={loadAnnotations}
          >
            Refresh
          </Button>
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip
            size="small"
            icon={<Add fontSize="small" />}
            label="Create annotations"
            variant="outlined"
          />
          <Chip
            size="small"
            icon={<Reply fontSize="small" />}
            label="Reply & thread"
            variant="outlined"
          />
          <Chip
            size="small"
            icon={<Notifications fontSize="small" />}
            label="@ mentions"
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
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2}>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                  <Add sx={{ mr: 1, color: 'primary.main' }} />
                  New Annotation
                </Typography>

                <TextField
                  fullWidth
                  size="small"
                  label="Selected text (optional)"
                  value={newAnnotation.highlightedText}
                  onChange={(e) =>
                    setNewAnnotation((prev) => ({ ...prev, highlightedText: e.target.value }))
                  }
                  placeholder="Paste the text you want to annotate..."
                  sx={{ mb: 2 }}
                />

                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  label="Annotation content"
                  value={newAnnotation.content}
                  onChange={(e) =>
                    setNewAnnotation((prev) => ({ ...prev, content: e.target.value }))
                  }
                  placeholder="Add your annotation... Use @ to mention other users (e.g., @Alice)"
                  sx={{ mb: 2 }}
                />

                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={handleCreateAnnotation}
                    disabled={!newAnnotation.content.trim()}
                  >
                    Add Annotation
                  </Button>
                </Box>
              </CardContent>
            </Card>

            <Divider>
              <Chip
                label={`${topLevelAnnotations.length} Annotations`}
                size="small"
                color="primary"
                variant="outlined"
              />
            </Divider>

            {topLevelAnnotations.length === 0 ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  py: 8,
                  color: 'text.secondary',
                }}
              >
                <Comment sx={{ fontSize: 48, mb: 2, opacity: 0.3 }} />
                <Typography variant="body1" gutterBottom>
                  No annotations yet
                </Typography>
                <Typography variant="body2" align="center" sx={{ maxWidth: 400 }}>
                  Be the first to annotate this document. Add your thoughts, questions,
                  and insights for other researchers to see.
                </Typography>
              </Box>
            ) : (
              topLevelAnnotations.map((annotation) => renderAnnotation(annotation))
            )}
          </Stack>
        )}
      </Box>

      <Dialog
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
          <Notifications sx={{ mr: 1 }} />
          Notifications
          <Box sx={{ flex: 1 }} />
          {unreadCount > 0 && (
            <Button size="small" onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          )}
        </DialogTitle>
        <DialogContent>
          {notifications.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body1">No notifications</Typography>
            </Box>
          ) : (
            <Stack spacing={1} sx={{ mt: 1 }}>
              {notifications.map((notif) => (
                <Card
                  key={notif.id}
                  variant="outlined"
                  sx={{
                    borderRadius: 1,
                    bgcolor: notif.read ? 'background.default' : 'info.light',
                    opacity: notif.read ? 0.7 : 1,
                  }}
                  onClick={() => !notif.read && handleMarkRead(notif.id!)}
                >
                  <CardContent sx={{ py: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main' }}>
                        <Person fontSize="small" />
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" fontWeight="bold">
                          {notif.from_user}
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 0.5 }}>
                          {notif.message}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Document: {notif.document_title}
                        </Typography>
                        {notif.highlighted_text && (
                          <Typography
                            variant="caption"
                            sx={{
                              display: 'block',
                              mt: 0.5,
                              fontStyle: 'italic',
                              color: 'text.secondary',
                            }}
                          >
                            "{notif.highlighted_text.substring(0, 50)}..."
                          </Typography>
                        )}
                      </Box>
                      {!notif.read && (
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: 'primary.main',
                          }}
                        />
                      )}
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNotifOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
