const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    default: 'New Folder'
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null,
    index: true
  },
  color: {
    type: String,
    default: '#6366f1'
  },
  icon: {
    type: String,
    default: 'folder'
  },
  isStarred: {
    type: Boolean,
    default: false
  },
  sortOrder: {
    type: Number,
    default: 0
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

folderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

folderSchema.index({ createdBy: 1, parentId: 1, name: 1 }, { unique: false });

folderSchema.statics.getFolderPath = async function(folderId, userId) {
  const path = [];
  let currentId = folderId;
  
  while (currentId) {
    const folder = await this.findOne({ _id: currentId, createdBy: userId });
    if (!folder) break;
    path.unshift({
      id: folder._id,
      name: folder.name
    });
    currentId = folder.parentId;
  }
  
  return path;
};

module.exports = mongoose.model('Folder', folderSchema);
