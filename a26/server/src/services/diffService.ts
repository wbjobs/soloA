import { NoteData, StaffData, ScoreData, ScoreDiff, NoteDiff, StaffDiff, DiffType } from '../types';

export class DiffService {
  computeDiff(oldScore: ScoreData, newScore: ScoreData): ScoreDiff {
    const noteDiffs = this.computeNoteDiffs(oldScore.notes, newScore.notes);
    const staffDiffs = this.computeStaffDiffs(oldScore.staves, newScore.staves);
    
    let tempoDiff = undefined;
    if (oldScore.tempo !== newScore.tempo) {
      tempoDiff = {
        old: oldScore.tempo,
        new: newScore.tempo
      };
    }

    return {
      notes: noteDiffs,
      staves: staffDiffs,
      tempo: tempoDiff,
      oldVersion: oldScore.version,
      newVersion: newScore.version
    };
  }

  private computeNoteDiffs(oldNotes: NoteData[], newNotes: NoteData[]): NoteDiff[] {
    const diffs: NoteDiff[] = [];
    const oldNoteMap = new Map<string, NoteData>();
    const newNoteMap = new Map<string, NoteData>();

    for (const note of oldNotes) {
      oldNoteMap.set(note.id, note);
    }

    for (const note of newNotes) {
      newNoteMap.set(note.id, note);
    }

    for (const newNote of newNotes) {
      const oldNote = oldNoteMap.get(newNote.id);
      
      if (!oldNote) {
        diffs.push({
          type: 'added',
          note: newNote
        });
      } else {
        const changes = this.getNoteChanges(oldNote, newNote);
        if (Object.keys(changes).length > 0) {
          if ((changes.position !== undefined || changes.staff !== undefined) && 
              Object.keys(changes).length === 1 || 
              (changes.position !== undefined && changes.staff !== undefined)) {
            diffs.push({
              type: 'moved',
              note: newNote,
              oldNote,
              changes
            });
          } else {
            diffs.push({
              type: 'modified',
              note: newNote,
              oldNote,
              changes
            });
          }
        }
      }
    }

    for (const oldNote of oldNotes) {
      if (!newNoteMap.has(oldNote.id)) {
        diffs.push({
          type: 'removed',
          note: oldNote
        });
      }
    }

    return diffs.sort((a, b) => {
      const posA = a.note.position * 100 + a.note.staff;
      const posB = b.note.position * 100 + b.note.staff;
      return posA - posB;
    });
  }

  private computeStaffDiffs(oldStaves: StaffData[], newStaves: StaffData[]): StaffDiff[] {
    const diffs: StaffDiff[] = [];
    const oldStaffMap = new Map<number, StaffData>();
    const newStaffMap = new Map<number, StaffData>();

    for (const staff of oldStaves) {
      oldStaffMap.set(staff.index, staff);
    }

    for (const staff of newStaves) {
      newStaffMap.set(staff.index, staff);
    }

    for (const newStaff of newStaves) {
      const oldStaff = oldStaffMap.get(newStaff.index);
      
      if (!oldStaff) {
        diffs.push({
          type: 'added',
          staff: newStaff
        });
      } else {
        const changes = this.getStaffChanges(oldStaff, newStaff);
        if (Object.keys(changes).length > 0) {
          diffs.push({
            type: 'modified',
            staff: newStaff,
            oldStaff,
            changes: changes as Partial<StaffData>
          });
        }
      }
    }

    for (const oldStaff of oldStaves) {
      if (!newStaffMap.has(oldStaff.index)) {
        diffs.push({
          type: 'removed',
          staff: oldStaff
        });
      }
    }

    return diffs.sort((a, b) => a.staff.index - b.staff.index);
  }

  private getNoteChanges(oldNote: NoteData, newNote: NoteData): Partial<NoteData> {
    const changes: Partial<NoteData> = {};
    
    if (oldNote.pitch !== newNote.pitch) {
      changes.pitch = newNote.pitch;
    }
    if (oldNote.octave !== newNote.octave) {
      changes.octave = newNote.octave;
    }
    if (oldNote.duration !== newNote.duration) {
      changes.duration = newNote.duration;
    }
    if (oldNote.position !== newNote.position) {
      changes.position = newNote.position;
    }
    if (oldNote.staff !== newNote.staff) {
      changes.staff = newNote.staff;
    }
    
    return changes;
  }

  private getStaffChanges(oldStaff: StaffData, newStaff: StaffData): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    
    if (oldStaff.clef !== newStaff.clef) {
      changes.clef = newStaff.clef;
    }
    if (oldStaff.key !== newStaff.key) {
      changes.key = newStaff.key;
    }
    if (oldStaff.timeSignature !== newStaff.timeSignature) {
      changes.timeSignature = newStaff.timeSignature;
    }
    
    return changes;
  }

  getDiffByVersions(
    oldScore: ScoreData,
    newScore: ScoreData
  ): ScoreDiff {
    return this.computeDiff(oldScore, newScore);
  }

  getDiffSummary(diff: ScoreDiff): {
    added: number;
    removed: number;
    modified: number;
    moved: number;
  } {
    const summary = {
      added: 0,
      removed: 0,
      modified: 0,
      moved: 0
    };

    for (const noteDiff of diff.notes) {
      summary[noteDiff.type]++;
    }

    for (const staffDiff of diff.staves) {
      summary[staffDiff.type]++;
    }

    return summary;
  }
}

export const diffService = new DiffService();
