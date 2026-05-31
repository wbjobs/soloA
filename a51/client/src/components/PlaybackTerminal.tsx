import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { PlaybackService, PlaybackEvent } from '../services/playback';
import { ActiveUser } from '../types';

interface PlaybackTerminalProps {
  playbackService: PlaybackService;
}

export const PlaybackTerminal: React.FC<PlaybackTerminalProps> = ({ playbackService }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [highlightingUser, setHighlightingUser] = useState<ActiveUser | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
      fontSize: 14,
      cursorBlink: false,
      cursorStyle: 'bar',
      convertEol: true,
      theme: {
        background: '#1a1a2e',
        foreground: '#eaeaea',
        cursor: '#888',
        cursorAccent: '#000000',
        selectionBackground: '#4a4a6a',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const unregisterEvent = playbackService.onEvent((event: PlaybackEvent, index: number) => {
      if (event.type === 'output' || event.type === 'input') {
        const user = playbackService.getUserById(event.userId);
        if (user && event.type === 'input') {
          const coloredData = `\x1b[38;2;${hexToRgb(user.color)}m${event.data}\x1b[0m`;
          term.write(coloredData);

          setHighlightingUser(user);
          if (highlightTimeoutRef.current) {
            clearTimeout(highlightTimeoutRef.current);
          }
          highlightTimeoutRef.current = window.setTimeout(() => {
            setHighlightingUser(null);
          }, 1000);
        } else {
          term.write(event.data);
        }
      }
    });

    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      unregisterEvent?.();
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      term.dispose();
    };
  }, [playbackService]);

  const write = useCallback((data: string) => {
    if (termRef.current) {
      termRef.current.write(data);
    }
  }, []);

  const clear = useCallback(() => {
    if (termRef.current) {
      termRef.current.clear();
    }
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#1a1a2e',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      />
      {highlightingUser && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            padding: '6px 14px',
            backgroundColor: highlightingUser.color + '30',
            border: `2px solid ${highlightingUser.color}`,
            borderRadius: '8px',
            color: highlightingUser.color,
            fontSize: '14px',
            fontWeight: 'bold',
            zIndex: 100,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: highlightingUser.color,
            }}
          />
          {highlightingUser.name} is typing
        </div>
      )}
    </div>
  );
};

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `${parseInt(result[1], 16)};${parseInt(result[2], 16)};${parseInt(result[3], 16)}`;
  }
  return '255;255;255';
}

export { XTerm };
