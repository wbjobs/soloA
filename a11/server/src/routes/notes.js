const express = require('express');
const mongoose = require('mongoose');
const Note = require('../models/Note');
const NoteVersion = require('../models/NoteVersion');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const restApiVersionLocks = new Map();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const userIdStr = userId.toString();
    
    const notes = await Note.find({
      $or: [
        { createdBy: userId },
        { [`permissions.${userIdStr}`]: { $exists: true } },
        { isPublic: true, publicPermission: { $ne: 'none' } }
      ]
    }).sort({ updatedAt: -1 });
    
    const notesWithPermission = notes.map(note => ({
      ...note.toObject(),
      userPermission: getEffectivePermission(note, userIdStr)
    }));
    
    res.json({ notes: notesWithPermission });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userIdStr = req.user._id.toString();
    
    const note = await Note.findById(id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    const permission = getEffectivePermission(note, userIdStr);
    if (permission === 'none') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({
      note: {
        ...note.toObject(),
        userPermission: permission
      }
    });
  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, content } = req.body;
    const userId = req.user._id;
    
    const note = new Note({
      title: title || 'Untitled Note',
      content: content || '',
      createdBy: userId,
      lastModifiedBy: userId
    });
    
    note.permissions.set(userId.toString(), 'owner');
    await note.save();
    
    await createVersion(note, userId, 'Initial version');
    
    res.status(201).json({
      note: {
        ...note.toObject(),
        userPermission: 'owner'
      }
    });
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, createVersion = true, changeSummary = '' } = req.body;
    const userId = req.user._id;
    const userIdStr = userId.toString();
    
    const note = await Note.findById(id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    if (!note.hasPermission(userIdStr, 'editor')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const hasChanges = 
      (title !== undefined && title !== note.title) ||
      (content !== undefined && content !== note.content);
    
    if (!hasChanges) {
      return res.json({ note: { ...note.toObject(), userPermission: getEffectivePermission(note, userIdStr) } });
    }
    
    if (title !== undefined) note.title = title;
    if (content !== undefined) note.content = content;
    note.lastModifiedBy = userId;
    
    if (createVersion) {
      await createVersion(note, userId, changeSummary);
    }
    
    await note.save();
    
    res.json({
      note: {
        ...note.toObject(),
        userPermission: getEffectivePermission(note, userIdStr)
      }
    });
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userIdStr = req.user._id.toString();
    
    const note = await Note.findById(id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    if (!note.hasPermission(userIdStr, 'owner')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await Note.deleteOne({ _id: id });
    await NoteVersion.deleteMany({ noteId: id });
    
    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/versions', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userIdStr = req.user._id.toString();
    
    const note = await Note.findById(id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    if (getEffectivePermission(note, userIdStr) === 'none') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const versions = await NoteVersion.find({ noteId: id })
      .sort({ versionNumber: -1 })
      .populate('createdBy', 'username')
      .limit(100);
    
    res.json({ versions });
  } catch (error) {
    console.error('Get versions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/versions/:versionId/restore', authenticateToken, async (req, res) => {
  try {
    const { id, versionId } = req.params;
    const userId = req.user._id;
    const userIdStr = userId.toString();
    
    const note = await Note.findById(id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    if (!note.hasPermission(userIdStr, 'editor')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const version = await NoteVersion.findById(versionId);
    if (!version || version.noteId.toString() !== id) {
      return res.status(404).json({ error: 'Version not found' });
    }
    
    await createVersion(note, userId, `Restored to version ${version.versionNumber}`);
    
    note.title = version.title;
    note.content = version.content;
    note.lastModifiedBy = userId;
    await note.save();
    
    res.json({
      note: {
        ...note.toObject(),
        userPermission: getEffectivePermission(note, userIdStr)
      }
    });
  } catch (error) {
    console.error('Restore version error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/permissions', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions, isPublic, publicPermission } = req.body;
    const userIdStr = req.user._id.toString();
    
    const note = await Note.findById(id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    if (!note.hasPermission(userIdStr, 'owner')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (permissions) {
      for (const [uid, level] of Object.entries(permissions)) {
        if (level === null) {
          note.permissions.delete(uid);
        } else if (['editor', 'reader'].includes(level)) {
          note.permissions.set(uid, level);
        }
      }
    }
    
    if (isPublic !== undefined) note.isPublic = isPublic;
    if (publicPermission !== undefined && ['none', 'reader', 'editor'].includes(publicPermission)) {
      note.publicPermission = publicPermission;
    }
    
    note.lastModifiedBy = req.user._id;
    await note.save();
    
    res.json({
      note: {
        ...note.toObject(),
        userPermission: 'owner'
      }
    });
  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/versions/:versionId', authenticateToken, async (req, res) => {
  try {
    const { id, versionId } = req.params;
    const userIdStr = req.user._id.toString();
    
    const note = await Note.findById(id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    if (getEffectivePermission(note, userIdStr) === 'none') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const version = await NoteVersion.findById(versionId)
      .populate('createdBy', 'username');
    
    if (!version || version.noteId.toString() !== id) {
      return res.status(404).json({ error: 'Version not found' });
    }
    
    res.json({ version });
  } catch (error) {
    console.error('Get version error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

async function acquireRestApiVersionLock(noteId) {
  const maxWait = 5000;
  const waitInterval = 50;
  let waited = 0;
  
  while (restApiVersionLocks.has(noteId.toString()) && waited < maxWait) {
    await new Promise(resolve => setTimeout(resolve, waitInterval));
    waited += waitInterval;
  }
  
  if (waited >= maxWait) {
    throw new Error('Failed to acquire version lock');
  }
  
  restApiVersionLocks.set(noteId.toString(), true);
  return true;
}

function releaseRestApiVersionLock(noteId) {
  restApiVersionLocks.delete(noteId.toString());
}

async function createVersion(note, userId, changeSummary = '') {
  const noteId = note._id;
  
  await acquireRestApiVersionLock(noteId);
  
  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const latestVersion = await NoteVersion.findOne({ noteId })
        .sort({ versionNumber: -1 })
        .session(session);
      
      const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;
      
      const version = new NoteVersion({
        noteId: note._id,
        title: note.title,
        content: note.content,
        createdBy: userId,
        versionNumber,
        changeSummary
      });
      
      await version.save({ session });
      
      await session.commitTransaction();
      return version;
    } catch (error) {
      await session.abortTransaction();
      
      if (error.code === 11000) {
        console.warn('REST API version conflict detected, retrying...');
        return await createVersion(note, userId, changeSummary);
      }
      
      throw error;
    } finally {
      session.endSession();
    }
  } finally {
    releaseRestApiVersionLock(noteId);
  }
}

module.exports = router;
