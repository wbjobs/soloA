import React, { useState, useEffect, useCallback } from 'react';
import { foldersApi, notesApi } from '../services/api';
import type { Folder, Note } from '../types';

interface FolderSidebarProps {
  currentFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  onNoteCreate: (folderId: string | null) => void;
  onImportExport: () => void;
}

export function FolderSidebar({ currentFolderId, onFolderSelect, onNoteCreate, onImportExport }: FolderSidebarProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [draggedNote, setDraggedNote] = useState<Note | null>(null);

  const loadFolders = useCallback(async () => {
    try {
      setLoading(true);
      const { folders: rootFolders } = await foldersApi.getAll(null);
      setFolders(rootFolders);
    } catch (error) {
      console.error('Failed to load folders:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const toggleFolder = async (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);

    if (!newExpanded.has(folderId)) {
      try {
        const { folders: childFolders } = await foldersApi.getAll(folderId);
        setFolders(prev => {
          const updateFolders = (list: Folder[]): Folder[] => {
            return list.map(f => {
              if (f._id === folderId) {
                return { ...f, children: childFolders };
              }
              if (f.children) {
                return { ...f, children: updateFolders(f.children) };
              }
              return f;
            });
          };
          return updateFolders(prev);
        });
      } catch (error) {
        console.error('Failed to load child folders:', error);
      }
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      await foldersApi.create({
        name: newFolderName.trim(),
        parentId: newFolderParent || undefined
      });
      await loadFolders();
      setNewFolderName('');
      setNewFolderParent(null);
      setCreatingFolder(false);
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnFolder = async (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    if (!draggedNote) return;
    
    try {
      await notesApi.update(draggedNote._id, { folderId });
      setDraggedNote(null);
      loadFolders();
    } catch (error) {
      console.error('Failed to move note:', error);
    }
  };

  const renderFolderItem = (folder: Folder, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder._id);
    const isSelected = currentFolderId === folder._id;

    return (
      <div key={folder._id}>
        <div
          className={`flex items-center py-1.5 px-2 rounded-lg cursor-pointer transition-colors group ${
            isSelected
              ? 'bg-primary-50 text-primary-700'
              : 'hover:bg-slate-100'
          }`}
          style={{ marginLeft: level * 16 }}
          onClick={() => onFolderSelect(folder._id)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDropOnFolder(e, folder._id)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFolder(folder._id);
            }}
            className="w-4 h-4 mr-1 text-slate-400 hover:text-slate-600 flex-shrink-0"
          >
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          
          <svg
            className="w-5 h-5 mr-2 flex-shrink-0"
            style={{ color: folder.color }}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          
          <span className="truncate flex-1 text-sm font-medium">
            {folder.name}
          </span>
          
          <span className="text-xs text-slate-400 ml-2">
            {folder.noteCount || 0}
          </span>

          <div className="opacity-0 group-hover:opacity-100 flex items-center ml-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNoteCreate(folder._id);
              }}
              className="p-1 text-slate-400 hover:text-primary-600"
              title="New note in this folder"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>
        </div>

        {isExpanded && folder.children && (
          <div>
            {folder.children.map(child => renderFolderItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="w-64 bg-white border-r border-slate-200 p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-slate-200 rounded w-3/4"></div>
          <div className="h-4 bg-slate-200 rounded w-1/2"></div>
          <div className="h-4 bg-slate-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white border-r border-slate-200 flex flex-col">
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-700">Folders</h3>
          <div className="flex items-center space-x-1">
            <button
              onClick={onImportExport}
              className="p-1.5 text-slate-400 hover:text-primary-600 rounded hover:bg-slate-100"
              title="Import / Export"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </button>
            <button
              onClick={() => setCreatingFolder(true)}
              className="p-1.5 text-slate-400 hover:text-primary-600 rounded hover:bg-slate-100"
              title="New folder"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div
          className={`flex items-center py-1.5 px-2 rounded-lg cursor-pointer transition-colors ${
            currentFolderId === null
              ? 'bg-primary-50 text-primary-700'
              : 'hover:bg-slate-100'
          }`}
          onClick={() => onFolderSelect(null)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDropOnFolder(e, null)}
        >
          <svg className="w-5 h-5 mr-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <span className="text-sm font-medium">All Notes</span>
        </div>

        {folders.length > 0 && (
          <div className="mt-2 space-y-1">
            {folders.map(folder => renderFolderItem(folder))}
          </div>
        )}

        {folders.length === 0 && (
          <div className="mt-4 text-center text-sm text-slate-400">
            <p>No folders yet</p>
            <button
              onClick={() => setCreatingFolder(true)}
              className="text-primary-600 hover:underline mt-1"
            >
              Create your first folder
            </button>
          </div>
        )}
      </div>

      {creatingFolder && (
        <div className="p-4 border-t border-slate-200">
          <p className="text-sm font-medium text-slate-700 mb-2">New Folder</p>
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoFocus
          />
          <div className="flex space-x-2">
            <button
              onClick={createFolder}
              disabled={!newFolderName.trim()}
              className="flex-1 px-3 py-1.5 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => {
                setCreatingFolder(false);
                setNewFolderName('');
              }}
              className="flex-1 px-3 py-1.5 border border-slate-300 text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default FolderSidebar;
