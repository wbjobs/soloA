const express = require('express');
const Folder = require('../models/Folder');
const Note = require('../models/Note');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { parentId } = req.query;
    
    let query = { createdBy: userId };
    if (parentId === 'root' || parentId === 'null' || !parentId) {
      query.parentId = null;
    } else {
      query.parentId = parentId;
    }
    
    const folders = await Folder.find(query)
      .sort({ sortOrder: 1, createdAt: -1 });
    
    const folderIds = folders.map(f => f._id);
    
    const noteCounts = await Note.aggregate([
      { $match: { createdBy: userId, folderId: { $in: folderIds } } },
      { $group: { _id: '$folderId', count: { $sum: 1 } } }
    ]);
    
    const noteCountMap = noteCounts.reduce((acc, nc) => {
      acc[nc._id.toString()] = nc.count;
      return acc;
    }, {});
    
    const foldersWithCount = folders.map(f => ({
      ...f.toObject(),
      noteCount: noteCountMap[f._id.toString()] || 0
    }));
    
    res.json({ folders: foldersWithCount });
  } catch (error) {
    console.error('Get folders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tree', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const folders = await Folder.find({ createdBy: userId })
      .sort({ sortOrder: 1, createdAt: -1 });
    
    const buildTree = (parentId = null) => {
      const children = folders.filter(f => {
        if (parentId === null) {
          return f.parentId === null;
        }
        return f.parentId && f.parentId.toString() === parentId.toString();
      });
      
      return children.map(f => ({
        ...f.toObject(),
        children: buildTree(f._id)
      }));
    };
    
    const tree = buildTree(null);
    res.json({ tree });
  } catch (error) {
    console.error('Get folder tree error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const folder = await Folder.findOne({ _id: id, createdBy: userId });
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    const path = await Folder.getFolderPath(id, userId);
    
    res.json({ folder, path });
  } catch (error) {
    console.error('Get folder error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, parentId, color, icon } = req.body;
    const userId = req.user._id;
    
    if (parentId) {
      const parentFolder = await Folder.findOne({ _id: parentId, createdBy: userId });
      if (!parentFolder) {
        return res.status(404).json({ error: 'Parent folder not found' });
      }
    }
    
    const maxSortFolder = await Folder.findOne({ 
      createdBy: userId, 
      parentId: parentId || null 
    }).sort({ sortOrder: -1 });
    
    const folder = new Folder({
      name: name || 'New Folder',
      description: description || '',
      createdBy: userId,
      parentId: parentId || null,
      color: color || '#6366f1',
      icon: icon || 'folder',
      sortOrder: maxSortFolder ? maxSortFolder.sortOrder + 1 : 0
    });
    
    await folder.save();
    
    res.status(201).json({ folder });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, parentId, color, icon, isStarred, sortOrder } = req.body;
    const userId = req.user._id;
    
    const folder = await Folder.findOne({ _id: id, createdBy: userId });
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    if (parentId !== undefined) {
      if (parentId === null || parentId === 'null') {
        folder.parentId = null;
      } else {
        const parentFolder = await Folder.findOne({ _id: parentId, createdBy: userId });
        if (!parentFolder) {
          return res.status(404).json({ error: 'Parent folder not found' });
        }
        
        if (parentId === id) {
          return res.status(400).json({ error: 'Cannot move folder into itself' });
        }
        
        folder.parentId = parentId;
      }
    }
    
    if (name !== undefined) folder.name = name;
    if (description !== undefined) folder.description = description;
    if (color !== undefined) folder.color = color;
    if (icon !== undefined) folder.icon = icon;
    if (isStarred !== undefined) folder.isStarred = isStarred;
    if (sortOrder !== undefined) folder.sortOrder = sortOrder;
    
    await folder.save();
    
    res.json({ folder });
  } catch (error) {
    console.error('Update folder error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { deleteNotes = false } = req.query;
    
    const folder = await Folder.findOne({ _id: id, createdBy: userId });
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    const getAllChildFolderIds = async (parentId, collected = []) => {
      const children = await Folder.find({ createdBy: userId, parentId });
      for (const child of children) {
        collected.push(child._id);
        await getAllChildFolderIds(child._id, collected);
      }
      return collected;
    };
    
    const allFolderIds = [id, ...await getAllChildFolderIds(id)];
    
    if (deleteNotes === 'true') {
      await Note.deleteMany({ createdBy: userId, folderId: { $in: allFolderIds } });
    } else {
      await Note.updateMany(
        { createdBy: userId, folderId: { $in: allFolderIds } },
        { $set: { folderId: null } }
      );
    }
    
    await Folder.deleteMany({ _id: { $in: allFolderIds }, createdBy: userId });
    
    res.json({ 
      message: 'Folder deleted successfully',
      deletedFolders: allFolderIds.length
    });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/move', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { targetFolderId } = req.body;
    const userId = req.user._id;
    
    const folder = await Folder.findOne({ _id: id, createdBy: userId });
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    if (targetFolderId === id) {
      return res.status(400).json({ error: 'Cannot move folder into itself' });
    }
    
    if (targetFolderId !== null && targetFolderId !== 'null') {
      const targetFolder = await Folder.findOne({ _id: targetFolderId, createdBy: userId });
      if (!targetFolder) {
        return res.status(404).json({ error: 'Target folder not found' });
      }
      
      const checkCycle = async (folderId, targetId) => {
        if (folderId.toString() === targetId.toString()) {
          return true;
        }
        const children = await Folder.find({ createdBy: userId, parentId: folderId });
        for (const child of children) {
          if (await checkCycle(child._id, targetId)) {
            return true;
          }
        }
        return false;
      };
      
      if (await checkCycle(id, targetFolderId)) {
        return res.status(400).json({ error: 'Cannot move folder into a descendant' });
      }
      
      folder.parentId = targetFolderId;
    } else {
      folder.parentId = null;
    }
    
    await folder.save();
    
    res.json({ folder });
  } catch (error) {
    console.error('Move folder error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
