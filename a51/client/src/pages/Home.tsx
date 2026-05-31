import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');

  const createRoom = async () => {
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }

    try {
      const res = await fetch('/api/room/create', { method: 'POST' });
      const data = await res.json();
      navigate(`/room/${data.roomId}`, { state: { userName: userName.trim() } });
    } catch (err) {
      setError('Failed to create room');
    }
  };

  const joinRoom = async () => {
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!roomId.trim()) {
      setError('Please enter a room ID');
      return;
    }

    navigate(`/room/${roomId.trim()}`, { state: { userName: userName.trim() } });
  };

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
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          width: '400px',
        }}
      >
        <h1
          style={{
            color: '#eaeaea',
            fontSize: '28px',
            margin: '0 0 8px 0',
            textAlign: 'center',
          }}
        >
          Shared Terminal
        </h1>
        <p
          style={{
            color: '#888',
            textAlign: 'center',
            margin: '0 0 32px 0',
            fontSize: '14px',
          }}
        >
          Collaborate in real-time with others
        </p>

        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              color: '#eaeaea',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Your Name
          </label>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Enter your name"
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: '16px',
              borderRadius: '8px',
              border: '1px solid #333',
              backgroundColor: '#1a1a2e',
              color: '#eaeaea',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              color: '#eaeaea',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Room ID (optional, for joining)
          </label>
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Leave empty to create a new room"
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: '16px',
              borderRadius: '8px',
              border: '1px solid #333',
              backgroundColor: '#1a1a2e',
              color: '#eaeaea',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <div
            style={{
              padding: '12px',
              backgroundColor: '#ff555520',
              border: '1px solid #ff5555',
              borderRadius: '8px',
              color: '#ff5555',
              marginBottom: '20px',
              fontSize: '14px',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={createRoom}
            style={{
              flex: 1,
              padding: '14px',
              fontSize: '16px',
              fontWeight: '600',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#4a90d9',
              color: '#fff',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) =>
              ((e.target as HTMLButtonElement).style.backgroundColor = '#3a7fc9')
            }
            onMouseLeave={(e) =>
              ((e.target as HTMLButtonElement).style.backgroundColor = '#4a90d9')
            }
          >
            Create Room
          </button>
          <button
            onClick={joinRoom}
            style={{
              flex: 1,
              padding: '14px',
              fontSize: '16px',
              fontWeight: '600',
              borderRadius: '8px',
              border: '1px solid #4a90d9',
              backgroundColor: 'transparent',
              color: '#4a90d9',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) =>
              ((e.target as HTMLButtonElement).style.backgroundColor = '#4a90d920')
            }
            onMouseLeave={(e) =>
              ((e.target as HTMLButtonElement).style.backgroundColor = 'transparent')
            }
          >
            Join Room
          </button>
        </div>

        <div
          style={{
            marginTop: '24px',
            paddingTop: '24px',
            borderTop: '1px solid #333',
            textAlign: 'center',
          }}
        >
          <button
            onClick={() => navigate('/sessions')}
            style={{
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: '500',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#1a1a2e',
              color: '#888',
              cursor: 'pointer',
              transition: 'color 0.2s, background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.color = '#eaeaea';
              (e.target as HTMLButtonElement).style.backgroundColor = '#2a2a4e';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.color = '#888';
              (e.target as HTMLButtonElement).style.backgroundColor = '#1a1a2e';
            }}
          >
            📼 View Recorded Sessions
          </button>
        </div>
      </div>
    </div>
  );
};
