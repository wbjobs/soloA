import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PlaybackTerminal, PlaybackControls } from '../components';
import { PlaybackService } from '../services/playback';
import { LogEntry, ActiveUser, PlaybackState } from '../types';

export const Playback: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    speed: 1,
    currentTime: 0,
    totalTime: 0,
    currentIndex: 0,
  });
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);

  const playbackServiceRef = useRef<PlaybackService | null>(null);

  const handleExport = useCallback(() => {
    if (roomId) {
      window.location.href = `/api/log/${roomId}/export`;
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) {
      navigate('/sessions');
      return;
    }

    async function fetchLogs() {
      if (!roomId) return;

      try {
        const res = await fetch(`/api/log/${roomId}`);
        if (!res.ok) {
          const err = await res.json();
          setError(err.error || 'Session not found');
          setLoading(false);
          return;
        }

        const data = await res.json();
        setLogs(data.logs);

        if (data.logs.length === 0) {
          setError('No log entries found');
          setLoading(false);
          return;
        }

        const service = new PlaybackService(data.logs);
        playbackServiceRef.current = service;

        setPlaybackState(service.getState());

        const unregisterState = service.onStateChange((state) => {
          setPlaybackState(state);
        });

        const unregisterUsers = service.onUsersChange((users) => {
          setActiveUsers(users);
        });

        service.seekToPercent(0);
        setLoading(false);

        return () => {
          unregisterState();
          unregisterUsers();
          service.dispose();
        };
      } catch (err) {
        setError('Failed to load session');
        setLoading(false);
      }
    }

    fetchLogs();
  }, [roomId, navigate]);

  const handleBack = () => {
    navigate('/sessions');
  };

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f0f1a',
          fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
        }}
      >
        <div
          style={{
            backgroundColor: '#16213e',
            padding: '40px',
            borderRadius: '16px',
            textAlign: 'center',
            maxWidth: '400px',
          }}
        >
          <h2 style={{ color: '#ff5555', marginBottom: '16px' }}>Error</h2>
          <p style={{ color: '#eaeaea', marginBottom: '24px' }}>{error}</p>
          <button
            onClick={handleBack}
            style={{
              padding: '10px 24px',
              backgroundColor: '#4a90d9',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Go to Sessions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0f0f1a',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      }}
    >
      <header
        style={{
          padding: '16px 24px',
          backgroundColor: '#16213e',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <h1 style={{ color: '#eaeaea', fontSize: '20px', margin: 0 }}>
          Session Playback
        </h1>
        <div style={{ flex: 1 }} />
        {logs.length > 0 && (
          <div style={{ color: '#888', fontSize: '14px' }}>
            {logs.length} events
          </div>
        )}
      </header>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          gap: '16px',
          minHeight: 0,
        }}
      >
        {loading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#888',
              fontSize: '16px',
            }}
          >
            Loading session...
          </div>
        ) : playbackServiceRef.current ? (
          <>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                minWidth: 0,
              }}
            >
              <PlaybackTerminal playbackService={playbackServiceRef.current} />
            </div>

            <PlaybackControls
              roomId={roomId!}
              state={playbackState}
              activeUsers={activeUsers}
              playbackService={playbackServiceRef.current}
              onExport={handleExport}
              onBack={handleBack}
            />
          </>
        ) : null}
      </div>
    </div>
  );
};
