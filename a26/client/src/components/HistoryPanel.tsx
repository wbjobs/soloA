import { useState, useEffect } from 'react';
import { HistoryEntry, Operation, NoteData } from '../types';
import { scoreApi } from '../services/api';

interface HistoryPanelProps {
  scoreId: string;
  isOpen: boolean;
  onClose: () => void;
}

const operationTypeLabels: Record<string, string> = {
  add_note: '添加音符',
  update_note: '修改音符',
  delete_note: '删除音符',
  update_tempo: '修改速度',
  update_staff: '修改谱表'
};

export function HistoryPanel({ scoreId, isOpen, onClose }: HistoryPanelProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, scoreId]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await scoreApi.getHistory(scoreId);
      setHistory(result.history as HistoryEntry[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载历史失败');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getOperationSummary = (entry: HistoryEntry): string => {
    const op = entry.operation;
    
    switch (op.type) {
      case 'add_note':
        const addNote = op as any;
        return `添加 ${addNote.note?.pitch || ''}${addNote.note?.octave || ''}`;
      case 'update_note':
        const updateNote = op as any;
        const changes: string[] = [];
        if (updateNote.changes?.pitch) changes.push(`音高→${updateNote.changes.pitch}`);
        if (updateNote.changes?.octave) changes.push(`八度→${updateNote.changes.octave}`);
        if (updateNote.changes?.duration) changes.push(`时值→${updateNote.changes.duration}`);
        if (updateNote.changes?.position !== undefined) changes.push(`位置→${updateNote.changes.position}`);
        return changes.length > 0 ? changes.join(', ') : '修改音符';
      case 'delete_note':
        const deleteNote = op as any;
        if (deleteNote.oldNote) {
          return `删除 ${deleteNote.oldNote.pitch}${deleteNote.oldNote.octave}`;
        }
        return '删除音符';
      case 'update_tempo':
        return `速度 ${(op as any).oldTempo || ''} → ${(op as any).tempo || ''} BPM`;
      case 'update_staff':
        return '修改谱表';
      default:
        return entry.type;
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="history-panel"
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: '350px',
        background: '#fff',
        boxShadow: '-2px 0 10px rgba(0,0,0,0.1)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>版本历史</h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#666',
            padding: '0 8px'
          }}
        >
          ×
        </button>
      </div>

      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #f0f0f0',
        fontSize: '12px',
        color: '#666'
      }}>
        共 {history.length} 条操作记录
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px'
      }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
            加载中...
          </div>
        )}

        {error && (
          <div style={{ 
            textAlign: 'center', 
            padding: '20px', 
            color: '#f44336' 
          }}>
            {error}
            <button
              onClick={loadHistory}
              style={{
                marginLeft: '12px',
                padding: '4px 12px',
                background: '#4285f4',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              重试
            </button>
          </div>
        )}

        {!loading && !error && history.length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px 20px', 
            color: '#999' 
          }}>
            暂无操作历史
          </div>
        )}

        {!loading && !error && history.map((entry, index) => (
          <div
            key={entry.id}
            style={{
              padding: '12px',
              marginBottom: '8px',
              background: '#fafafa',
              borderRadius: '6px',
              border: '1px solid #f0f0f0'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '4px'
            }}>
              <span style={{
                display: 'inline-block',
                padding: '2px 8px',
                background: '#e3f2fd',
                color: '#1976d2',
                borderRadius: '4px',
                fontSize: '12px'
              }}>
                {operationTypeLabels[entry.type] || entry.type}
              </span>
              <span style={{ fontSize: '11px', color: '#999' }}>
                v{entry.version}
              </span>
            </div>
            
            <div style={{ fontSize: '13px', color: '#333', marginBottom: '4px' }}>
              {getOperationSummary(entry)}
            </div>
            
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#999'
            }}>
              <span>{entry.user.username}</span>
              <span>{formatTime(entry.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
