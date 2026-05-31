import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotes } from '../hooks/useNotes';
import { FolderSidebar } from '../components/FolderSidebar';
import { ImportExportDialog } from '../components/ImportExportDialog';
import type { Note } from '../types';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
}

function getPermissionBadge(permission: string) {
  const styles: Record<string, string> = {
    owner: 'bg-green-100 text-green-700',
    editor: 'bg-blue-100 text-blue-700',
    reader: 'bg-slate-100 text-slate-700',
  };
  const labels: Record<string, string> = {
    owner: 'Owner',
    editor: 'Editor',
    reader: 'Viewer',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[permission] || styles.reader}`}>
      {labels[permission] || 'Viewer'}
    </span>
  );
}

interface NoteCardProps {
  note: Note;
  onClick: () => void;
  onDelete: (id: string) => void;
  onDragStart: (note: Note) => void;
}

function NoteCard({ note, onClick, onDelete, onDragStart }: NoteCardProps) {
  return (
    <div
      className="group bg-white rounded-xl border border-slate-200 hover:border-primary-300 hover:shadow-lg transition-all cursor-pointer overflow-hidden"
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(note);
      }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-semibold text-slate-800 group-hover:text-primary-600 transition-colors line-clamp-1">
            {note.title || 'Untitled Note'}
          </h4>
          {getPermissionBadge(note.userPermission)}
        </div>
        <p className="text-sm text-slate-500 line-clamp-3 mb-4">
          {note.content || 'No content'}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {formatDate(note.updatedAt)}
          </span>
          {note.userPermission === 'owner' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(note._id);
              }}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const { notes, loading, error, createNote, deleteNote, refresh } = useNotes();
  const navigate = useNavigate();
  
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showImportExport, setShowImportExport] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draggedNote, setDraggedNote] = useState<Note | null>(null);

  const filteredNotes = useMemo(() => {
    if (currentFolderId === null) {
      return notes;
    }
    return notes.filter(n => n.folderId === currentFolderId);
  }, [notes, currentFolderId]);

  const myNotes = filteredNotes.filter((n) => n.userPermission === 'owner');
  const sharedNotes = filteredNotes.filter((n) => n.userPermission !== 'owner');

  const handleCreateNote = async (folderId: string | null = null) => {
    try {
      setCreating(true);
      const note = await createNote({
        title: 'Untitled Note',
        content: '# Welcome to Markdown Notes\n\nStart writing your note here...\n',
        folderId: folderId || undefined
      });
      navigate(`/notes/${note._id}`);
    } catch {
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteNote(id);
      setShowDeleteConfirm(null);
    } catch {
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <FolderSidebar
        currentFolderId={currentFolderId}
        onFolderSelect={setCurrentFolderId}
        onNoteCreate={handleCreateNote}
        onImportExport={() => setShowImportExport(true)}
      />

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h1 className="text-xl font-bold text-slate-800">Markdown Notes</h1>
              </div>

              <div className="flex items-center space-x-4">
                <button
                  onClick={() => handleCreateNote(currentFolderId)}
                  disabled={creating}
                  className="inline-flex items-center px-3 py-1.5 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-all disabled:opacity-50"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  New Note
                </button>
                
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-700">{user?.username}</p>
                  <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
                </div>
                <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-primary-700 font-semibold text-sm">
                    {user?.username.charAt(0).toUpperCase()}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="text-slate-500 hover:text-slate-700 transition-colors"
                  title="Logout"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">
                {currentFolderId === null ? 'All Notes' : 'Notes in Folder'}
              </h2>
              <p className="text-slate-500 mt-1">
                {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
              {error}
            </div>
          ) : (
            <>
              {myNotes.length > 0 && (
                <div className="mb-10">
                  <h3 className="text-lg font-semibold text-slate-700 mb-4">My Notes</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myNotes.map((note) => (
                      <NoteCard
                        key={note._id}
                        note={note}
                        onClick={() => navigate(`/notes/${note._id}`)}
                        onDelete={setShowDeleteConfirm}
                        onDragStart={setDraggedNote}
                      />
                    ))}
                  </div>
                </div>
              )}

              {sharedNotes.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-slate-700 mb-4">Shared with Me</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sharedNotes.map((note) => (
                      <NoteCard
                        key={note._id}
                        note={note}
                        onClick={() => navigate(`/notes/${note._id}`)}
                        onDelete={setShowDeleteConfirm}
                        onDragStart={setDraggedNote}
                      />
                    ))}
                  </div>
                </div>
              )}

              {filteredNotes.length === 0 && (
                <div className="text-center py-16">
                  <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-slate-700 mb-2">No notes yet</h3>
                  <p className="text-slate-500 mb-6">Create your first note to get started</p>
                  <button
                    onClick={() => handleCreateNote(currentFolderId)}
                    disabled={creating}
                    className="inline-flex items-center px-4 py-2.5 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-all disabled:opacity-50"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Create Note
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Delete Note?</h3>
            <p className="text-slate-500 mb-6">
              This action cannot be undone. All versions of this note will be permanently deleted.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteNote(showDeleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportExport && (
        <ImportExportDialog
          open={showImportExport}
          onClose={() => setShowImportExport(false)}
          currentFolderId={currentFolderId}
          notes={filteredNotes}
          onImportComplete={refresh}
        />
      )}
    </div>
  );
}

export default DashboardPage;
