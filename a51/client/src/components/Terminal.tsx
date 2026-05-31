import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { SignalingService } from '../services/signaling';
import { Permission } from '../types';

interface TerminalProps {
  signaling: SignalingService;
  permission: Permission;
  onCursorUpdate?: (cursor: { row: number; col: number }) => void;
  onOutput?: (data: string) => void;
}

export const Terminal: React.FC<TerminalProps> = ({
  signaling,
  permission,
  onCursorUpdate,
  onOutput,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const canWriteRef = useRef(permission !== 'read');
  const inputBufferRef = useRef<string[]>([]);
  const isProcessingInputRef = useRef(false);
  const cursorThrottleRef = useRef<number | null>(null);
  const lastCursorRef = useRef<{ row: number; col: number } | null>(null);
  const signalingRef = useRef<SignalingService | null>(null);
  const cleanupRef = useRef<() => void>(() => {});

  canWriteRef.current = permission !== 'read';
  signalingRef.current = signaling;

  const processInputQueue = useCallback(async () => {
    if (isProcessingInputRef.current) return;
    isProcessingInputRef.current = true;

    while (inputBufferRef.current.length > 0) {
      const data = inputBufferRef.current.shift();
      if (data && signalingRef.current && canWriteRef.current) {
        signalingRef.current.sendInput(data);
      }
    }

    isProcessingInputRef.current = false;
  }, []);

  const sendCursor = useCallback((cursor: { row: number; col: number }) => {
    if (!onCursorUpdate || !canWriteRef.current) return;

    if (cursorThrottleRef.current) {
      lastCursorRef.current = cursor;
      return;
    }

    lastCursorRef.current = cursor;
    onCursorUpdate(cursor);

    cursorThrottleRef.current = window.setTimeout(() => {
      cursorThrottleRef.current = null;
      if (lastCursorRef.current) {
        onCursorUpdate(lastCursorRef.current);
        lastCursorRef.current = null;
      }
    }, 50);
  }, [onCursorUpdate]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
      fontSize: 14,
      cursorBlink: canWriteRef.current,
      cursorStyle: canWriteRef.current ? 'block' : 'underline',
      convertEol: true,
      allowProposedApi: true,
      theme: {
        background: '#1a1a2e',
        foreground: '#eaeaea',
        cursor: '#00ff00',
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

    if (!canWriteRef.current) {
      term.write(
        '\x1b[33m[Read-only mode] You are viewing this terminal in read-only mode.\r\nContact the room owner to request write access.\x1b[0m\r\n\r\n'
      );
    }

    const messageHandler = (msg: any) => {
      if (msg.type === 'terminal-output') {
        term.write(msg.data);
        onOutput?.(msg.data);
      }
    };

    const unregister = signaling.on('message', messageHandler);

    const dataDisposable = term.onData((data) => {
      if (!canWriteRef.current) {
        term.write('\x07');
        return;
      }
      inputBufferRef.current.push(data);
      processInputQueue();
    });

    const keyDisposable = term.onKey((event) => {
      if (!canWriteRef.current) {
        term.write('\x07');
      }
    });

    const cursorDisposable = term.onCursorMove(() => {
      sendCursor({
        row: term.buffer.active.cursorY,
        col: term.buffer.active.cursorX,
      });
    });

    const handleResize = () => {
      fitAddon.fit();
      if (canWriteRef.current && signalingRef.current) {
        signalingRef.current.sendResize(term.cols, term.rows);
      }
    };
    window.addEventListener('resize', handleResize);

    cleanupRef.current = () => {
      window.removeEventListener('resize', handleResize);
      unregister?.();
      dataDisposable.dispose();
      keyDisposable.dispose();
      cursorDisposable.dispose();
      if (cursorThrottleRef.current) {
        clearTimeout(cursorThrottleRef.current);
      }
      term.dispose();
    };

    return cleanupRef.current;
  }, []);

  useEffect(() => {
    if (termRef.current) {
      const canWrite = permission !== 'read';
      termRef.current.options.cursorBlink = canWrite;
      termRef.current.options.cursorStyle = canWrite ? 'block' : 'underline';
    }
  }, [permission]);

  return (
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
  );
};

export { XTerm };
