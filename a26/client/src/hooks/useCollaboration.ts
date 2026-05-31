import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ScoreData, Operation, Collaborator, WSMessage } from '../types';
import { applyOperation, createEmptyScore } from '../utils/scoreSerialization';
import { otService } from '../utils/ot';
import { getToken } from '../services/api';

interface UseCollaborationOptions {
  scoreId: string;
  initialScore?: ScoreData;
  onScoreChange?: (score: ScoreData) => void;
}

interface CollaborationState {
  score: ScoreData;
  version: number;
  collaborators: Collaborator[];
  isConnected: boolean;
  pendingOperations: Operation[];
  error: string | null;
}

const WS_URL = window.location.protocol === 'https:' 
  ? `wss://${window.location.host}/ws` 
  : `ws://${window.location.host}/ws`;

export function useCollaboration(options: UseCollaborationOptions) {
  const { scoreId, initialScore, onScoreChange } = options;
  
  const [state, setState] = useState<CollaborationState>({
    score: initialScore || createEmptyScore(),
    version: 0,
    collaborators: [],
    isConnected: false,
    pendingOperations: [],
    error: null
  });

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const pendingOpsRef = useRef<Operation[]>([]);
  const versionRef = useRef<number>(0);
  const scoreRef = useRef<ScoreData>(initialScore || createEmptyScore());

  const connect = useCallback(() => {
    const token = getToken();
    if (!token) {
      setState(prev => ({ ...prev, error: '未登录' }));
      return;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(prev => ({ ...prev, isConnected: true, error: null }));
      
      ws.send(JSON.stringify({
        type: 'join',
        data: { scoreId, token }
      }));

      heartbeatRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'heartbeat',
            data: { clientTime: Date.now() }
          }));
        }
      }, 15000);
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, isConnected: false }));
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      
      setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setState(prev => ({ ...prev, error: '连接错误' }));
    };
  }, [scoreId]);

  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case 'sync':
        const syncData = message.data as { score: ScoreData; users: Collaborator[]; version: number };
        scoreRef.current = syncData.score;
        versionRef.current = syncData.version;
        setState(prev => ({
          ...prev,
          score: syncData.score,
          version: syncData.version,
          collaborators: syncData.users
        }));
        onScoreChange?.(syncData.score);
        break;

      case 'operation':
        const remoteOp = message.data as Operation;
        if (remoteOp.version <= versionRef.current) {
          return;
        }

        let localOps = pendingOpsRef.current;
        let transformed = remoteOp;
        
        for (const localOp of localOps) {
          if (localOp.version <= remoteOp.version) {
            transformed = otService.transform(transformed, localOp);
          }
        }

        scoreRef.current = applyOperation(scoreRef.current, transformed);
        versionRef.current = transformed.version;
        
        const newLocalOps: Operation[] = [];
        for (const localOp of localOps) {
          if (localOp.version < transformed.version) {
            const newOp = otService.transform(localOp, transformed);
            newOp.version = transformed.version + 1;
            newLocalOps.push(newOp);
          } else {
            newLocalOps.push(localOp);
          }
        }
        pendingOpsRef.current = newLocalOps;

        setState(prev => ({
          ...prev,
          score: scoreRef.current,
          version: versionRef.current,
          pendingOperations: newLocalOps
        }));
        onScoreChange?.(scoreRef.current);
        break;

      case 'ack':
        const ackData = message.data as { operationId: string; version: number; transformed: Operation };
        
        pendingOpsRef.current = pendingOpsRef.current.filter(
          op => op.id !== ackData.operationId
        );

        setState(prev => ({
          ...prev,
          pendingOperations: pendingOpsRef.current
        }));
        break;

      case 'cursor':
        const cursorData = message.data as Collaborator;
        setState(prev => {
          const existingIdx = prev.collaborators.findIndex(
            c => c.userId === cursorData.userId
          );
          const newCollaborators = [...prev.collaborators];
          if (existingIdx >= 0) {
            newCollaborators[existingIdx] = {
              ...newCollaborators[existingIdx],
              position: cursorData.position
            };
          } else {
            newCollaborators.push(cursorData);
          }
          return { ...prev, collaborators: newCollaborators };
        });
        break;

      case 'user_joined':
        const userJoined = message.data as { userId: string; username: string; color: string };
        setState(prev => {
          if (prev.collaborators.some(c => c.userId === userJoined.userId)) {
            return prev;
          }
          return {
            ...prev,
            collaborators: [...prev.collaborators, { ...userJoined, position: 0 }]
          };
        });
        break;

      case 'user_left':
        const userLeft = message.data as { userId: string };
        setState(prev => ({
          ...prev,
          collaborators: prev.collaborators.filter(
            c => c.userId !== userLeft.userId
          )
        }));
        break;

      case 'error':
        const errorData = message.data as { message: string };
        setState(prev => ({ ...prev, error: errorData.message }));
        break;
    }
  }, [onScoreChange]);

  const submitOperation = useCallback((operation: Omit<Operation, 'id' | 'userId' | 'timestamp' | 'version'>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setState(prev => ({ ...prev, error: '未连接到服务器' }));
      return;
    }

    const fullOp: Operation = {
      ...operation,
      id: uuidv4(),
      userId: '',
      timestamp: Date.now(),
      version: versionRef.current
    } as Operation;

    scoreRef.current = applyOperation(scoreRef.current, fullOp);
    pendingOpsRef.current = [...pendingOpsRef.current, fullOp];

    setState(prev => ({
      ...prev,
      score: scoreRef.current,
      pendingOperations: pendingOpsRef.current
    }));
    onScoreChange?.(scoreRef.current);

    ws.send(JSON.stringify({
      type: 'operation',
      data: fullOp
    }));
  }, [onScoreChange]);

  const sendCursor = useCallback((position: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: 'cursor',
      data: { position }
    }));
  }, []);

  const disconnect = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState(prev => ({ ...prev, isConnected: false }));
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    ...state,
    submitOperation,
    sendCursor,
    reconnect: connect
  };
}
