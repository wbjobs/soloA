import { ScoreData, NoteData, Operation, StaffData } from '../types';

export function createEmptyScore(): ScoreData {
  return {
    title: '新建乐谱',
    staves: [
      { index: 0, clef: 'treble', key: 'C', timeSignature: '4/4' }
    ],
    notes: [],
    tempo: 120,
    version: 0
  };
}

export function applyOperation(score: ScoreData, op: Operation): ScoreData {
  switch (op.type) {
    case 'add_note':
      return {
        ...score,
        notes: [...score.notes, op.note],
        version: op.version
      };
    case 'delete_note':
      return {
        ...score,
        notes: score.notes.filter(note => note.id !== op.noteId),
        version: op.version
      };
    case 'update_note':
      return {
        ...score,
        notes: score.notes.map(note => 
          note.id === op.noteId ? { ...note, ...op.changes } : note
        ),
        version: op.version
      };
    case 'update_tempo':
      return {
        ...score,
        tempo: op.tempo,
        version: op.version
      };
    case 'update_staff':
      return {
        ...score,
        staves: score.staves.map(staff =>
          staff.index === op.staffIndex ? { ...staff, ...op.changes } : staff
        ),
        version: op.version
      };
    default:
      return score;
  }
}

export function applyOperations(score: ScoreData, operations: Operation[]): ScoreData {
  let result = score;
  for (const op of operations) {
    result = applyOperation(result, op);
  }
  return result;
}

export function noteToMidi(note: NoteData): number {
  const pitchMap: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
  };
  
  const pitch = pitchMap[note.pitch];
  if (pitch === undefined) return 60;
  
  return 12 * (note.octave + 1) + pitch;
}

export function getDurationInBeats(duration: string): number {
  const durationMap: Record<string, number> = {
    'w': 4,
    'h': 2,
    'q': 1,
    '8': 0.5,
    '16': 0.25,
    '32': 0.125
  };
  return durationMap[duration] || 1;
}

export function sortNotesByPosition(notes: NoteData[]): NoteData[] {
  return [...notes].sort((a, b) => {
    if (a.staff !== b.staff) return a.staff - b.staff;
    return a.position - b.position;
  });
}

export function cloneScore(score: ScoreData): ScoreData {
  return JSON.parse(JSON.stringify(score));
}

export function getNotesByStaff(score: ScoreData, staffIndex: number): NoteData[] {
  return score.notes.filter(note => note.staff === staffIndex);
}

export function sortNotesByStaffAndPosition(notes: NoteData[]): NoteData[] {
  return [...notes].sort((a, b) => {
    if (a.staff !== b.staff) return a.staff - b.staff;
    return a.position - b.position;
  });
}
