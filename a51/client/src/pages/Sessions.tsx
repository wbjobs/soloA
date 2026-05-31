import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SessionInfo } from '../types';
import { formatTime } from '../services/playback';

export const Sessions: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    try {
      const res = await fetch('/api/logs');
      if (!res.ok) {
        throw new Error('Failed to fetch sessions');
      }
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }

  const handlePlayback = (roomId: string) => {
    navigate(`/playback/${roomId}`);
  };

  const handleExport = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `/api/log/${roomId}/export`;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' hours ago';

    return date.toLocaleDateString();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0f0f1a',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
        padding: '40px',
      }}
    >
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '32px',
          }}
        >
          <h1
            style={{
              color: '#eaeaea',
              margin: 0,
              fontSize: '28px',
            }}
          >
            Session Recordings
          </h1>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '10px 20px',
              backgroundColor: 'transparent',
              border: '1px solid #4a90d9',
              color: '#4a90d9',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Create New Session
          </button>
        </div>

        {loading ? (
          <div
            style={{
              color: '#888',
              textAlign: 'center',
              padding: '60px',
            }}
          >
            Loading sessions...
          </div>
        ) : error ? (
          <div
            style={{
              padding: '40px',
              backgroundColor: '#16213e',
              borderRadius: '12px',
              color: '#ff5555',
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        ) : sessions.length === 0 ? (
          <div
            style={{
              padding: '60px 40px',
              backgroundColor: '#16213e',
              borderRadius: '12px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '48px',
                marginBottom: '16px',
              }}
            >
              📼
            </div>
            <h3
              style={{
                color: '#eaeaea',
                marginBottom: '8px',
              }}
            >
              No sessions recorded yet
            </h3>
            <p
              style={{
                color: '#888',
                margin: 0,
              }}
            >
              Start a session first to see recordings here
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '16px',
            }}
          >
            {sessions.map((session) => (
              <div
                key={session.roomId}
                onClick={() => handlePlayback(session.roomId)}
                style={{
                  backgroundColor: '#16213e',
                  borderRadius: '12px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, boxShadow 0.2s',
                  border: '1px solid #222',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'monospace',
                      color: '#4a90d9',
                      fontSize: '16px',
                      fontWeight: 'bold',
                    }}
                  >
                    {session.roomId}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={(e) => handleExport(session.roomId, e)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#1a1a2e',
                        border: '1px solid #333',
                        color: '#eaeaea',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Export
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    color: '#888',
                    fontSize: '13px',
                  }}
                >
                  <div>
                    <div style={{ marginBottom: '4px', color: '#555' }}>
                      Duration
                    </div>
                    <div style={{ color: '#eaeaea' }}>
                      {formatTime(session.duration)}
                    </div>
                  </div>
                  <div>
                    <div style={{ marginBottom: '4px', color: '#555' }}>
                      Events
                    </div>
                    <div style={{ color: '#eaeaea' }}>
                      {session.entryCount}
                    </div>
                  </div>
                  <div>
                    <div style={{ marginBottom: '4px', color: '#555' }}>
                      Size
                    </div>
                    <div style={{ color: '#eaeaea' }}>
                      {formatBytes(session.size)}
                    </div>
                  </div>
                  <div>
                    <div style={{ marginBottom: '4px', color: '#555' }}>
                      Modified
                    </div>
                    <div style={{ color: '#eaeaea' }}>
                      {formatDate(session.modifiedAt)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
