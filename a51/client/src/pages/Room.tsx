import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Terminal, ParticipantList } from '../components';
import { SignalingService, WebRTCService } from '../services';
import { User, Permission } from '../types';

export const Room: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const userName = (location.state as { userName?: string })?.userName || 'Guest';

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [participants, setParticipants] = useState<User[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<Map<string, { row: number; col: number }>>(
    new Map()
  );
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  const signalingRef = useRef<SignalingService | null>(null);
  const webrtcRef = useRef<WebRTCService | null>(null);
  const participantsRef = useRef<User[]>([]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  const handleCursorUpdate = useCallback(
    (cursor: { row: number; col: number }) => {
      if (signalingRef.current && currentUser) {
        signalingRef.current.sendCursor(cursor);
      }
    },
    [currentUser]
  );

  const handleSetPermission = useCallback((userId: string, permission: 'write' | 'read') => {
    signalingRef.current?.setPermission(userId, permission);
  }, []);

  useEffect(() => {
    if (!roomId) {
      navigate('/');
      return;
    }

    const signaling = new SignalingService('/ws');
    const webrtc = new WebRTCService(signaling);

    signalingRef.current = signaling;
    webrtcRef.current = webrtc;

    signaling.on('open', () => {
      signaling.joinRoom(roomId, userName);
    });

    signaling.on('message', (msg) => {
      switch (msg.type) {
        case 'join-ack':
          if (msg.success) {
            setCurrentUser(msg.user);
            setParticipants(msg.participants);
            webrtc.setLocalUserId(msg.user.id);
            setConnected(true);

            msg.participants.forEach((p) => {
              if (p.id !== msg.user.id) {
                webrtc.createPeer(p.id, true);
              }
            });
          } else {
            setError('Failed to join room');
          }
          break;

        case 'user-joined':
          setParticipants((prev) => [...prev, msg.user]);
          if (currentUser) {
            webrtc.createPeer(msg.user.id, false);
          }
          break;

        case 'user-left':
          setParticipants((prev) => prev.filter((p) => p.id !== msg.userId));
          setRemoteCursors((prev) => {
            const next = new Map(prev);
            next.delete(msg.userId);
            return next;
          });
          break;

        case 'permission-changed':
          setParticipants((prev) =>
            prev.map((p) =>
              p.id === msg.userId ? { ...p, permission: msg.permission as Permission } : p
            )
          );
          if (currentUser?.id === msg.userId) {
            setCurrentUser((prev) =>
              prev ? { ...prev, permission: msg.permission as Permission } : null
            );
          }
          break;

        case 'cursor-update':
          if (msg.userId !== currentUser?.id) {
            setRemoteCursors((prev) => {
              const next = new Map(prev);
              next.set(msg.userId, msg.cursor);
              return next;
            });
          }
          break;
      }
    });

    signaling.on('close', () => {
      setConnected(false);
    });

    signaling.on('error', (err) => {
      console.error('Signaling error:', err);
      setError('Connection error');
    });

    signaling.connect().catch((err) => {
      console.error('Failed to connect:', err);
      setError('Failed to connect to server');
    });

    return () => {
      webrtc.disconnectAll();
      signaling.disconnect();
    };
  }, [roomId, userName, navigate]);

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f0f1a',
        }}
      >
        <div
          style={{
            backgroundColor: '#16213e',
            padding: '40px',
            borderRadius: '16px',
            color: '#ff5555',
            textAlign: 'center',
          }}
        >
          <h2 style={{ margin: '0 0 16px 0' }}>Error</h2>
          <p>{error}</p>
          <button
            onClick={() => navigate('/')}
            style={{
              marginTop: '20px',
              padding: '10px 24px',
              backgroundColor: '#4a90d9',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const copyRoomId = async () => {
    if (roomId) {
      await navigator.clipboard.writeText(roomId);
      alert('Room ID copied to clipboard!');
    }
  };

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
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <h1 style={{ color: '#eaeaea', fontSize: '20px', margin: 0 }}>Shared Terminal</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#888', fontSize: '14px' }}>Room:</span>
            <span
              style={{
                color: '#4a90d9',
                fontFamily: 'monospace',
                padding: '4px 10px',
                backgroundColor: '#1a1a2e',
                borderRadius: '4px',
              }}
            >
              {roomId}
            </span>
            <button
              onClick={copyRoomId}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                backgroundColor: 'transparent',
                border: '1px solid #4a90d9',
                color: '#4a90d9',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Copy
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {currentUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: currentUser.color,
                }}
              />
              <span style={{ color: '#eaeaea' }}>{currentUser.name}</span>
              <span
                style={{
                  fontSize: '12px',
                  padding: '2px 8px',
                  backgroundColor:
                    currentUser.permission === 'owner'
                      ? '#FFD70030'
                      : currentUser.permission === 'write'
                      ? '#55FF5530'
                      : '#88888830',
                  color:
                    currentUser.permission === 'owner'
                      ? '#FFD700'
                      : currentUser.permission === 'write'
                      ? '#55FF55'
                      : '#888',
                  borderRadius: '4px',
                  fontWeight: '600',
                }}
              >
                {currentUser.permission.toUpperCase()}
              </span>
            </div>
          )}
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: connected ? '#55FF55' : '#888',
            }}
          />
          <span style={{ color: '#888', fontSize: '14px' }}>
            {connected ? 'Connected' : 'Connecting...'}
          </span>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, padding: '16px', gap: '16px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          {signalingRef.current && currentUser ? (
            <Terminal
              signaling={signalingRef.current}
              permission={currentUser.permission}
              onCursorUpdate={handleCursorUpdate}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#1a1a2e',
                borderRadius: '8px',
                color: '#888',
              }}
            >
              Connecting...
            </div>
          )}

          {currentUser?.permission === 'read' && (
            <div
              style={{
                position: 'absolute',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '8px 16px',
                backgroundColor: '#ff555540',
                color: '#ff9999',
                borderRadius: '8px',
                fontSize: '14px',
                zIndex: 100,
              }}
            >
              Read-only mode - you cannot type
            </div>
          )}
        </div>

        <div style={{ width: '280px' }}>
          <ParticipantList
            participants={participants}
            currentUser={currentUser}
            onSetPermission={handleSetPermission}
          />
        </div>
      </div>
    </div>
  );
};
