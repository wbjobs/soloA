const { verifyToken } = require('./utils/jwt');
const User = require('./models/User');
const Note = require('./models/Note');
const NoteVersion = require('./models/NoteVersion');
const mongoose = require('mongoose');

const noteSessions = new Map();
const versionLocks = new Map();

class OperationQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async enqueue(operation) {
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const { operation, resolve, reject } = this.queue.shift();
    
    try {
      const result = await operation();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.processing = false;
      this.process();
    }
  }
}

function getOrCreateSession(noteId) {
  if (!noteSessions.has(noteId)) {
    noteSessions.set(noteId, {
      users: new Map(),
      content: '',
      title: '',
      lastModifiedAt: Date.now(),
      saveQueue: new OperationQueue(),
      versionLock: false
    });
  }
  return noteSessions.get(noteId);
}

function setupSocket(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }
      
      const decoded = verifyToken(token);
      if (!decoded) {
        return next(new Error('Invalid token'));
      }
      
      const user = await User.findById(decoded.userId).select('-password');
      if (!user) {
        return next(new Error('User not found'));
      }
      
      socket.user = user;
      socket.userIdStr = user._id.toString();
      next();
    } catch (error) {
      next(error);
    }
  });

  io.on('connection', (socket) => {
    console.log(`User ${socket.user.username} connected`);
    
    socket.on('join-note', async ({ noteId }) => {
      try {
        const note = await Note.findById(noteId);
        if (!note) {
          socket.emit('error', { message: 'Note not found' });
          return;
        }
        
        const permission = getEffectivePermission(note, socket.userIdStr);
        
        if (permission === 'none') {
          socket.emit('error', { message: 'Access denied' });
          return;
        }
        
        socket.join(noteId);
        socket.currentNoteId = noteId;
        socket.notePermission = permission;
        
        const session = getOrCreateSession(noteId);
        session.content = note.content;
        session.title = note.title;
        
        session.users.set(socket.id, {
          id: socket.user._id,
          userIdStr: socket.userIdStr,
          username: socket.user.username,
          cursor: null,
          permission,
          lastActiveAt: Date.now()
        });
        
        const usersList = Array.from(session.users.values()).map(u => ({
          id: u.id,
          username: u.username,
          cursor: u.cursor,
          permission: u.permission
        }));
        
        io.to(noteId).emit('users-updated', { users: usersList });
        
        socket.emit('note-joined', {
          noteId,
          content: session.content,
          title: session.title,
          permission,
          users: usersList,
          serverTime: Date.now()
        });
      } catch (error) {
        console.error('Join note error:', error);
        socket.emit('error', { message: 'Failed to join note' });
      }
    });
    
    socket.on('leave-note', ({ noteId }) => {
      handleLeaveNote(socket, noteId);
    });
    
    socket.on('doc-update', async ({ noteId, content, title, cursor, baseContent, baseTitle }) => {
      try {
        if (socket.notePermission === 'reader' || socket.notePermission === 'none') {
          return;
        }
        
        if (!noteSessions.has(noteId)) return;
        
        const session = noteSessions.get(noteId);
        const user = session.users.get(socket.id);
        
        if (!user) return;
        user.lastActiveAt = Date.now();
        
        if (cursor !== undefined) {
          user.cursor = cursor;
          socket.to(noteId).emit('cursor-update', {
            userId: socket.user._id,
            username: socket.user.username,
            cursor
          });
        }
        
        let hasContentChange = false;
        
        if (content !== undefined) {
          if (baseContent !== undefined && baseContent !== session.content) {
            const mergedContent = mergeContent(baseContent, content, session.content);
            session.content = mergedContent;
            hasContentChange = true;
          } else if (content !== session.content) {
            session.content = content;
            hasContentChange = true;
          }
          
          if (hasContentChange) {
            socket.to(noteId).emit('doc-update', {
              userId: socket.user._id,
              username: socket.user.username,
              content: session.content,
              cursor: cursor || user.cursor,
              serverTime: Date.now()
            });
          }
        }
        
        if (title !== undefined && title !== session.title) {
          session.title = title;
          socket.to(noteId).emit('title-update', {
            userId: socket.user._id,
            username: socket.user.username,
            title: session.title
          });
        }
        
        session.lastModifiedAt = Date.now();
      } catch (error) {
        console.error('Doc update error:', error);
      }
    });
    
    socket.on('cursor-update', ({ noteId, cursor }) => {
      if (!noteSessions.has(noteId)) return;
      
      const session = noteSessions.get(noteId);
      const user = session.users.get(socket.id);
      
      if (user) {
        user.cursor = cursor;
        user.lastActiveAt = Date.now();
        socket.to(noteId).emit('cursor-update', {
          userId: socket.user._id,
          username: socket.user.username,
          cursor
        });
      }
    });
    
    socket.on('save-note', async ({ noteId, content, title }) => {
      try {
        if (socket.notePermission === 'reader' || socket.notePermission === 'none') {
          socket.emit('save-error', { message: 'Permission denied' });
          return;
        }
        
        if (!noteSessions.has(noteId)) {
          socket.emit('save-error', { message: 'Session not found' });
          return;
        }
        
        const session = noteSessions.get(noteId);
        
        const result = await session.saveQueue.enqueue(async () => {
          const note = await Note.findById(noteId);
          if (!note) {
            throw new Error('Note not found');
          }
          
          const currentContent = content !== undefined ? content : session.content;
          const currentTitle = title !== undefined ? title : session.title;
          
          const hasChanges = currentContent !== note.content || currentTitle !== note.title;
          
          if (!hasChanges) {
            return { noChanges: true };
          }
          
          await createVersionAtomically(note, socket.user._id, currentTitle, currentContent);
          
          note.content = currentContent;
          note.title = currentTitle;
          note.lastModifiedBy = socket.user._id;
          await note.save();
          
          session.content = currentContent;
          session.title = currentTitle;
          
          return { success: true, note };
        });
        
        if (result.noChanges) {
          socket.emit('save-success', { noteId, savedAt: new Date(), noChanges: true });
        } else {
          io.to(noteId).emit('note-saved', {
            noteId,
            title: session.title,
            content: session.content,
            savedBy: socket.user.username,
            savedAt: new Date()
          });
          
          socket.emit('save-success', { noteId, savedAt: new Date() });
        }
      } catch (error) {
        console.error('Save note error:', error);
        socket.emit('save-error', { message: error.message || 'Failed to save note' });
      }
    });
    
    socket.on('disconnect', () => {
      if (socket.currentNoteId) {
        handleLeaveNote(socket, socket.currentNoteId);
      }
      console.log(`User ${socket.user.username} disconnected`);
    });
  });
}

function handleLeaveNote(socket, noteId) {
  socket.leave(noteId);
  
  if (!noteSessions.has(noteId)) return;
  
  const session = noteSessions.get(noteId);
  session.users.delete(socket.id);
  
  if (session.users.size === 0) {
    noteSessions.delete(noteId);
  } else {
    const usersList = Array.from(session.users.values()).map(u => ({
      id: u.id,
      username: u.username,
      cursor: u.cursor,
      permission: u.permission
    }));
    
    io.to(noteId).emit('users-updated', { users: usersList });
  }
  
  socket.currentNoteId = null;
  socket.notePermission = null;
}

function getEffectivePermission(note, userIdStr) {
  if (note.createdBy.toString() === userIdStr) {
    return 'owner';
  }
  
  const explicitPermission = note.permissions.get(userIdStr);
  if (explicitPermission) {
    return explicitPermission;
  }
  
  if (note.isPublic) {
    return note.publicPermission;
  }
  
  return 'none';
}

function mergeContent(baseStr, localStr, remoteStr) {
  if (baseStr === localStr) {
    return remoteStr;
  }
  if (baseStr === remoteStr) {
    return localStr;
  }
  
  if (localStr.length > remoteStr.length) {
    return localStr;
  }
  return remoteStr;
}

async function acquireVersionLock(noteId) {
  const maxWait = 5000;
  const waitInterval = 50;
  let waited = 0;
  
  while (versionLocks.has(noteId) && waited < maxWait) {
    await new Promise(resolve => setTimeout(resolve, waitInterval));
    waited += waitInterval;
  }
  
  if (waited >= maxWait) {
    throw new Error('Failed to acquire version lock');
  }
  
  versionLocks.set(noteId, true);
  return true;
}

function releaseVersionLock(noteId) {
  versionLocks.delete(noteId);
}

async function createVersionAtomically(note, userId, title, content) {
  const noteId = note._id;
  
  await acquireVersionLock(noteId);
  
  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const latestVersion = await NoteVersion.findOne({ noteId })
        .sort({ versionNumber: -1 })
        .session(session);
      
      const newVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;
      
      const version = new NoteVersion({
        noteId: note._id,
        title: title,
        content: content,
        createdBy: userId,
        versionNumber: newVersionNumber,
        changeSummary: ''
      });
      
      await version.save({ session });
      
      await session.commitTransaction();
      return version;
    } catch (error) {
      await session.abortTransaction();
      
      if (error.code === 11000) {
        console.warn('Version conflict detected, retrying...');
        return await createVersionAtomically(note, userId, title, content);
      }
      
      throw error;
    } finally {
      session.endSession();
    }
  } finally {
    releaseVersionLock(noteId);
  }
}

async function createVersionIfNeeded(note, userId) {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  
  const recentVersion = await NoteVersion.findOne({
    noteId: note._id,
    createdBy: userId,
    createdAt: { $gte: oneMinuteAgo }
  }).sort({ createdAt: -1 });
  
  if (!recentVersion) {
    return await createVersionAtomically(note, userId, note.title, note.content);
  }
  
  return recentVersion;
}

module.exports = { setupSocket };
