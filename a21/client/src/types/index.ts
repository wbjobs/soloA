export interface User {
  id: string
  username: string
  email: string
  role: 'reader' | 'editor' | 'admin'
  avatarColor: string
  createdAt?: string
}

export interface Document {
  id: string
  title: string
  ownerId: string
  ownerName: string
  userRole: 'reader' | 'editor' | 'admin' | 'owner'
  createdAt: string
  updatedAt: string
}

export interface DocumentVersion {
  id: string
  versionNumber: number
  contentSnapshot: string
  createdBy: string
  createdByName: string
  createdAt: string
}

export interface CommentReply {
  id: string
  commentId: string
  authorId: string
  authorName: string
  authorColor: string
  content: string
  createdAt: string
}

export interface Comment {
  id: string
  documentId: string
  authorId: string
  authorName: string
  authorColor: string
  anchorFrom: Record<string, any>
  anchorTo: Record<string, any>
  selectedText: string
  createdAt: string
  resolvedAt?: string
  resolvedBy?: string
  replies: CommentReply[]
}

export interface RemoteUser {
  userId: string
  username: string
  color: string
}

export interface RemoteCursor {
  userId: string
  username: string
  color: string
  anchor?: number
  head?: number
}
