const express = require('express');
const Comment = require('../models/Comment');
const Note = require('../models/Note');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/notes/:noteId', authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userIdStr = req.user._id.toString();
    
    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    const permission = getEffectivePermission(note, userIdStr);
    if (permission === 'none') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const comments = await Comment.find({ 
      noteId, 
      isDeleted: false,
      parentId: null
    })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'username email')
      .populate('resolvedBy', 'username');
    
    const commentIds = comments.map(c => c._id);
    const replies = await Comment.find({
      noteId,
      isDeleted: false,
      parentId: { $in: commentIds }
    })
      .sort({ createdAt: 1 })
      .populate('createdBy', 'username email')
      .populate('resolvedBy', 'username');
    
    const repliesMap = new Map();
    for (const reply of replies) {
      const parentId = reply.parentId.toString();
      if (!repliesMap.has(parentId)) {
        repliesMap.set(parentId, []);
      }
      repliesMap.get(parentId).push(reply);
    }
    
    const commentsWithReplies = comments.map(comment => ({
      ...comment.toObject(),
      replies: repliesMap.get(comment._id.toString()) || []
    }));
    
    const mentionedUsers = new Set();
    for (const comment of comments) {
      for (const mention of comment.mentions) {
        mentionedUsers.add(mention.userId.toString());
      }
    }
    
    res.json({ 
      comments: commentsWithReplies,
      mentionedUserIds: Array.from(mentionedUsers)
    });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/notes/:noteId', authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { content, parentId, position } = req.body;
    const userId = req.user._id;
    const userIdStr = userId.toString();
    
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content is required' });
    }
    
    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    const permission = getEffectivePermission(note, userIdStr);
    if (permission === 'none') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (parentId) {
      const parentComment = await Comment.findOne({ _id: parentId, noteId });
      if (!parentComment) {
        return res.status(404).json({ error: 'Parent comment not found' });
      }
    }
    
    const comment = new Comment({
      noteId,
      parentId: parentId || null,
      content: content.trim(),
      createdBy: userId,
      position: position || null,
      mentions: []
    });
    
    const mentionPattern = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentions = [];
    let match;
    const mentionUserIds = [];
    
    while ((match = mentionPattern.exec(content)) !== null) {
      const mentionedUserId = match[2];
      if (!mentionUserIds.includes(mentionedUserId)) {
        mentionUserIds.push(mentionedUserId);
        mentions.push({
          userId: mentionedUserId,
          username: match[1],
          mentionedAt: match.index
        });
      }
    }
    
    if (mentions.length > 0) {
      const validUsers = await User.find({ _id: { $in: mentionUserIds } });
      const validUserIds = new Set(validUsers.map(u => u._id.toString()));
      comment.mentions = mentions.filter(m => validUserIds.has(m.userId.toString()));
    }
    
    await comment.save();
    
    await comment.populate('createdBy', 'username email');
    
    res.status(201).json({ comment });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:commentId', authenticateToken, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content, resolved } = req.body;
    const userIdStr = req.user._id.toString();
    
    const comment = await Comment.findById(commentId).populate('createdBy', 'username');
    if (!comment || comment.isDeleted) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    const note = await Note.findById(comment.noteId);
    const notePermission = note ? getEffectivePermission(note, userIdStr) : 'none';
    
    const isOwner = comment.createdBy._id.toString() === userIdStr;
    const hasEditPermission = isOwner || notePermission === 'owner';
    
    if (!hasEditPermission) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    if (content !== undefined && isOwner) {
      comment.content = content.trim();
      
      const mentionPattern = /@\[([^\]]+)\]\(([^)]+)\)/g;
      const mentions = [];
      let match;
      const mentionUserIds = [];
      
      while ((match = mentionPattern.exec(content)) !== null) {
        const mentionedUserId = match[2];
        if (!mentionUserIds.includes(mentionedUserId)) {
          mentionUserIds.push(mentionedUserId);
          mentions.push({
            userId: mentionedUserId,
            username: match[1],
            mentionedAt: match.index
          });
        }
      }
      
      if (mentions.length > 0) {
        const validUsers = await User.find({ _id: { $in: mentionUserIds } });
        const validUserIds = new Set(validUsers.map(u => u._id.toString()));
        comment.mentions = mentions.filter(m => validUserIds.has(m.userId.toString()));
      } else {
        comment.mentions = [];
      }
    }
    
    if (resolved !== undefined && notePermission !== 'none') {
      if (resolved) {
        comment.resolvedAt = new Date();
        comment.resolvedBy = req.user._id;
      } else {
        comment.resolvedAt = null;
        comment.resolvedBy = null;
      }
    }
    
    await comment.save();
    await comment.populate('resolvedBy', 'username');
    
    res.json({ comment });
  } catch (error) {
    console.error('Update comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:commentId', authenticateToken, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userIdStr = req.user._id.toString();
    
    const comment = await Comment.findById(commentId);
    if (!comment || comment.isDeleted) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    const note = await Note.findById(comment.noteId);
    const notePermission = note ? getEffectivePermission(note, userIdStr) : 'none';
    
    const isOwner = comment.createdBy.toString() === userIdStr;
    const hasDeletePermission = isOwner || notePermission === 'owner';
    
    if (!hasDeletePermission) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    comment.isDeleted = true;
    comment.deletedAt = new Date();
    comment.content = '[Comment deleted]';
    comment.mentions = [];
    
    await comment.save();
    
    await Comment.updateMany(
      { parentId: commentId, isDeleted: false },
      { isDeleted: true, deletedAt: new Date(), content: '[Comment deleted]' }
    );
    
    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:commentId/reactions', authenticateToken, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;
    const userIdStr = userId.toString();
    
    if (!emoji || !emoji.trim()) {
      return res.status(400).json({ error: 'Emoji is required' });
    }
    
    const comment = await Comment.findById(commentId);
    if (!comment || comment.isDeleted) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    const note = await Note.findById(comment.noteId);
    const permission = note ? getEffectivePermission(note, userIdStr) : 'none';
    if (permission === 'none') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    let reactionIndex = comment.reactions.findIndex(r => r.emoji === emoji);
    
    if (reactionIndex === -1) {
      comment.reactions.push({
        emoji,
        users: [userId]
      });
    } else {
      const userIndex = comment.reactions[reactionIndex].users.findIndex(
        u => u.toString() === userIdStr
      );
      
      if (userIndex === -1) {
        comment.reactions[reactionIndex].users.push(userId);
      } else {
        comment.reactions[reactionIndex].users.splice(userIndex, 1);
        if (comment.reactions[reactionIndex].users.length === 0) {
          comment.reactions.splice(reactionIndex, 1);
        }
      }
    }
    
    await comment.save();
    
    res.json({ 
      reactions: comment.reactions,
      toggledEmoji: emoji
    });
  } catch (error) {
    console.error('Toggle reaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/notes/:noteId/mentionable-users', authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { search = '' } = req.query;
    const userIdStr = req.user._id.toString();
    
    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    const permission = getEffectivePermission(note, userIdStr);
    if (permission === 'none') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const mentionableUserIds = new Set();
    mentionableUserIds.add(note.createdBy.toString());
    
    for (const [uid] of note.permissions) {
      mentionableUserIds.add(uid);
    }
    
    mentionableUserIds.delete(userIdStr);
    
    let query = { _id: { $in: Array.from(mentionableUserIds) } };
    
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const users = await User.find(query)
      .select('username email')
      .limit(10);
    
    res.json({ users });
  } catch (error) {
    console.error('Get mentionable users error:', error);
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

module.exports = router;
