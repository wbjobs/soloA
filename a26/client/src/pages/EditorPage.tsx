import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ScoreEditor } from '../components/ScoreEditor';
import { MidiPlayer } from '../components/MidiPlayer';
import { CollaborationCursor } from '../components/CollaborationCursor';
import { HistoryPanel } from '../components/HistoryPanel';
import { useCollaboration } from '../hooks/useCollaboration';
import { scoreApi, authApi } from '../services/api';
import { ScoreData, Operation } from '../types';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [scoreTitle, setScoreTitle] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialScore, setInitialScore] = useState<ScoreData | null>(null);
  const [user, setUser] = useState<{ id: string; email: string; username: string } | null>(null);

  useEffect(() => {
    checkAuth();
    loadScore();
  }, [id]);

  const checkAuth = async () => {
    try {
      const result = await authApi.getMe();
      setUser(result.user);
    } catch {
      navigate('/login');
    }
  };

  const loadScore = async () => {
    if (!id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await scoreApi.get(id);
      const scoreData = result.data as ScoreData;
      setScoreTitle(result.title);
      setInitialScore(scoreData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载乐谱失败');
    } finally {
      setLoading(false);
    }
  };

  const {
    score,
    collaborators,
    isConnected,
    submitOperation,
    sendCursor,
    version
  } = useCollaboration({
    scoreId: id || '',
    initialScore: initialScore || undefined
  });

  const handleOperation = (op: Omit<Operation, 'id' | 'userId' | 'timestamp' | 'version'>) => {
    submitOperation(op);
  };

  const handleTempoChange = async (tempo: number) => {
    submitOperation({
      type: 'update_tempo',
      tempo,
      oldTempo: score.tempo
    } as any);
  };

  const handleTitleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setScoreTitle(newTitle);
  };

  const handleTitleBlur = async () => {
    if (!id) return;
    try {
      await scoreApi.update(id, { title: scoreTitle });
    } catch (err) {
      console.error('更新标题失败:', err);
    }
  };

  const handleBack = () => {
    navigate('/scores');
  };

  if (loading || !initialScore) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8f9fa'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎵</div>
          <p style={{ color: '#666' }}>加载乐谱中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8f9fa'
      }}>
        <div style={{ 
          textAlign: 'center',
          background: 'white',
          padding: '40px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>❌</div>
          <h2 style={{ margin: '0 0 8px 0', color: '#333' }}>加载失败</h2>
          <p style={{ color: '#666', margin: '0 0 24px 0' }}>{error}</p>
          <button
            onClick={loadScore}
            style={{
              padding: '12px 24px',
              background: '#4285f4',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        background: 'white',
        borderBottom: '1px solid #e0e0e0',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        height: '56px'
      }}>
        <button
          onClick={handleBack}
          style={{
            padding: '8px 12px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#666',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          ← 返回
        </button>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            type="text"
            value={scoreTitle}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            placeholder="乐谱标题"
            style={{
              padding: '8px 12px',
              border: '1px solid transparent',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: 600,
              outline: 'none',
              background: 'transparent',
              color: '#333',
              minWidth: '200px'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#4285f4';
              e.target.style.background = 'white';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'transparent';
              e.target.style.background = 'transparent';
            }}
          />
          <span style={{
            fontSize: '12px',
            color: '#999',
            padding: '4px 8px',
            background: '#f5f5f5',
            borderRadius: '4px'
          }}>
            版本 v{version}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {user && (
            <span style={{ color: '#666', fontSize: '14px' }}>
              {user.username}
            </span>
          )}
          
          <button
            onClick={() => setShowHistory(true)}
            style={{
              padding: '8px 16px',
              background: '#f5f5f5',
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#666'
            }}
          >
            📜 历史记录
          </button>
        </div>
      </div>

      <CollaborationCursor
        collaborators={collaborators}
        isConnected={isConnected}
        currentUser={user ? { username: user.username, color: '#4285f4' } : undefined}
      />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <ScoreEditor
            score={score}
            onOperation={handleOperation}
            selectedNoteId={selectedNoteId}
            onSelectNote={setSelectedNoteId}
          />
        </div>

        <div style={{
          padding: '16px',
          background: '#fafafa',
          borderTop: '1px solid #e0e0e0'
        }}>
          <MidiPlayer
            score={score}
            onTempoChange={handleTempoChange}
          />
        </div>
      </div>

      <HistoryPanel
        scoreId={id || ''}
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </div>
  );
}
