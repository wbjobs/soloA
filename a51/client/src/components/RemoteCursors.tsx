import React, { useEffect, useRef } from 'react';
import { User } from '../types';

interface RemoteCursorsProps {
  participants: Map<string, User>;
  remoteCursors: Map<string, { row: number; col: number }>;
  currentUserId: string;
  terminalElement: HTMLDivElement | null;
}

export const RemoteCursors: React.FC<RemoteCursorsProps> = ({
  participants,
  remoteCursors,
  currentUserId,
  terminalElement,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!terminalElement || !containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = '';

    const termRect = terminalElement.getBoundingClientRect();
    const charWidth = termRect.width / 80;
    const lineHeight = termRect.height / 24;

    remoteCursors.forEach((cursor, userId) => {
      if (userId === currentUserId) return;
      const user = participants.get(userId);
      if (!user) return;

      const cursorEl = document.createElement('div');
      cursorEl.style.position = 'absolute';
      cursorEl.style.left = `${cursor.col * charWidth}px`;
      cursorEl.style.top = `${cursor.row * lineHeight}px`;
      cursorEl.style.width = `${charWidth}px`;
      cursorEl.style.height = `${lineHeight}px`;
      cursorEl.style.backgroundColor = user.color;
      cursorEl.style.opacity = '0.6';
      cursorEl.style.pointerEvents = 'none';
      cursorEl.style.zIndex = '10';
      cursorEl.style.transition = 'left 0.05s, top 0.05s';

      const label = document.createElement('div');
      label.textContent = user.name;
      label.style.position = 'absolute';
      label.style.left = '0';
      label.style.top = `-${lineHeight}px`;
      label.style.fontSize = '10px';
      label.style.backgroundColor = user.color;
      label.style.color = '#000';
      label.style.padding = '1px 4px';
      label.style.borderRadius = '3px';
      label.style.whiteSpace = 'nowrap';
      cursorEl.appendChild(label);

      container.appendChild(cursorEl);
    });
  }, [remoteCursors, participants, currentUserId, terminalElement]);

  return <div ref={containerRef} className="remote-cursors" style={{ position: 'relative', pointerEvents: 'none' }} />;
};
