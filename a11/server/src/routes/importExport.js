const express = require('express');
const multer = require('multer');
const { marked } = require('marked');
const Note = require('../models/Note');
const NoteVersion = require('../models/NoteVersion');
const Folder = require('../models/Folder');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ 
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.md', '.markdown', '.txt', '.html', '.zip'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .md, .markdown, .txt, .html, .zip files are allowed'));
    }
  }
});

router.get('/export/markdown/:noteId', authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user._id;
    const userIdStr = userId.toString();
    
    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    const permission = getEffectivePermission(note, userIdStr);
    if (permission === 'none') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const frontmatter = generateFrontmatter(note);
    const content = frontmatter + '\n' + note.content;
    const filename = sanitizeFilename(note.title) + '.md';
    
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(content);
  } catch (error) {
    console.error('Export markdown error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/export/html/:noteId', authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user._id;
    const userIdStr = userId.toString();
    
    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    const permission = getEffectivePermission(note, userIdStr);
    if (permission === 'none') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const htmlContent = marked.parse(note.content);
    const fullHtml = generateHtmlDocument(note.title, htmlContent);
    const filename = sanitizeFilename(note.title) + '.html';
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(fullHtml);
  } catch (error) {
    console.error('Export html error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/export/batch/markdown', authenticateToken, async (req, res) => {
  try {
    const { noteIds, folderId, includeSubfolders = false } = req.body;
    const userId = req.user._id;
    const userIdStr = userId.toString();
    
    let notesToExport = [];
    
    if (noteIds && noteIds.length > 0) {
      notesToExport = await Note.find({
        _id: { $in: noteIds },
        createdBy: userId
      });
    } else if (folderId) {
      let folderIds = [folderId];
      
      if (includeSubfolders) {
        const getAllChildFolderIds = async (parentId, collected = []) => {
          const children = await Folder.find({ createdBy: userId, parentId });
          for (const child of children) {
            collected.push(child._id.toString());
            await getAllChildFolderIds(child._id, collected);
          }
          return collected;
        };
        folderIds = [...folderIds, ...await getAllChildFolderIds(folderId)];
      }
      
      notesToExport = await Note.find({
        createdBy: userId,
        folderId: { $in: folderIds.map(id => id === 'root' || id === 'null' ? null : id) }
      });
    } else {
      notesToExport = await Note.find({ createdBy: userId });
    }
    
    if (notesToExport.length === 0) {
      return res.status(404).json({ error: 'No notes to export' });
    }
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      notes: notesToExport.map(note => ({
        title: note.title,
        content: note.content,
        folderId: note.folderId,
        tags: note.tags,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        frontmatter: generateFrontmatter(note)
      }))
    };
    
    const filename = `notes-export-${Date.now()}.json`;
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error('Batch export error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/import/markdown', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { folderId, createVersion = true } = req.body;
    const userId = req.user._id;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const ext = req.file.originalname.toLowerCase().substring(req.file.originalname.lastIndexOf('.'));
    let content = req.file.buffer.toString('utf-8');
    let title = req.file.originalname.replace(/\.[^/.]+$/, '');
    
    let markdownContent = content;
    
    if (ext === '.html' || ext === '.htm') {
      markdownContent = extractTextFromHtml(content);
    }
    
    const { frontmatter, body } = parseFrontmatter(markdownContent);
    if (frontmatter.title) {
      title = frontmatter.title;
    }
    
    const existingNote = await Note.findOne({ 
      createdBy: userId, 
      folderId: folderId || null,
      title 
    });
    
    let note;
    
    if (existingNote) {
      existingNote.content = body;
      existingNote.lastModifiedBy = userId;
      if (frontmatter.tags) {
        existingNote.tags = [...new Set([...existingNote.tags, ...frontmatter.tags])];
      }
      note = await existingNote.save();
      
      if (createVersion) {
        await createVersion(existingNote, userId, 'Imported update');
      }
    } else {
      note = new Note({
        title,
        content: body,
        createdBy: userId,
        lastModifiedBy: userId,
        folderId: folderId || null,
        tags: frontmatter.tags || [],
        permissions: new Map([[userId.toString(), 'owner']])
      });
      await note.save();
      
      if (createVersion) {
        await createVersion(note, userId, 'Initial import');
      }
    }
    
    res.status(201).json({ 
      note,
      imported: true,
      wasNew: !existingNote
    });
  } catch (error) {
    console.error('Import markdown error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.post('/import/batch', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { folderId, createVersion = true } = req.body;
    const userId = req.user._id;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    let importData;
    try {
      importData = JSON.parse(req.file.buffer.toString('utf-8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON file' });
    }
    
    if (!importData.notes || !Array.isArray(importData.notes)) {
      return res.status(400).json({ error: 'Invalid import format' });
    }
    
    const results = {
      imported: 0,
      updated: 0,
      failed: 0,
      errors: []
    };
    
    for (const noteData of importData.notes) {
      try {
        const { frontmatter, body } = parseFrontmatter(noteData.content || noteData.frontmatter + '\n' + (noteData.content || ''));
        const title = noteData.title || frontmatter.title || 'Untitled Note';
        
        const existingNote = await Note.findOne({ 
          createdBy: userId, 
          title 
        });
        
        if (existingNote) {
          existingNote.content = body;
          existingNote.lastModifiedBy = userId;
          if (noteData.tags || frontmatter.tags) {
            existingNote.tags = [...new Set([
              ...existingNote.tags,
              ...(noteData.tags || []),
              ...(frontmatter.tags || [])
            ])];
          }
          await existingNote.save();
          
          if (createVersion) {
            await createVersion(existingNote, userId, 'Batch import update');
          }
          
          results.updated++;
        } else {
          const note = new Note({
            title,
            content: body,
            createdBy: userId,
            lastModifiedBy: userId,
            folderId: noteData.folderId || folderId || null,
            tags: [...new Set([...(noteData.tags || []), ...(frontmatter.tags || [])])],
            permissions: new Map([[userId.toString(), 'owner']])
          });
          await note.save();
          
          if (createVersion) {
            await createVersion(note, userId, 'Batch import');
          }
          
          results.imported++;
        }
      } catch (noteError) {
        results.failed++;
        results.errors.push({
          title: noteData.title,
          error: noteError.message
        });
      }
    }
    
    res.json(results);
  } catch (error) {
    console.error('Batch import error:', error);
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

function sanitizeFilename(filename) {
  return filename
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100) || 'untitled';
}

function generateFrontmatter(note) {
  const lines = ['---'];
  lines.push(`title: "${note.title.replace(/"/g, '\\"')}"`);
  lines.push(`created: ${note.createdAt.toISOString()}`);
  lines.push(`updated: ${note.updatedAt.toISOString()}`);
  if (note.tags && note.tags.length > 0) {
    lines.push(`tags: [${note.tags.map(t => `"${t}"`).join(', ')}]`);
  }
  lines.push('---');
  return lines.join('\n');
}

function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  
  const frontmatterText = match[1];
  const body = content.substring(match[0].length);
  
  const frontmatter = {};
  const lines = frontmatterText.split('\n');
  
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();
      
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.startsWith('[') && value.endsWith(']')) {
        try {
          value = JSON.parse(value.replace(/'/g, '"'));
        } catch {
          value = value.substring(1, value.length - 1).split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        }
      }
      
      frontmatter[key] = value;
    }
  }
  
  return { frontmatter, body };
}

function generateHtmlDocument(title, content) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      line-height: 1.6;
      color: #1f2937;
    }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
    h1 { font-size: 2em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
    pre { background: #1f2937; color: #f9fafb; padding: 16px; border-radius: 8px; overflow-x: auto; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
    pre code { background: transparent; padding: 0; }
    blockquote { border-left: 4px solid #6366f1; margin: 0; padding: 0.5em 1em; background: #f5f3ff; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    th { background: #f9fafb; }
    a { color: #6366f1; }
    img { max-width: 100%; }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function extractTextFromHtml(html) {
  let markdown = html;
  
  markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
  markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
  markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');
  
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
  
  markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)');
  
  markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
  
  markdown = markdown.replace(/<[^>]+>/g, '');
  markdown = markdown.replace(/&nbsp;/g, ' ');
  markdown = markdown.replace(/&amp;/g, '&');
  markdown = markdown.replace(/&lt;/g, '<');
  markdown = markdown.replace(/&gt;/g, '>');
  markdown = markdown.replace(/&quot;/g, '"');
  
  return markdown.trim();
}

async function createVersion(note, userId, changeSummary = '') {
  const latestVersion = await NoteVersion.findOne({ noteId: note._id })
    .sort({ versionNumber: -1 });
  
  const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;
  
  const version = new NoteVersion({
    noteId: note._id,
    title: note.title,
    content: note.content,
    createdBy: userId,
    versionNumber,
    changeSummary
  });
  
  await version.save();
  return version;
}

module.exports = router;
