import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { notesApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { MarkdownEditor } from '../components/MarkdownEditor';
import { MarkdownPreview } from '../components/MarkdownPreview';
import { CommentsSidebar } from '../components/CommentsSidebar';
import type { Note, NoteVersion, CursorPosition } from '../types';

type ViewMode = 'split' | 'edit' | 'preview';

function debounce<T extends (...args: any[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function(...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function NoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [note, setNote] = useState<Note | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showVersions, setShowVersions] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [publicPermission, setPublicPermission] = useState<'none' | 'reader' | 'editor'>('none');
  const [shareUserId, setShareUserId] = useState('');
  const [sharePermission, setSharePermission] = useState<'editor' | 'reader'>('reader');
  const [remoteUpdatesPending, setRemoteUpdatesPending] = useState(0);

  const lastSavedRef = useRef<{ content: string; title: string }>({ content: '', title: '' });
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const remoteUpdateQueueRef = useRef<Array<{ content?: string; title?: string; timestamp: number }>>([]);
  const localContentRef = useRef<string>('');
  const localTitleRef = useRef<string>('');

  useEffect(() => {
    localContentRef.current = content;
  }, [content]);

  useEffect(() => {
    localTitleRef.current = title;
  }, [title]);

  const handleRemoteUpdate = useCallback((data: { content?: string; title?: string; serverTime?: number }) => {
    remoteUpdateQueueRef.current.push({
      content: data.content,
      title: data.title,
      timestamp: data.serverTime || Date.now()
    });

    if (remoteUpdateQueueRef.current.length > 10) {
      remoteUpdateQueueRef.current = remoteUpdateQueueRef.current.slice(-5);
    }

    setRemoteUpdatesPending(remoteUpdateQueueRef.current.length);

    isRemoteUpdateRef.current = true;
    
    if (data.content !== undefined) {
      setContent(data.content);
      localContentRef.current = data.content;
    }
    if (data.title !== undefined) {
      setTitle(data.title);
      localTitleRef.current = data.title;
    }
    
    setTimeout(() => {
      isRemoteUpdateRef.current = false;
      if (remoteUpdateQueueRef.current.length > 0) {
        setRemoteUpdatesPending(remoteUpdateQueueRef.current.length);
      }
    }, 50);
  }, []);

  const debouncedSendUpdate = useMemo(
    () => debounce((noteId: string, data: { content?: string; title?: string; cursor?: CursorPosition }, sendFn: (d: any) => void) => {
      if (!isRemoteUpdateRef.current) {
        sendFn(data);
      }
    }, 30),
    []
  );

  const { connected, collaborators, saveStatus, sendUpdate, saveNote } = useSocket({
    noteId: id || null,
    onRemoteUpdate: handleRemoteUpdate,
  });

  useEffect(() => {
    const loadNote = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const { note: fetchedNote } = await notesApi.getById(id);
        setNote(fetchedNote);
        setContent(fetchedNote.content);
        setTitle(fetchedNote.title);
        setIsPublic(fetchedNote.isPublic);
        setPublicPermission(fetchedNote.publicPermission);
        lastSavedRef.current = { content: fetchedNote.content, title: fetchedNote.title };
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load note');
      } finally {
        setLoading(false);
      }
    };

    loadNote();
  }, [id]);

  useEffect(() => {
    if (!autoSaveEnabled || !id) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      if (
        (content !== lastSavedRef.current.content || title !== lastSavedRef.current.title) &&
        !isRemoteUpdateRef.current &&
        note?.userPermission !== 'reader'
      ) {
        if (connected) {
          saveNote({ content, title });
        } else {
          notesApi.update(id, { content, title, createVersion: true });
        }
        lastSavedRef.current = { content, title };
      }
    }, 3000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [content, title, autoSaveEnabled, id, connected, note?.userPermission, saveNote]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (connected && note?.userPermission !== 'reader' && !isRemoteUpdateRef.current) {
      sendUpdate({ title: newTitle });
    }
  };

  const handleContentChange = (newContent: string) => {
    if (isRemoteUpdateRef.current) {
      setContent(newContent);
      return;
    }
    
    setContent(newContent);
    if (connected && note?.userPermission !== 'reader') {
      sendUpdate({ content: newContent });
    }
  };

  const handleCursorChange = (cursor: CursorPosition) => {
    if (connected && note?.userPermission !== 'reader' && !isRemoteUpdateRef.current) {
      sendUpdate({ cursor });
    }
  };

  const loadVersions = async () => {
    if (!id) return;
    try {
      setVersionsLoading(true);
      const { versions: fetchedVersions } = await notesApi.getVersions(id);
      setVersions(fetchedVersions);
    } catch (err: any) {
      console.error('Failed to load versions:', err);
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    if (!id || !window.confirm('Restore this version? Current changes will be saved as a new version.')) return;
    try {
      const { note: restoredNote } = await notesApi.restoreVersion(id, versionId);
      setNote(restoredNote);
      setContent(restoredNote.content);
      setTitle(restoredNote.title);
      lastSavedRef.current = { content: restoredNote.content, title: restoredNote.title };
      setShowVersions(false);
    } catch (err: any) {
      console.error('Failed to restore version:', err);
    }
  };

  const handleUpdatePermissions = async () => {
    if (!id || !note) return;
    try {
      const { note: updatedNote } = await notesApi.updatePermissions(id, {
        isPublic,
        publicPermission,
      });
      setNote(updatedNote);
    } catch (err: any) {
      console.error('Failed to update permissions:', err);
    }
  };

  const handleShareWithUser = async () => {
    if (!id || !shareUserId.trim()) return;
    try {
      const permissions: Record<string, string | null> = {};
      permissions[shareUserId.trim()] = sharePermission;
      
      const { note: updatedNote } = await notesApi.updatePermissions(id, { permissions });
      setNote(updatedNote);
      setShareUserId('');
    } catch (err: any) {
      console.error('Failed to share note:', err);
    }
  };

  const canEdit = note?.userPermission === 'owner' || note?.userPermission === 'editor';
  const isOwner = note?.userPermission === 'owner';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Error Loading Note</h2>
          <p className="text-slate-500 mb-6">{error || 'Note not found'}</p>
          <Link
            to="/"
            className="inline-flex items-center px-4 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Notes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center space-x-4 flex-1 min-w-0">
            <Link
              to="/"
              className="text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              disabled={!canEdit}
              className="text-lg font-semibold text-slate-800 bg-transparent border-none focus:outline-none focus:ring-0 w-full min-w-0 disabled:opacity-70"
              placeholder="Untitled Note"
            />
          </div>

          <div className="flex items-center space-x-2">
            {saveStatus === 'saving' && (
              <span className="text-xs text-slate-400 flex items-center">
                <svg className="w-3 h-3 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-xs text-green-500 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Saved
              </span>
            )}

            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('edit')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  viewMode === 'edit' ? 'bg-white shadow text-slate-700' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Edit
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  viewMode === 'split' ? 'bg-white shadow text-slate-700' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Split
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  viewMode === 'preview' ? 'bg-white shadow text-slate-700' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Preview
              </button>
            </div>

            <button
              onClick={() => {
                setShowVersions(true);
                loadVersions();
              }}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Version History"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            {isOwner && (
              <button
                onClick={() => setShowShare(true)}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                title="Share"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
            )}

            <button
              onClick={() => setShowComments(!showComments)}
              className={`p-2 rounded-lg transition-colors ${
                showComments
                  ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
              title="Comments"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>

            {connected && collaborators.length > 1 && (
              <div className="flex -space-x-2 ml-2">
                {collaborators.slice(0, 4).map((c) => (
                  <div
                    key={c.id}
                    className="w-7 h-7 rounded-full bg-primary-500 border-2 border-white flex items-center justify-center text-white text-xs font-medium"
                    title={c.username}
                  >
                    {c.username.charAt(0).toUpperCase()}
                  </div>
                ))}
                {collaborators.length > 4 && (
                  <div className="w-7 h-7 rounded-full bg-slate-300 border-2 border-white flex items-center justify-center text-slate-700 text-xs font-medium">
                    +{collaborators.length - 4}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center space-x-1 ml-2">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-slate-400'}`}></span>
              <span className="text-xs text-slate-500">{connected ? 'Live' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 flex ${showComments ? '' : ''}`}>
          {viewMode !== 'preview' && (
            <div
              className={`${
                viewMode === 'split' ? 'w-1/2 border-r border-slate-200' : 'w-full'
              } flex flex-col bg-white`}
            >
              <div className="flex-1 overflow-hidden">
                <MarkdownEditor
                  value={content}
                  onChange={handleContentChange}
                  onCursorChange={handleCursorChange}
                  readOnly={!canEdit}
                />
              </div>
            </div>
          )}

          {viewMode !== 'edit' && (
            <div
              className={`${
                viewMode === 'split' ? 'w-1/2' : 'w-full'
              } flex flex-col bg-white overflow-hidden`}
            >
              <div className="flex-1 overflow-auto">
                <MarkdownPreview content={content} />
              </div>
            </div>
          )}
        </div>

        {showComments && id && (
          <CommentsSidebar
            noteId={id}
            currentUserId={user?.id || ''}
            canComment={note?.userPermission !== 'reader'}
          />
        )}
      </div>

      {showVersions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">Version History</h3>
              <button
                onClick={() => setShowVersions(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-5">
              {versionsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
                </div>
              ) : versions.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No versions yet</p>
              ) : (
                <div className="space-y-3">
                  {versions.map((version) => (
                    <div
                      key={version._id}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-slate-700">Version {version.versionNumber}</span>
                          {version.changeSummary && (
                            <span className="text-sm text-slate-500">- {version.changeSummary}</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 mt-1">
                          {new Date(version.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => handleRestoreVersion(version._id)}
                          className="px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showShare && isOwner && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">Share Note</h3>
              <button
                onClick={() => setShowShare(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-5 space-y-6">
              <div>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="w-4 h-4 text-primary-500 border-slate-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-slate-700">Public Access</span>
                </label>
                
                {isPublic && (
                  <div className="mt-3 ml-7">
                    <select
                      value={publicPermission}
                      onChange={(e) => setPublicPermission(e.target.value as any)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="reader">Can view</option>
                      <option value="editor">Can edit</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Share with User (by ID)
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={shareUserId}
                    onChange={(e) => setShareUserId(e.target.value)}
                    placeholder="Enter user ID"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <select
                    value={sharePermission}
                    onChange={(e) => setSharePermission(e.target.value as any)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="reader">View</option>
                    <option value="editor">Edit</option>
                  </select>
                  <button
                    onClick={handleShareWithUser}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {note && Object.keys(note.permissions).length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Shared with
                  </label>
                  <div className="space-y-2">
                    {Object.entries(note.permissions)
                      .filter(([uid]) => uid !== note.createdBy)
                      .map(([uid, perm]) => (
                        <div key={uid} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-slate-600 font-mono">{uid.substring(0, 8)}...</span>
                            <span className="text-xs px-2 py-0.5 bg-slate-200 rounded-full text-slate-600">
                              {perm}
                            </span>
                          </div>
                          <button
                            onClick={async () => {
                              const permissions: Record<string, string | null> = {};
                              permissions[uid] = null;
                              const { note: updated } = await notesApi.updatePermissions(note._id, { permissions });
                              setNote(updated);
                            }}
                            className="text-red-500 hover:text-red-600 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleUpdatePermissions}
                className="w-full px-4 py-2.5 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NoteEditorPage;
