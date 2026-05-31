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
}

export const otService = new OTService();
