import { useEffect, useRef, useState, useCallback } from 'react';
import { Factory, Renderer, Stave, StaveNote, Voice, Formatter, Beam } from 'vexflow';
import { v4 as uuidv4 } from 'uuid';
import { ScoreData, NoteData, StaffData, Operation } from '../types';
import { sortNotesByPosition, getNotesByStaff } from '../utils/scoreSerialization';

interface ScoreEditorProps {
  score: ScoreData;
  onOperation: (op: Omit<Operation, 'id' | 'userId' | 'timestamp' | 'version'>) => void;
  selectedNoteId?: string | null;
  onSelectNote?: (noteId: string | null) => void;
  readOnly?: boolean;
}

const NOTE_WIDTH = 80;
const STAFF_WIDTH = 800;
const STAFF_HEIGHT = 150;
const STAFF_START_X = 50;
const STAFF_START_Y = 50;

const PITCHES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const DURATIONS = ['w', 'h', 'q', '8', '16', '32'];

export function ScoreEditor({
  score,
  onOperation,
  selectedNoteId,
  onSelectNote,
  readOnly = false
}: ScoreEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [factory, setFactory] = useState<Factory | null>(null);
  const [selectedDuration, setSelectedDuration] = useState('q');
  const [selectedPitch, setSelectedPitch] = useState('C');
  const [selectedOctave, setSelectedOctave] = useState(4);
  const [dragInfo, setDragInfo] = useState<{
    noteId: string;
    startX: number;
    startY: number;
    originalPosition: number;
    originalPitch: string;
    originalOctave: number;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = Math.max(STAFF_WIDTH + 100, containerRef.current.clientWidth);
    const height = score.staves.length * STAFF_HEIGHT + 100;

    const newFactory = new Factory({
      renderer: {
        elementId: containerRef.current.id || 'score-container',
        width,
        height,
        backend: 'canvas'
      }
    });

    setFactory(newFactory);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [score.staves.length]);

  const renderScore = useCallback(() => {
    if (!factory || !containerRef.current) return;

    factory.context.clear();
    
    score.staves.forEach((staff, staffIndex) => {
      const ctx = factory.context;
      const staveY = STAFF_START_Y + staffIndex * STAFF_HEIGHT;
      
      const stave = new Stave(STAFF_START_X, staveY, STAFF_WIDTH);
      stave.addClef(staff.clef);
      stave.addKeySignature(staff.key);
      stave.addTimeSignature(staff.timeSignature);
      stave.setContext(ctx).draw();

      const notes = sortNotesByPosition(getNotesByStaff(score, staffIndex));
      
      if (notes.length === 0) return;

      const vexNotes: StaveNote[] = [];
      const beams: Beam[] = [];

      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const isSelected = note.id === selectedNoteId;
        
        const vexNote = new StaveNote({
          keys: [`${note.pitch}/${note.octave}`],
          duration: note.duration,
          stem_direction: 0
        });

        if (isSelected) {
          vexNote.setStyle({
            fillStyle: '#4285f4',
            strokeStyle: '#4285f4'
          });
        }

        (vexNote as any).noteId = note.id;
        vexNotes.push(vexNote);
      }

      const currentNoteGroup: StaveNote[] = [];
      for (let i = 0; i < vexNotes.length; i++) {
        const note = vexNotes[i];
        if (['8', '16', '32'].includes(note.getDuration())) {
          currentNoteGroup.push(note);
        } else if (currentNoteGroup.length > 0) {
          if (currentNoteGroup.length > 1) {
            beams.push(new Beam(currentNoteGroup));
          }
          currentNoteGroup.length = 0;
        }
      }
      if (currentNoteGroup.length > 1) {
        beams.push(new Beam(currentNoteGroup));
      }

      const voice = new Voice({
        num_beats: 4,
        beat_value: 4
      });
      voice.addTickables(vexNotes);

      new Formatter().joinVoices([voice]).format([voice], STAFF_WIDTH - 100);
      voice.draw(ctx, stave);

      beams.forEach(beam => beam.setContext(ctx).draw());
    });
  }, [factory, score, selectedNoteId]);

  useEffect(() => {
    renderScore();
  }, [renderScore]);

  const getNoteAtPosition = useCallback((x: number, y: number): NoteData | null => {
    const staffIndex = Math.floor((y - STAFF_START_Y + 20) / STAFF_HEIGHT);
    if (staffIndex < 0 || staffIndex >= score.staves.length) return null;

    const notes = sortNotesByPosition(getNotesByStaff(score, staffIndex));
    
    for (const note of notes) {
      const noteX = STAFF_START_X + 100 + note.position * NOTE_WIDTH;
      const noteY = STAFF_START_Y + staffIndex * STAFF_HEIGHT + 50;
      
      if (Math.abs(x - noteX) < 30 && Math.abs(y - noteY) < 50) {
        return note;
      }
    }
    
    return null;
  }, [score]);

  const getPitchFromY = useCallback((y: number, staffIndex: number): { pitch: string; octave: number } => {
    const staffY = STAFF_START_Y + staffIndex * STAFF_HEIGHT;
    const centerY = staffY + 50;
    const deltaY = centerY - y;
    const semitones = Math.round(deltaY / 5);
    
    const basePitchIndex = 3;
    let pitchIndex = basePitchIndex + semitones;
    let octave = 4;
    
    while (pitchIndex < 0) {
      pitchIndex += 7;
      octave--;
    }
    while (pitchIndex >= 7) {
      pitchIndex -= 7;
      octave++;
    }
    
    octave = Math.max(1, Math.min(7, octave));
    
    return { pitch: PITCHES[pitchIndex], octave };
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (readOnly) return;
    
    const canvas = canvasRef.current || containerRef.current?.querySelector('canvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const clickedNote = getNoteAtPosition(x, y);
    
    if (clickedNote) {
      onSelectNote?.(clickedNote.id);
      return;
    }
    
    onSelectNote?.(null);
    
    if (x < STAFF_START_X + 100) return;
    
    const staffIndex = Math.floor((y - STAFF_START_Y + 20) / STAFF_HEIGHT);
    if (staffIndex < 0 || staffIndex >= score.staves.length) return;
    
    const position = Math.floor((x - STAFF_START_X - 100) / NOTE_WIDTH);
    
    const newNote: NoteData = {
      id: uuidv4(),
      pitch: selectedPitch,
      octave: selectedOctave,
      duration: selectedDuration,
      position,
      staff: staffIndex
    };
    
    onOperation({
      type: 'add_note',
      note: newNote
    });
  }, [readOnly, getNoteAtPosition, selectedPitch, selectedOctave, selectedDuration, score.staves.length, onSelectNote, onOperation]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (readOnly) return;
    
    const canvas = canvasRef.current || containerRef.current?.querySelector('canvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const clickedNote = getNoteAtPosition(x, y);
    if (!clickedNote) return;
    
    setDragInfo({
      noteId: clickedNote.id,
      startX: x,
      startY: y,
      originalPosition: clickedNote.position,
      originalPitch: clickedNote.pitch,
      originalOctave: clickedNote.octave
    });
  }, [readOnly, getNoteAtPosition]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragInfo) return;
    
    const canvas = canvasRef.current || containerRef.current?.querySelector('canvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const staffIndex = Math.floor((y - STAFF_START_Y + 20) / STAFF_HEIGHT);
    if (staffIndex < 0 || staffIndex >= score.staves.length) return;
    
    const dx = x - dragInfo.startX;
    const newPosition = dragInfo.originalPosition + Math.round(dx / NOTE_WIDTH);
    
    const { pitch, octave } = getPitchFromY(y, staffIndex);
    
    const changes: Partial<NoteData> = {};
    if (newPosition !== dragInfo.originalPosition) {
      changes.position = Math.max(0, newPosition);
    }
    if (pitch !== dragInfo.originalPitch || octave !== dragInfo.originalOctave) {
      changes.pitch = pitch;
      changes.octave = octave;
    }
    
    if (Object.keys(changes).length > 0) {
      onOperation({
        type: 'update_note',
        noteId: dragInfo.noteId,
        changes
      });
      
      setDragInfo(prev => prev ? {
        ...prev,
        startX: x,
        startY: y,
        originalPosition: changes.position ?? prev.originalPosition,
        originalPitch: changes.pitch ?? prev.originalPitch,
        originalOctave: changes.octave ?? prev.originalOctave
      } : null);
    }
  }, [dragInfo, score.staves.length, getPitchFromY, onOperation]);

  const handleMouseUp = useCallback(() => {
    setDragInfo(null);
  }, []);

  const handleDeleteKey = useCallback(() => {
    if (!selectedNoteId || readOnly) return;
    
    onOperation({
      type: 'delete_note',
      noteId: selectedNoteId
    });
    onSelectNote?.(null);
  }, [selectedNoteId, readOnly, onOperation, onSelectNote]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.target === document.body || (e.target as HTMLElement).tagName === 'CANVAS') {
          handleDeleteKey();
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleDeleteKey]);

  const selectedNote = selectedNoteId ? score.notes.find(n => n.id === selectedNoteId) : null;

  return (
    <div className="score-editor">
      <div className="editor-toolbar" style={{ padding: '10px', borderBottom: '1px solid #e0e0e0', display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label>音高:</label>
          <select 
            value={selectedPitch} 
            onChange={(e) => setSelectedPitch(e.target.value)}
            disabled={readOnly}
          >
            {PITCHES.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select 
            value={selectedOctave} 
            onChange={(e) => setSelectedOctave(Number(e.target.value))}
            disabled={readOnly}
          >
            {[1, 2, 3, 4, 5, 6, 7].map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label>时值:</label>
          <select 
            value={selectedDuration} 
            onChange={(e) => setSelectedDuration(e.target.value)}
            disabled={readOnly}
          >
            <option value="w">全音符</option>
            <option value="h">二分音符</option>
            <option value="q">四分音符</option>
            <option value="8">八分音符</option>
            <option value="16">十六分音符</option>
            <option value="32">三十二分音符</option>
          </select>
        </div>

        {selectedNote && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ color: '#666' }}>
              选中: {selectedNote.pitch}{selectedNote.octave}
            </span>
            <button 
              onClick={handleDeleteKey}
              disabled={readOnly}
              style={{ 
                padding: '4px 12px', 
                background: '#f44336', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              删除
            </button>
          </div>
        )}
      </div>
      
      <div 
        id="score-container"
        ref={containerRef}
        style={{ 
          width: '100%', 
          overflow: 'auto', 
          padding: '20px',
          cursor: readOnly ? 'default' : 'crosshair'
        }}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      
      <div style={{ padding: '10px', color: '#666', fontSize: '12px' }}>
        <p>提示: 点击空白处添加音符 | 拖拽音符调整位置和音高 | Delete键删除选中音符</p>
      </div>
    </div>
  );
}
