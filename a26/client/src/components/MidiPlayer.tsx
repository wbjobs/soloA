import { ScoreData } from '../types';
import { useMidiPlayer } from '../hooks/useMidiPlayer';

interface MidiPlayerProps {
  score: ScoreData;
  onTempoChange?: (tempo: number) => void;
}

export function MidiPlayer({ score, onTempoChange }: MidiPlayerProps) {
  const {
    isPlaying,
    isPaused,
    currentTime,
    tempo,
    volume,
    totalDuration,
    play,
    pause,
    stop,
    setTempo,
    setVolume
  } = useMidiPlayer({ score });

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTempoChange = (newTempo: number) => {
    setTempo(newTempo);
    onTempoChange?.(newTempo);
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="midi-player" style={{ 
      padding: '16px', 
      background: '#f5f5f5', 
      borderRadius: '8px',
      border: '1px solid #e0e0e0'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
        <button
          onClick={isPlaying ? pause : play}
          style={{
            padding: '8px 20px',
            background: isPlaying ? '#ff9800' : '#4caf50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            minWidth: '80px'
          }}
        >
          {isPlaying ? '暂停' : isPaused ? '继续' : '播放'}
        </button>
        
        <button
          onClick={stop}
          disabled={!isPlaying && !isPaused}
          style={{
            padding: '8px 20px',
            background: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isPlaying || isPaused ? 'pointer' : 'not-allowed',
            opacity: isPlaying || isPaused ? 1 : 0.5
          }}
        >
          停止
        </button>

        <span style={{ 
          minWidth: '100px', 
          textAlign: 'center',
          fontFamily: 'monospace'
        }}>
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
      </div>

      <div style={{ 
        width: '100%', 
        height: '4px', 
        background: '#e0e0e0', 
        borderRadius: '2px',
        marginBottom: '16px',
        overflow: 'hidden'
      }}>
        <div 
          style={{ 
            width: `${progress}%`, 
            height: '100%', 
            background: '#4285f4',
            transition: 'width 0.1s'
          }} 
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', color: '#666' }}>速度:</label>
          <input
            type="range"
            min="40"
            max="240"
            value={tempo}
            onChange={(e) => handleTempoChange(Number(e.target.value))}
            style={{ width: '150px' }}
          />
          <span style={{ minWidth: '50px', textAlign: 'right' }}>{tempo} BPM</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', color: '#666' }}>音量:</label>
          <input
            type="range"
            min="0"
            max="100"
            value={volume * 100}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            style={{ width: '100px' }}
          />
          <span style={{ minWidth: '40px', textAlign: 'right' }}>{Math.round(volume * 100)}%</span>
        </div>

        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#999' }}>
          音符数: {score.notes.length}
        </div>
      </div>
    </div>
  );
}
