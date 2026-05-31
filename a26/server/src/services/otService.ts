import { Operation, NoteData, ScoreData } from '../types';

export class OTService {
  transform(op: Operation, against: Operation): Operation {
    if (op.type === 'add_note' && against.type === 'add_note') {
      return this.transformAddAgainstAdd(op, against);
    }
    if (op.type === 'delete_note' && against.type === 'delete_note') {
      return this.transformDeleteAgainstDelete(op, against);
    }
    if (op.type === 'update_note' && against.type === 'update_note') {
      return this.transformUpdateAgainstUpdate(op, against);
    }
    if (op.type === 'add_note' && against.type === 'delete_note') {
      return this.transformAddAgainstDelete(op, against);
    }
    if (op.type === 'delete_note' && against.type === 'add_note') {
      return this.transformDeleteAgainstAdd(op, against);
    }
    if (op.type === 'add_note' && against.type === 'update_note') {
      return this.transformAddAgainstUpdate(op, against);
    }
    if (op.type === 'update_note' && against.type === 'add_note') {
      return this.transformUpdateAgainstAdd(op, against);
    }
    if (op.type === 'update_note' && against.type === 'delete_note') {
      return this.transformUpdateAgainstDelete(op, against);
    }
    if (op.type === 'delete_note' && against.type === 'update_note') {
      return this.transformDeleteAgainstUpdate(op, against);
    }
    if (op.type === 'update_tempo' && against.type === 'update_tempo') {
      return this.transformTempoAgainstTempo(op, against);
    }
    return op;
  }

  private shouldOpComeBefore(op: Operation, against: Operation): boolean {
    if (op.userId !== against.userId) {
      return op.userId.localeCompare(against.userId) < 0;
    }
    if (op.timestamp !== against.timestamp) {
      return op.timestamp < against.timestamp;
    }
    return op.id.localeCompare(against.id) < 0;
  }

  private transformAddAgainstAdd(op: Operation, against: Operation): Operation {
    if (op.type !== 'add_note' || against.type !== 'add_note') return op;
    if (op.note.id === against.note.id) {
      return op;
    }

    const opStaff = op.note.staff;
    const againstStaff = against.note.staff;
    const opPos = op.note.position;
    const againstPos = against.note.position;

    if (opStaff !== againstStaff) {
      return op;
    }

    if (opPos > againstPos) {
      return {
        ...op,
        note: { ...op.note, position: opPos + 1 }
      };
    }

    if (opPos === againstPos) {
      const opComesFirst = this.shouldOpComeBefore(op, against);
      if (!opComesFirst) {
        return {
          ...op,
          note: { ...op.note, position: opPos + 1 }
        };
      }
    }

    return op;
  }

  private transformDeleteAgainstDelete(op: Operation, against: Operation): Operation {
    if (op.type !== 'delete_note' || against.type !== 'delete_note') return op;
    if (op.noteId === against.noteId) {
      return op;
    }
    return op;
  }

  private transformUpdateAgainstUpdate(op: Operation, against: Operation): Operation {
    if (op.type !== 'update_note' || against.type !== 'update_note') return op;
    if (op.noteId !== against.noteId) return op;
    
    const mergedChanges: Partial<NoteData> = {};
    const opChanges = op.changes as Record<string, unknown>;
    const againstChanges = against.changes as Record<string, unknown>;

    for (const key in opChanges) {
      if (!(key in againstChanges)) {
        (mergedChanges as Record<string, unknown>)[key] = opChanges[key];
      }
    }
    return { ...op, changes: mergedChanges };
  }

  private transformAddAgainstDelete(op: Operation, against: Operation): Operation {
    if (op.type !== 'add_note' || against.type !== 'delete_note') return op;
    return op;
  }

  private transformDeleteAgainstAdd(op: Operation, against: Operation): Operation {
    if (op.type !== 'delete_note' || against.type !== 'add_note') return op;
    return op;
  }

  private transformAddAgainstUpdate(op: Operation, against: Operation): Operation {
    if (op.type !== 'add_note' || against.type !== 'update_note') return op;
    
    const againstChanges = against.changes as Record<string, unknown>;
    if ('position' in againstChanges) {
      const oldPosition = (against as any).oldPosition ?? 0;
      const newPosition = againstChanges.position as number;
      const opStaff = op.note.staff;
      const againstStaff = (against as any).oldStaff ?? 0;
      const opPos = op.note.position;

      if (opStaff === againstStaff) {
        if (oldPosition < newPosition) {
          if (opPos > oldPosition && opPos <= newPosition) {
            return {
              ...op,
              note: { ...op.note, position: opPos - 1 }
            };
          }
        } else if (oldPosition > newPosition) {
          if (opPos >= newPosition && opPos < oldPosition) {
            return {
              ...op,
              note: { ...op.note, position: opPos + 1 }
            };
          }
        }
      }
    }
    
    return op;
  }

  private transformUpdateAgainstAdd(op: Operation, against: Operation): Operation {
    if (op.type !== 'update_note' || against.type !== 'add_note') return op;
    
    const opChanges = op.changes as Record<string, unknown>;
    if ('position' in opChanges) {
      const opPos = opChanges.position as number;
      const againstPos = against.note.position;
      const opStaff = (op as any).oldStaff ?? 0;
      const againstStaff = against.note.staff;

      if (opStaff === againstStaff && opPos > againstPos) {
        return {
          ...op,
          changes: { ...opChanges, position: opPos + 1 }
        };
      }
    }
    
    return op;
  }

  private transformUpdateAgainstDelete(op: Operation, against: Operation): Operation {
    if (op.type !== 'update_note' || against.type !== 'delete_note') return op;
    if (op.noteId === against.noteId) {
      return { ...op, changes: {} } as Operation;
    }
    return op;
  }

  private transformDeleteAgainstUpdate(op: Operation, against: Operation): Operation {
    if (op.type !== 'delete_note' || against.type !== 'update_note') return op;
    return op;
  }

  private transformTempoAgainstTempo(op: Operation, against: Operation): Operation {
    if (op.type !== 'update_tempo' || against.type !== 'update_tempo') return op;
    const opComesFirst = this.shouldOpComeBefore(op, against);
    if (!opComesFirst) {
      return op;
    }
    return {
      ...op,
      oldTempo: against.tempo
    };
  }

  applyOperation(score: ScoreData, op: Operation): ScoreData {
    switch (op.type) {
      case 'add_note': {
        const notes = [...score.notes];
        const insertIndex = notes.findIndex(n => 
          n.staff === op.note.staff && n.position >= op.note.position
        );
        
        const newNotes = notes.map(note => {
          if (note.staff === op.note.staff && note.position >= op.note.position) {
            return { ...note, position: note.position + 1 };
          }
          return note;
        });
        
        if (insertIndex >= 0) {
          newNotes.splice(insertIndex, 0, op.note);
        } else {
          newNotes.push(op.note);
        }
        
        return {
          ...score,
          notes: newNotes,
          version: score.version + 1
        };
      }
      case 'delete_note': {
        const noteToDelete = score.notes.find(n => n.id === op.noteId);
        if (!noteToDelete) {
          return { ...score, version: score.version + 1 };
        }
        
        const newNotes = score.notes
          .filter(note => note.id !== op.noteId)
          .map(note => {
            if (note.staff === noteToDelete.staff && note.position > noteToDelete.position) {
              return { ...note, position: note.position - 1 };
            }
            return note;
          });
        
        return {
          ...score,
          notes: newNotes,
          version: score.version + 1
        };
      }
      case 'update_note': {
        const changes = op.changes as Record<string, unknown>;
        if ('position' in changes) {
          const oldNote = score.notes.find(n => n.id === op.noteId);
          if (!oldNote) {
            return { ...score, version: score.version + 1 };
          }
          
          const oldPosition = oldNote.position;
          const newPosition = changes.position as number;
          const staff = oldNote.staff;
          
          let newNotes = score.notes.map(note => {
            if (note.id === op.noteId) {
              return { ...note, ...op.changes };
            }
            
            if (note.staff === staff) {
              if (oldPosition < newPosition) {
                if (note.position > oldPosition && note.position <= newPosition) {
                  return { ...note, position: note.position - 1 };
                }
              } else if (oldPosition > newPosition) {
                if (note.position >= newPosition && note.position < oldPosition) {
                  return { ...note, position: note.position + 1 };
                }
              }
            }
            return note;
          });
          
          return {
            ...score,
            notes: newNotes,
            version: score.version + 1
          };
        }
        
        return {
          ...score,
          notes: score.notes.map(note => 
            note.id === op.noteId ? { ...note, ...op.changes } : note
          ),
          version: score.version + 1
        };
      }
      case 'update_tempo':
        return {
          ...score,
          tempo: op.tempo,
          version: score.version + 1
        };
      case 'update_staff':
        return {
          ...score,
          staves: score.staves.map(staff =>
            staff.index === op.staffIndex ? { ...staff, ...op.changes } : staff
          ),
          version: score.version + 1
        };
      default:
        return score;
    }
  }

  invertOperation(score: ScoreData, op: Operation): Operation | null {
    switch (op.type) {
      case 'add_note':
        return {
          id: `inv_${op.id}`,
          type: 'delete_note',
          userId: op.userId,
          timestamp: Date.now(),
          version: op.version,
          noteId: op.note.id,
          oldNote: op.note
        } as Operation;
      case 'delete_note':
        if (!op.oldNote) return null;
        return {
          id: `inv_${op.id}`,
          type: 'add_note',
          userId: op.userId,
          timestamp: Date.now(),
          version: op.version,
          note: op.oldNote
        } as Operation;
      case 'update_note':
        const oldNote = score.notes.find(n => n.id === op.noteId);
        if (!oldNote) return null;
        const inverseChanges: Partial<NoteData> = {};
        const opChanges = op.changes as Record<string, unknown>;
        for (const key in opChanges) {
          if (key in oldNote) {
            (inverseChanges as Record<string, unknown>)[key] = (oldNote as Record<string, unknown>)[key];
          }
        }
        return {
          id: `inv_${op.id}`,
          type: 'update_note',
          userId: op.userId,
          timestamp: Date.now(),
          version: op.version,
          noteId: op.noteId,
          changes: inverseChanges
        } as Operation;
      case 'update_tempo':
        if (op.oldTempo === undefined) return null;
        return {
          id: `inv_${op.id}`,
          type: 'update_tempo',
          userId: op.userId,
          timestamp: Date.now(),
          version: op.version,
          tempo: op.oldTempo,
          oldTempo: score.tempo
        } as Operation;
      default:
        return null;
    }
  }
}

export const otService = new OTService();
