import React, { useState, useRef } from 'react';
import { importExportApi, notesApi } from '../services/api';
import type { Note, ImportResult } from '../types';

interface ImportExportDialogProps {
  open: boolean;
  onClose: () => void;
  currentFolderId: string | null;
  notes: Note[];
  onImportComplete: () => void;
}

type Tab = 'import' | 'export';

export function ImportExportDialog({ open, onClose, currentFolderId, notes, onImportComplete }: ImportExportDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>('import');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [exportSelectedNotes, setExportSelectedNotes] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<'markdown' | 'html' | 'batch'>('markdown');
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    
    setImporting(true);
    setImportResult(null);
    
    try {
      const ext = importFile.name.toLowerCase().split('.').pop();
      
      if (ext === 'json') {
        const result = await importExportApi.importBatch(importFile, currentFolderId || undefined);
        setImportResult(result);
      } else {
        const result = await importExportApi.importMarkdown(importFile, currentFolderId || undefined);
        setImportResult({
          imported: result.wasNew ? 1 : 0,
          updated: result.wasNew ? 0 : 1,
          failed: 0,
          errors: []
        });
      }
      
      onImportComplete();
    } catch (error) {
      console.error('Import failed:', error);
      setImportResult({
        imported: 0,
        updated: 0,
        failed: 1,
        errors: [{ title: importFile.name, error: 'Import failed' }]
      });
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    if (exportFormat !== 'batch' && exportSelectedNotes.size !== 1) {
      alert('Please select exactly one note for Markdown/HTML export');
      return;
    }
    
    setExporting(true);
    
    try {
      if (exportFormat === 'batch') {
        const noteIds = exportSelectedNotes.size > 0 
          ? Array.from(exportSelectedNotes)
          : undefined;
          
        await importExportApi.exportBatch({
          noteIds,
          folderId: currentFolderId || undefined,
          includeSubfolders: true
        });
      } else {
        const noteId = Array.from(exportSelectedNotes)[0];
        if (exportFormat === 'markdown') {
          await importExportApi.exportMarkdown(noteId);
        } else {
          await importExportApi.exportHtml(noteId);
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const toggleNoteSelection = (noteId: string) => {
    const newSelection = new Set(exportSelectedNotes);
    if (newSelection.has(noteId)) {
      newSelection.delete(noteId);
    } else {
      newSelection.add(noteId);
    }
    setExportSelectedNotes(newSelection);
  };

  const toggleAllNotes = () => {
    if (exportSelectedNotes.size === notes.length) {
      setExportSelectedNotes(new Set());
    } else {
      setExportSelectedNotes(new Set(notes.map(n => n._id)));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Import & Export</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('import')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'import'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Import
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'export'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Export
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'import' ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-primary-400 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.markdown,.txt,.html,.json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="text-sm text-slate-600 mb-2">
                  Drag and drop files here, or
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-primary-600 font-medium hover:underline"
                >
                  browse to upload
                </button>
                <p className="text-xs text-slate-400 mt-2">
                  Supported: .md, .markdown, .txt, .html, .json (batch)
                </p>
              </div>

              {importFile && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{importFile.name}</p>
                      <p className="text-xs text-slate-400">
                        {(importFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => setImportFile(null)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {importResult && (
                <div className={`rounded-lg p-4 ${
                  importResult.failed > 0
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-green-50 border border-green-200'
                }`}>
                  <div className="space-y-1">
                    {importResult.imported > 0 && (
                      <p className="text-sm text-green-700">
                        ✓ {importResult.imported} note(s) imported
                      </p>
                    )}
                    {importResult.updated > 0 && (
                      <p className="text-sm text-blue-700">
                        ↻ {importResult.updated} note(s) updated
                      </p>
                    )}
                    {importResult.failed > 0 && (
                      <p className="text-sm text-amber-700">
                        ✗ {importResult.failed} failed
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  Export Format
                </label>
                <div className="flex space-x-2">
                  {[
                    { value: 'markdown', label: 'Markdown (.md)', single: true },
                    { value: 'html', label: 'HTML (.html)', single: true },
                    { value: 'batch', label: 'Batch JSON', single: false }
                  ].map(format => (
                    <button
                      key={format.value}
                      onClick={() => setExportFormat(format.value as any)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        exportFormat === format.value
                          ? 'bg-primary-500 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {format.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Select Notes
                  </label>
                  <button
                    onClick={toggleAllNotes}
                    className="text-xs text-primary-600 hover:underline"
                  >
                    {exportSelectedNotes.size === notes.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
                  {notes.length === 0 ? (
                    <p className="p-4 text-sm text-slate-400 text-center">
                      No notes in this folder
                    </p>
                  ) : (
                    notes.map(note => (
                      <label
                        key={note._id}
                        className="flex items-center px-4 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={exportSelectedNotes.has(note._id)}
                          onChange={() => toggleNoteSelection(note._id)}
                          className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                        />
                        <span className="ml-3 text-sm text-slate-700 truncate">
                          {note.title}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {exportSelectedNotes.size} of {notes.length} selected
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 p-5 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
          {activeTab === 'import' ? (
            <button
              onClick={handleImport}
              disabled={!importFile || importing}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
          ) : (
            <button
              onClick={handleExport}
              disabled={
                exporting ||
                (exportFormat !== 'batch' && exportSelectedNotes.size !== 1)
              }
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
            >
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImportExportDialog;
