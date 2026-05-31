import { ScoreData, NoteData } from '../types';

export class MidiParser {
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  parse(midiBuffer: ArrayBuffer): ScoreData {
    const dataView = new DataView(midiBuffer);
    let offset = 0;

    const header = dataView.getUint32(offset, false);
    if (header !== 0x4D546864) {
      throw new Error('无效的 MIDI 文件');
    }
    offset += 4;

    const headerLength = dataView.getUint32(offset, false);
    offset += 4;

    const format = dataView.getUint16(offset, false);
    offset += 2;

    const numTracks = dataView.getUint16(offset, false);
    offset += 2;

    const division = dataView.getUint16(offset, false);
    const ticksPerQuarter = division & 0x7FFF;
    offset += 2;

    const tracks: MidiEvent[][] = [];
    
    for (let i = 0; i < numTracks; i++) {
      const trackEvents = this.parseTrack(dataView, offset);
      tracks.push(trackEvents.events);
      offset = trackEvents.offset;
    }

    return this.convertToScore(tracks, ticksPerQuarter);
  }

  private parseTrack(dataView: DataView, startOffset: number): { events: MidiEvent[]; offset: number } {
    const events: MidiEvent[] = [];
    let offset = startOffset;

    const trackHeader = dataView.getUint32(offset, false);
    if (trackHeader !== 0x4D54726B) {
      throw new Error('无效的 MIDI 轨道');
    }
    offset += 4;

    const trackLength = dataView.getUint32(offset, false);
    offset += 4;

    const endOffset = offset + trackLength;
    let runningStatus: number | null = null;

    while (offset < endOffset) {
      const event = this.parseEvent(dataView, offset, runningStatus);
      if (event.status >= 0x80 && event.status < 0xF0) {
        runningStatus = event.status;
      }
      events.push(event);
      offset = event.nextOffset;
    }

    return { events, offset };
  }

  private parseEvent(dataView: DataView, offset: number, runningStatus: number | null): MidiEvent {
    const deltaTime = this.readVariableLength(dataView, offset);
    let currentOffset = deltaTime.offset;
    
    let status = dataView.getUint8(currentOffset);
    currentOffset++;
    
    if (status < 0x80 && runningStatus !== null) {
      status = runningStatus;
      currentOffset--;
    }

    const event: MidiEvent = {
      deltaTime: deltaTime.value,
      status,
      nextOffset: currentOffset
    };

    const statusType = status & 0xF0;
    const channel = status & 0x0F;

    if (status === 0xFF) {
      const metaType = dataView.getUint8(currentOffset);
      currentOffset++;
      const metaLength = this.readVariableLength(dataView, currentOffset);
      currentOffset = metaLength.offset;

      event.metaType = metaType;
      event.metaData = dataView.buffer.slice(currentOffset, currentOffset + metaLength.value);
      event.nextOffset = currentOffset + metaLength.value;
      
      return event;
    }

    if (statusType === 0x80 || statusType === 0x90) {
      event.note = dataView.getUint8(currentOffset);
      currentOffset++;
      event.velocity = dataView.getUint8(currentOffset);
      currentOffset++;
      event.channel = channel;
    } else if (statusType === 0xA0 || statusType === 0xB0 || statusType === 0xE0) {
      currentOffset += 2;
    } else if (statusType === 0xC0 || statusType === 0xD0) {
      currentOffset += 1;
    } else if (status === 0xF0 || status === 0xF7) {
      const sysExLength = this.readVariableLength(dataView, currentOffset);
      currentOffset = sysExLength.offset + sysExLength.value;
    }

    event.nextOffset = currentOffset;
    return event;
  }

  private readVariableLength(dataView: DataView, offset: number): { value: number; offset: number } {
    let value = 0;
    let currentOffset = offset;
    
    while (true) {
      const byte = dataView.getUint8(currentOffset);
      currentOffset++;
      value = (value << 7) | (byte & 0x7F);
      
      if ((byte & 0x80) === 0) {
        break;
      }
    }
    
    return { value, offset: currentOffset };
  }

  private convertToScore(tracks: MidiEvent[][], ticksPerQuarter: number): ScoreData {
    const notes: NoteData[] = [];
    let tempo = 120;

    const track = tracks.length > 1 ? tracks[1] : tracks[0];
    let absoluteTime = 0;
    const activeNotes = new Map<number, { startTime: number; pitch: number; velocity: number }>();

    for (const event of track) {
      absoluteTime += event.deltaTime;

      if (event.status === 0xFF && event.metaType === 0x51) {
        const metaData = new DataView(event.metaData!);
        const microsecondsPerQuarter = (metaData.getUint8(0) << 16) | 
                                         (metaData.getUint8(1) << 8) | 
                                         metaData.getUint8(2);
        tempo = Math.round(60000000 / microsecondsPerQuarter);
      }

      if (event.status >= 0x90 && event.status < 0xA0 && event.velocity! > 0) {
        activeNotes.set(event.note!, {
          startTime: absoluteTime,
          pitch: event.note!,
          velocity: event.velocity!
        });
      }

      if ((event.status >= 0x80 && event.status < 0x90) || 
          (event.status >= 0x90 && event.status < 0xA0 && event.velocity! === 0)) {
        const activeNote = activeNotes.get(event.note!);
        if (activeNote) {
          const durationTicks = absoluteTime - activeNote.startTime;
          const position = activeNote.startTime / ticksPerQuarter;
          
          notes.push({
            id: this.generateId(),
            ...this.midiNoteToPitch(activeNote.pitch),
            duration: this.ticksToDuration(durationTicks, ticksPerQuarter),
            position,
            staff: 0
          });
          
          activeNotes.delete(event.note!);
        }
      }
    }

    notes.sort((a, b) => a.position - b.position);

    return {
      title: '导入的乐谱',
      staves: [
        { index: 0, clef: 'treble', key: 'C', timeSignature: '4/4' }
      ],
      notes,
      tempo,
      version: 0
    };
  }

  private midiNoteToPitch(midiNote: number): { pitch: string; octave: number } {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midiNote / 12) - 1;
    const noteIndex = midiNote % 12;
    return {
      pitch: notes[noteIndex],
      octave
    };
  }

  private ticksToDuration(ticks: number, ticksPerQuarter: number): string {
    const ratio = ticks / ticksPerQuarter;
    
    if (ratio >= 3.5) return 'w';
    if (ratio >= 1.75) return 'h';
    if (ratio >= 0.875) return 'q';
    if (ratio >= 0.4375) return '8';
    if (ratio >= 0.21875) return '16';
    return '32';
  }

  exportToMidi(score: ScoreData): Blob {
    const events: MidiEvent[] = [];
    const sortedNotes = [...score.notes].sort((a, b) => a.position - b.position);
    
    const ticksPerQuarter = 480;
    let currentTime = 0;

    events.push({
      deltaTime: 0,
      status: 0xFF,
      metaType: 0x51,
      metaData: this.createTempoMetaEvent(score.tempo),
      nextOffset: 0
    });

    const noteOnTimes = new Map<string, number>();
    
    for (const note of sortedNotes) {
      const notePosition = note.position * ticksPerQuarter;
      const delay = notePosition - currentTime;
      
      if (delay > 0) {
        const noteOffEvents: MidiEvent[] = [];
        for (const [noteId, onTime] of noteOnTimes) {
          if (onTime + this.durationToTicks(score.notes.find(n => n.id === noteId)!.duration, ticksPerQuarter) <= notePosition) {
            const noteData = score.notes.find(n => n.id === noteId)!;
            const midiNote = this.pitchToMidiNote(noteData);
            const noteOffDelay = onTime + this.durationToTicks(noteData.duration, ticksPerQuarter) - currentTime;
            
            noteOffEvents.push({
              deltaTime: noteOffDelay,
              status: 0x80,
              note: midiNote,
              velocity: 0,
              channel: 0,
              nextOffset: 0
            });
            
            noteOnTimes.delete(noteId);
            currentTime += noteOffDelay;
          }
        }
        
        noteOffEvents.sort((a, b) => a.deltaTime - b.deltaTime);
        for (const offEvent of noteOffEvents) {
          events.push(offEvent);
        }
      }

      const actualDelay = notePosition - currentTime;
      
      const midiNote = this.pitchToMidiNote(note);
      events.push({
        deltaTime: actualDelay,
        status: 0x90,
        note: midiNote,
        velocity: 64,
        channel: 0,
        nextOffset: 0
      });
      
      noteOnTimes.set(note.id, notePosition);
      currentTime = notePosition;
    }

    for (const [noteId, onTime] of noteOnTimes) {
      const noteData = score.notes.find(n => n.id === noteId)!;
      const noteOffDelay = onTime + this.durationToTicks(noteData.duration, ticksPerQuarter) - currentTime;
      
      const midiNote = this.pitchToMidiNote(noteData);
      events.push({
        deltaTime: noteOffDelay,
        status: 0x80,
        note: midiNote,
        velocity: 0,
        channel: 0,
        nextOffset: 0
      });
      
      currentTime += noteOffDelay;
    }

    events.push({
      deltaTime: 0,
      status: 0xFF,
      metaType: 0x2F,
      metaData: new ArrayBuffer(0),
      nextOffset: 0
    });

    const trackBytes: number[] = [];
    
    for (const event of events) {
      this.writeVariableLength(trackBytes, event.deltaTime);
      
      if (event.status === 0xFF) {
        trackBytes.push(0xFF);
        trackBytes.push(event.metaType!);
        this.writeVariableLength(trackBytes, event.metaData!.byteLength);
        
        const metaView = new Uint8Array(event.metaData!);
        for (let i = 0; i < metaView.length; i++) {
          trackBytes.push(metaView[i]);
        }
      } else {
        trackBytes.push(event.status);
        if (event.note !== undefined) {
          trackBytes.push(event.note);
          trackBytes.push(event.velocity!);
        }
      }
    }

    const fileBytes: number[] = [];
    
    fileBytes.push(0x4D, 0x54, 0x68, 0x64);
    fileBytes.push(0x00, 0x00, 0x00, 0x06);
    fileBytes.push(0x00, 0x00);
    fileBytes.push(0x00, 0x01);
    fileBytes.push((ticksPerQuarter >> 8) & 0xFF, ticksPerQuarter & 0xFF);
    
    fileBytes.push(0x4D, 0x54, 0x72, 0x6B);
    fileBytes.push((trackBytes.length >> 24) & 0xFF);
    fileBytes.push((trackBytes.length >> 16) & 0xFF);
    fileBytes.push((trackBytes.length >> 8) & 0xFF);
    fileBytes.push(trackBytes.length & 0xFF);
    
    for (const byte of trackBytes) {
      fileBytes.push(byte);
    }

    return new Blob([new Uint8Array(fileBytes)], { type: 'audio/midi' });
  }

  private createTempoMetaEvent(tempo: number): ArrayBuffer {
    const microsecondsPerQuarter = Math.round(60000000 / tempo);
    const buffer = new ArrayBuffer(3);
    const view = new DataView(buffer);
    
    view.setUint8(0, (microsecondsPerQuarter >> 16) & 0xFF);
    view.setUint8(1, (microsecondsPerQuarter >> 8) & 0xFF);
    view.setUint8(2, microsecondsPerQuarter & 0xFF);
    
    return buffer;
  }

  private writeVariableLength(bytes: number[], value: number) {
    if (value === 0) {
      bytes.push(0);
      return;
    }
    
    const buffer: number[] = [];
    while (value > 0) {
      buffer.push(value & 0x7F);
      value >>= 7;
    }
    
    for (let i = buffer.length - 1; i >= 0; i--) {
      if (i > 0) {
        bytes.push(buffer[i] | 0x80);
      } else {
        bytes.push(buffer[i]);
      }
    }
  }

  private durationToTicks(duration: string, ticksPerQuarter: number): number {
    const durationMap: Record<string, number> = {
      'w': ticksPerQuarter * 4,
      'h': ticksPerQuarter * 2,
      'q': ticksPerQuarter,
      '8': ticksPerQuarter / 2,
      '16': ticksPerQuarter / 4,
      '32': ticksPerQuarter / 8
    };
    return durationMap[duration] || ticksPerQuarter;
  }

  private pitchToMidiNote(note: NoteData): number {
    const pitchMap: Record<string, number> = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
      'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    };
    
    const pitch = pitchMap[note.pitch];
    if (pitch === undefined) return 60;
    
    return 12 * (note.octave + 1) + pitch;
  }
}

interface MidiEvent {
  deltaTime: number;
  status: number;
  nextOffset: number;
  note?: number;
  velocity?: number;
  channel?: number;
  metaType?: number;
  metaData?: ArrayBuffer;
}

export const midiParser = new MidiParser();
