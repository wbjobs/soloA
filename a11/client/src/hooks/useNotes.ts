import { useState, useEffect, useCallback } from 'react';
import { notesApi } from '../services/api';
import type { Note } from '../types';

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    try {
      setLoading(true);
      const { notes: fetchedNotes } = await notesApi.getAll();
      setNotes(fetchedNotes);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const createNote = useCallback(async (data?: { title?: string; content?: string; folderId?: string }) => {
    try {
      const { note } = await notesApi.create(data || {});
      setNotes((prev) => [note, ...prev]);
      return note;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create note');
      throw err;
    }
  }, []);

  const deleteNote = useCallback(async (id: string) => {
    try {
      await notesApi.delete(id);
      setNotes((prev) => prev.filter((n) => n._id !== id));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete note');
      throw err;
    }
  }, []);

  const updateNote = useCallback(
    async (id: string, data: { title?: string; content?: string }) => {
      try {
        const { note } = await notesApi.update(id, data);
        setNotes((prev) =>
          prev.map((n) => (n._id === id ? note : n))
        );
        return note;
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to update note');
        throw err;
      }
    },
    []
  );

  return {
    notes,
    loading,
    error,
    fetchNotes,
    refresh: fetchNotes,
    createNote,
    deleteNote,
    updateNote,
  };
}
