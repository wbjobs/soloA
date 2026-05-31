const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    default: 'Untitled Note',
    trim: true
  },
  content: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null,
    index: true
  },
  permissions: {
    type: Map,
    of: {
      type: String,
      enum: ['owner', 'editor', 'reader']
    },
    default: new Map()
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  publicPermission: {
    type: String,
    enum: ['none', 'reader', 'editor'],
    default: 'none'
  },
  tags: [{
    type: String,
    trim: true
  }],
  isStarred: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

noteSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

noteSchema.methods.hasPermission = function(userId, requiredPermission) {
  const userIdStr = userId.toString();
  
  if (this.createdBy.toString() === userIdStr) {
    return true;
  }
  
  const userPermission = this.permissions.get(userIdStr);
  if (!userPermission) {
    if (this.isPublic && this.publicPermission === requiredPermission) {
      return true;
    }
    return false;
  }
  
  const permissionLevels = {
    'reader': 1,
    'editor': 2,
    'owner': 3
  };
  
  return permissionLevels[userPermission] >= permissionLevels[requiredPermission];
};

module.exports = mongoose.model('Note', noteSchema);
