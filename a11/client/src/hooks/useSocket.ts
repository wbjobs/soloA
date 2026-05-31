import { useState, useEffect, useCallback } from 'react';
import { socketService } from '../services/socket';
import type { CursorPosition, Collaborator } from '../types';

interface UseSocketOptions {
  noteId: string | null;
  onRemoteUpdate?: (data: { content?: string; title?: string }) => void;
  onRemoteCursor?: (data: { userId: string; username: string; cursor: CursorPosition }) => void;
  onUsersUpdate?: (users: Collaborator[]) => void;
  onNoteSaved?: (data: any) => void;
}

export function useSocket({ noteId, onRemoteUpdate, onRemoteCursor, onUsersUpdate, onNoteSaved }: UseSocketOptions) {
  const [connected, setConnected] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    const cleanupHandlers: (() => void)[] = [];

    const connectedHandler = () => setConnected(true);
    const disconnectedHandler = () => {
      setConnected(false);
      setCollaborators([]);
    };

    cleanupHandlers.push(socketService.on('connected', connectedHandler));
    cleanupHandlers.push(socketService.on('disconnected', disconnectedHandler));

    if (onRemoteUpdate) {
      const docHandler = (data: { userId: string; username: string; content: string; cursor?: CursorPosition }) => {
        onRemoteUpdate({ content: data.content });
        if (data.cursor && onRemoteCursor) {
          onRemoteCursor({ userId: data.userId, username: data.username, cursor: data.cursor });
        }
      };
      cleanupHandlers.push(socketService.on('doc-update', docHandler));

      const titleHandler = (data: { userId: string; username: string; title: string }) => {
        onRemoteUpdate({ title: data.title });
      };
      cleanupHandlers.push(socketService.on('title-update', titleHandler));
    }

    if (onRemoteCursor) {
      const cursorHandler = (data: { userId: string; username: string; cursor: CursorPosition }) => {
        onRemoteCursor(data);
      };
      cleanupHandlers.push(socketService.on('cursor-update', cursorHandler));
    }

    const usersHandler = (data: { users: Collaborator[] }) => {
      setCollaborators(data.users);
      onUsersUpdate?.(data.users);
    };
    cleanupHandlers.push(socketService.on('users-updated', usersHandler));

    const noteJoinedHandler = (data: { users: Collaborator[] }) => {
      if (data.users) {
        setCollaborators(data.users);
        onUsersUpdate?.(data.users);
      }
    };
    cleanupHandlers.push(socketService.on('note-joined', noteJoinedHandler));

    const saveSuccessHandler = () => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    };
    cleanupHandlers.push(socketService.on('save-success', saveSuccessHandler));

    const saveErrorHandler = () => {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    };
    cleanupHandlers.push(socketService.on('save-error', saveErrorHandler));

    if (onNoteSaved) {
      cleanupHandlers.push(socketService.on('note-saved', onNoteSaved));
    }

    return () => {
      cleanupHandlers.forEach((cleanup) => cleanup());
    };
  }, [onRemoteUpdate, onRemoteCursor, onUsersUpdate, onNoteSaved]);

  useEffect(() => {
    if (noteId && socketService.isConnected()) {
      socketService.joinNote(noteId);
    }

    return () => {
      if (noteId) {
        socketService.leaveNote(noteId);
      }
    };
  }, [noteId]);

  const sendUpdate = useCallback(
    (data: { content?: string; title?: string; cursor?: CursorPosition }) => {
      if (noteId && socketService.isConnected()) {
        socketService.sendDocUpdate(noteId, data);
      }
    },
    [noteId]
  );

  const sendCursor = useCallback(
    (cursor: CursorPosition) => {
      if (noteId && socketService.isConnected()) {
        socketService.sendCursorUpdate(noteId, cursor);
      }
    },
    [noteId]
  );

  const saveNote = useCallback(
    (data: { content: string; title: string }) => {
      if (noteId && socketService.isConnected()) {
        setSaveStatus('saving');
        socketService.saveNote(noteId, data);
      }
    },
    [noteId]
  );

  return {
    connected,
    collaborators,
    saveStatus,
    sendUpdate,
    sendCursor,
    saveNote,
  };
}
