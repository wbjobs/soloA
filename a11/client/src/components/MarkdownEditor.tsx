import React, { useEffect, useRef, useCallback } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import type { CursorPosition } from '../types';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onCursorChange?: (cursor: CursorPosition) => void;
  readOnly?: boolean;
  remoteCursors?: Map<string, { username: string; cursor: CursorPosition }>;
}

const theme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
    backgroundColor: '#ffffff',
  },
  '.cm-content': {
    padding: '16px',
    fontFamily: '"SF Mono", Monaco, Inconsolata, "Fira Code", "Droid Sans Mono", monospace',
    lineHeight: '1.6',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-gutters': {
    backgroundColor: '#f8fafc',
    borderRight: '1px solid #e2e8f0',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#f1f5f9',
  },
  '.cm-activeLine': {
    backgroundColor: '#f8fafc',
  },
  '.cm-cursor': {
    borderLeftWidth: '2px',
  },
});

export function MarkdownEditor({ value, onChange, onCursorChange, readOnly = false, remoteCursors }: MarkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const updateListenerRef = useRef<Compartment>(new Compartment());
  const isRemoteUpdateRef = useRef(false);

  const createUpdateListener = useCallback(() => {
    return EditorView.updateListener.of((update) => {
      if (update.docChanged && !isRemoteUpdateRef.current) {
        const newValue = update.state.doc.toString();
        onChange(newValue);
      }

      if (update.selectionSet && onCursorChange && !isRemoteUpdateRef.current) {
        const selection = update.state.selection.main;
        onCursorChange({
          from: selection.from,
          to: selection.to,
        });
      }
    });
  }, [onChange, onCursorChange]);

  useEffect(() => {
    if (!editorRef.current) return;

    const startState = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        theme,
        EditorView.lineWrapping,
        readOnly ? EditorView.editable.of(false) : [],
        updateListenerRef.current.of(createUpdateListener()),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [readOnly]);

  useEffect(() => {
    if (!viewRef.current) return;

    const currentDoc = viewRef.current.state.doc.toString();
    if (value !== currentDoc) {
      isRemoteUpdateRef.current = true;
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: value,
        },
      });
      isRemoteUpdateRef.current = false;
    }
  }, [value]);

  useEffect(() => {
    if (!viewRef.current || !onCursorChange) return;

    const newListener = createUpdateListener();
    viewRef.current.dispatch({
      effects: updateListenerRef.current.reconfigure(newListener),
    });
  }, [onCursorChange, createUpdateListener]);

  return (
    <div ref={editorRef} className="h-full w-full" />
  );
}

export default MarkdownEditor;
