const mongoose = require('mongoose');

const mentionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  mentionedAt: {
    type: Number,
    required: true
  }
});

const commentSchema = new mongoose.Schema({
  noteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Note',
    required: true,
    index: true
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null,
    index: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  mentions: [mentionSchema],
  resolvedAt: {
    type: Date,
    default: null
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  position: {
    start: {
      line: Number,
      column: Number,
      offset: Number
    },
    end: {
      line: Number,
      column: Number,
      offset: Number
    },
    selectedText: String
  },
  reactions: [{
    emoji: String,
    users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  }],
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

commentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

commentSchema.methods.parseMentions = async function(content) {
  const mentionPattern = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const mentions = [];
  let match;
  
  while ((match = mentionPattern.exec(content)) !== null) {
    const username = match[1];
    const userId = match[2];
    
    if (!mentions.find(m => m.userId.toString() === userId)) {
      mentions.push({
        userId,
        username,
        mentionedAt: match.index
      });
    }
  }
  
  return mentions;
};

commentSchema.statics.extractPlainText = function(content) {
  let plainText = content;
  plainText = plainText.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
  plainText = plainText.replace(/\*\*([^*]+)\*\*/g, '$1');
  plainText = plainText.replace(/\*([^*]+)\*/g, '$1');
  plainText = plainText.replace(/`([^`]+)`/g, '$1');
  return plainText;
};

commentSchema.index({ noteId: 1, createdAt: -1 });
commentSchema.index({ noteId: 1, parentId: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
