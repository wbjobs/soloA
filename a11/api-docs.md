# Markdown Notes API Documentation

## Base URL
```
http://localhost:3001/api
```

## Authentication

Most API endpoints require a valid JWT token. Include it in the Authorization header:

```
Authorization: Bearer <token>
```

---

## Auth Endpoints

### Register User
```
POST /auth/register
Content-Type: application/json
```

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "password123",
  "role": "editor"
}
```

- `username`: 3-30 characters, required
- `email`: Valid email, required, unique
- `password`: Minimum 6 characters, required
- `role`: Optional, one of `admin`, `editor`, `reader`. Default: `editor`

**Response (201):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "johndoe",
    "email": "john@example.com",
    "role": "editor"
  }
}
```

**Error Responses:**
- 400: Missing required fields or user already exists
- 500: Server error

---

### Login
```
POST /auth/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "johndoe",
    "email": "john@example.com",
    "role": "editor"
  }
}
```

**Error Responses:**
- 400: Missing required fields
- 401: Invalid email or password
- 500: Server error

---

### Get Current User
```
GET /auth/me
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "johndoe",
    "email": "john@example.com",
    "role": "editor"
  }
}
```

**Error Responses:**
- 401: Invalid or missing token
- 500: Server error

---

## Notes Endpoints

### List All Notes
```
GET /notes
Authorization: Bearer <token>
```

Returns all notes accessible to the authenticated user:
- Notes created by the user
- Notes shared with the user
- Public notes

**Response (200):**
```json
{
  "notes": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "title": "My Note",
      "content": "# Hello World",
      "createdBy": "507f1f77bcf86cd799439011",
      "isPublic": false,
      "publicPermission": "none",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z",
      "userPermission": "owner"
    }
  ]
}
```

**Note Permission Levels:**
- `owner`: Full control, can delete and manage permissions
- `editor`: Can edit content
- `reader`: Can only view
- `none`: No access

---

### Get Single Note
```
GET /notes/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "note": {
    "_id": "507f1f77bcf86cd799439012",
    "title": "My Note",
    "content": "# Hello World",
    "createdBy": "507f1f77bcf86cd799439011",
    "permissions": {
      "507f1f77bcf86cd799439011": "owner",
      "507f1f77bcf86cd799439013": "editor"
    },
    "isPublic": false,
    "publicPermission": "none",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z",
    "lastModifiedBy": "507f1f77bcf86cd799439011",
    "userPermission": "owner"
  }
}
```

**Error Responses:**
- 403: Access denied
- 404: Note not found

---

### Create Note
```
POST /notes
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "New Note",
  "content": "# Hello World"
}
```

- `title`: Optional, default: "Untitled Note"
- `content`: Optional, default: ""

**Response (201):**
```json
{
  "note": {
    "_id": "507f1f77bcf86cd799439012",
    "title": "New Note",
    "content": "# Hello World",
    "createdBy": "507f1f77bcf86cd799439011",
    "permissions": {
      "507f1f77bcf86cd799439011": "owner"
    },
    "isPublic": false,
    "publicPermission": "none",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "userPermission": "owner"
  }
}
```

---

### Update Note
```
PUT /notes/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Updated Title",
  "content": "# Updated Content",
  "createVersion": true,
  "changeSummary": "Major update"
}
```

- `title`: Optional
- `content`: Optional
- `createVersion`: Optional, default: `true`. Set to `false` to skip version creation
- `changeSummary`: Optional, description of changes

**Permissions Required:** `editor` or `owner`

**Response (200):** Same as GET /notes/:id

**Error Responses:**
- 403: Access denied
- 404: Note not found

---

### Delete Note
```
DELETE /notes/:id
Authorization: Bearer <token>
```

Deletes the note and all its versions.

**Permissions Required:** `owner`

**Response (200):**
```json
{
  "message": "Note deleted successfully"
}
```

**Error Responses:**
- 403: Access denied
- 404: Note not found

---

## Version Control Endpoints

### List Note Versions
```
GET /notes/:id/versions
Authorization: Bearer <token>
```

Returns up to 100 most recent versions.

**Permissions Required:** Any valid permission (`reader`, `editor`, `owner`)

**Response (200):**
```json
{
  "versions": [
    {
      "_id": "507f1f77bcf86cd799439014",
      "noteId": "507f1f77bcf86cd799439012",
      "title": "My Note",
      "content": "# Hello World",
      "createdBy": {
        "_id": "507f1f77bcf86cd799439011",
        "username": "johndoe"
      },
      "versionNumber": 2,
      "changeSummary": "Updated content",
      "createdAt": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

---

### Get Specific Version
```
GET /notes/:id/versions/:versionId
Authorization: Bearer <token>
```

**Response (200):** Same as single version object above

---

### Restore Version
```
POST /notes/:id/versions/:versionId/restore
Authorization: Bearer <token>
```

Restores the note to the specified version. Creates a new version with current state before restoring.

**Permissions Required:** `editor` or `owner`

**Response (200):** Same as GET /notes/:id

**Error Responses:**
- 403: Access denied
- 404: Note or version not found

---

## Permissions Endpoints

### Update Note Permissions
```
PUT /notes/:id/permissions
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "permissions": {
    "userId1": "editor",
    "userId2": "reader",
    "userId3": null
  },
  "isPublic": true,
  "publicPermission": "reader"
}
```

- `permissions`: Map of user IDs to permission levels. Use `null` to remove access.
  - Valid values: `editor`, `reader`
- `isPublic`: Boolean, whether the note is publicly accessible
- `publicPermission`: Access level for public users (`none`, `reader`, `editor`)

**Permissions Required:** `owner`

**Response (200):** Same as GET /notes/:id

**Error Responses:**
- 403: Access denied
- 404: Note not found

---

## WebSocket (Socket.io) Events

### Connection
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: { token: '<jwt-token>' }
});
```

---

### Join Note
```javascript
socket.emit('join-note', { noteId: 'note-id-here' });
```

**Server Events:**
- `note-joined`: Successfully joined
  ```json
  {
    "noteId": "...",
    "content": "...",
    "title": "...",
    "permission": "owner",
    "users": [...]
  }
  ```
- `error`: Failed to join
  ```json
  { "message": "Note not found" }
  ```

---

### Leave Note
```javascript
socket.emit('leave-note', { noteId: 'note-id-here' });
```

---

### Document Updates
```javascript
// Send update
socket.emit('doc-update', {
  noteId: 'note-id-here',
  content: '# Updated content',
  title: 'Updated Title',
  cursor: { from: 10, to: 10 }
});
```

**Receive remote updates:**
```javascript
socket.on('doc-update', (data) => {
  console.log('Content changed by:', data.username);
  // Apply data.content to editor
});

socket.on('title-update', (data) => {
  console.log('Title changed by:', data.username);
  // Update data.title
});
```

---

### Cursor Synchronization
```javascript
// Send cursor position
socket.emit('cursor-update', {
  noteId: 'note-id-here',
  cursor: { from: 15, to: 20 }
});

// Receive remote cursors
socket.on('cursor-update', (data) => {
  console.log('Cursor from:', data.username);
  console.log('Position:', data.cursor);
});
```

---

### Save Note
```javascript
socket.emit('save-note', {
  noteId: 'note-id-here',
  content: '# Content',
  title: 'Title'
});
```

**Server Events:**
- `save-success`: Save succeeded
- `save-error`: Save failed
- `note-saved`: Broadcast to all users in the note

---

### Collaborator Updates
```javascript
socket.on('users-updated', (data) => {
  console.log('Active users:', data.users);
  // data.users: Array of { id, username, cursor, permission }
});
```

---

## Health Check
```
GET /health
```

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

---

## Error Response Format
All error responses follow this format:

```json
{
  "error": "Human-readable error message"
}
```

**Common HTTP Status Codes:**
- 400: Bad request (missing/invalid parameters)
- 401: Unauthorized (not logged in)
- 403: Forbidden (insufficient permissions)
- 404: Resource not found
- 500: Internal server error

---

## User Roles

There are three user roles that affect system-wide permissions:

| Role | Description |
|------|-------------|
| `admin` | Full system access |
| `editor` | Can create and edit notes |
| `reader` | Can only view notes shared with them |

Note: These are different from note-level permissions (`owner`, `editor`, `reader`). User roles apply to the entire system, while note permissions apply to individual notes.
