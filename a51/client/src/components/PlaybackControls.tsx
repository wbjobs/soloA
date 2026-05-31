import React from 'react';
import { PlaybackService, formatTime } from '../services/playback';
import { ActiveUser, PlaybackState } from '../types';

interface PlaybackControlsProps {
  roomId: string;
  state: PlaybackState;
  activeUsers: ActiveUser[];
  playbackService: PlaybackService;
  onExport: () => void;
  onBack: () => void;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8];

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  roomId,
  state,
  activeUsers,
  playbackService,
  onExport,
  onBack,
}) => {
  const progress = state.totalTime > 0 ? (state.currentTime / state.totalTime) * 100 : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = ((e.clientX - rect.left) / rect.width) * 100;
    playbackService.seekToPercent(percent);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        playbackService.toggle();
        break;
      case 'ArrowLeft':
        playbackService.jumpBackward(5);
        break;
      case 'ArrowRight':
        playbackService.jumpForward(5);
        break;
      case 'ArrowUp':
        const currentSpeedIndex = SPEEDS.indexOf(state.speed);
        if (currentSpeedIndex < SPEEDS.length - 1) {
          playbackService.setSpeed(SPEEDS[currentSpeedIndex + 1]);
        }
        break;
      case 'ArrowDown':
        const currentSpeedIndexDown = SPEEDS.indexOf(state.speed);
        if (currentSpeedIndexDown > 0) {
          playbackService.setSpeed(SPEEDS[currentSpeedIndexDown - 1]);
        }
        break;
    }
  };

  return (
    <div
      style={{
        padding: '16px 24px',
        backgroundColor: '#16213e',
        borderTop: '1px solid #333',
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
        <button
          onClick={onBack}
          style={{
            padding: '8px 16px',
            backgroundColor: 'transparent',
            border: '1px solid #4a90d9',
            color: '#4a90d9',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          ← Back to Sessions
        </button>

        <div
          style={{
            padding: '6px 12px',
            backgroundColor: '#1a1a2e',
            borderRadius: '6px',
            fontFamily: 'monospace',
            color: '#4a90d9',
            fontSize: '14px',
          }}
        >
          {roomId}
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={onExport}
          style={{
            padding: '8px 16px',
            backgroundColor: '#4a90d9',
            border: 'none',
            color: '#fff',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          ⬇ Export Log
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => playbackService.jumpBackward(10)}
            style={{
              width: '36px',
              height: '36px',
              backgroundColor: '#1a1a2e',
              border: '1px solid #333',
              color: '#eaeaea',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
            title="Rewind 10s"
          >
            ⏮
          </button>

          <button
            onClick={() => playbackService.toggle()}
            style={{
              width: '44px',
              height: '44px',
              backgroundColor: '#4a90d9',
              border: 'none',
              color: '#fff',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '18px',
            }}
          >
            {state.isPlaying ? '⏸' : '▶'}
          </button>

          <button
            onClick={() => playbackService.jumpForward(10)}
            style={{
              width: '36px',
              height: '36px',
              backgroundColor: '#1a1a2e',
              border: '1px solid #333',
              color: '#eaeaea',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
            title="Forward 10s"
          >
            ⏭
          </button>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#888',
            fontFamily: 'monospace',
            fontSize: '14px',
          }}
        >
          <span style={{ minWidth: '50px', textAlign: 'right' }}>
            {formatTime(state.currentTime)}
          </span>

          <div
            onClick={handleProgressClick}
            style={{
              flex: 1,
              height: '6px',
              backgroundColor: '#333',
              borderRadius: '3px',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <div
              style={{
                height: '100%',
                backgroundColor: '#4a90d9',
                borderRadius: '3px',
                width: `${progress}%`,
                transition: 'width 0.1s linear',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: `${progress}%`,
                transform: 'translate(-50%, -50%)',
                width: '14px',
                height: '14px',
                backgroundColor: '#4a90d9',
                borderRadius: '50%',
              }}
            />
          </div>

          <span style={{ minWidth: '50px' }}>{formatTime(state.totalTime)}</span>
        </div>

        <select
          value={state.speed}
          onChange={(e) => playbackService.setSpeed(parseFloat(e.target.value))}
          style={{
            padding: '6px 10px',
            backgroundColor: '#1a1a2e',
            border: '1px solid #333',
            color: '#eaeaea',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </div>

      {activeUsers.length > 0 && (
        <div
          style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid #222',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <span style={{ color: '#888', fontSize: '13px' }}>Active Users:</span>
          <div style={{ display: 'flex', gap: '12px' }}>
            {activeUsers.map((user) => (
              <div
                key={user.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  backgroundColor: '#1a1a2e',
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: '#eaeaea',
                }}
              >
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: user.color,
                  }}
                />
                {user.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
