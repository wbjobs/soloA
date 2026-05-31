import { ScoreData, NoteData, StaffData } from '../types';

export class MusicXMLParser {
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  parse(xmlString: string): ScoreData {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    
    const title = this.extractTitle(xmlDoc);
    const staves = this.extractStaves(xmlDoc);
    const notes = this.extractNotes(xmlDoc, staves);
    const tempo = this.extractTempo(xmlDoc);

    return {
      title,
      staves,
      notes,
      tempo,
      version: 0
    };
  }

  private extractTitle(xmlDoc: Document): string {
    const workTitle = xmlDoc.querySelector('work work-title');
    if (workTitle?.textContent) {
      return workTitle.textContent;
    }
    
    const movementTitle = xmlDoc.querySelector('movement-title');
    if (movementTitle?.textContent) {
      return movementTitle.textContent;
    }
    
    return '导入的乐谱';
  }

  private extractStaves(xmlDoc: Document): StaffData[] {
    const staves: StaffData[] = [];
    const scoreParts = xmlDoc.querySelectorAll('score-part');
    
    scoreParts.forEach((part, index) => {
      const clef = this.extractClef(xmlDoc, index);
      const key = this.extractKey(xmlDoc, index);
      const timeSignature = this.extractTimeSignature(xmlDoc, index);
      
      staves.push({
        index,
        clef,
        key,
        timeSignature
      });
    });

    if (staves.length === 0) {
      staves.push({
        index: 0,
        clef: 'treble',
        key: 'C',
        timeSignature: '4/4'
      });
    }

    return staves;
  }

  private extractClef(xmlDoc: Document, staffIndex: number): 'treble' | 'bass' {
    const parts = xmlDoc.querySelectorAll('part');
    const part = parts[staffIndex] || parts[0];
    
    if (part) {
      const clefSign = part.querySelector('attributes clef sign');
      if (clefSign?.textContent) {
        return clefSign.textContent.toLowerCase() === 'bass' ? 'bass' : 'treble';
      }
    }
    
    return 'treble';
  }

  private extractKey(xmlDoc: Document, staffIndex: number): string {
    const parts = xmlDoc.querySelectorAll('part');
    const part = parts[staffIndex] || parts[0];
    
    if (part) {
      const fifths = part.querySelector('attributes key fifths');
      if (fifths?.textContent) {
        const keyMap: Record<string, string> = {
          '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F',
          '0': 'C',
          '1': 'G', '2': 'D', '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#'
        };
        return keyMap[fifths.textContent] || 'C';
      }
    }
    
    return 'C';
  }

  private extractTimeSignature(xmlDoc: Document, staffIndex: number): string {
    const parts = xmlDoc.querySelectorAll('part');
    const part = parts[staffIndex] || parts[0];
    
    if (part) {
      const beats = part.querySelector('attributes time beats');
      const beatType = part.querySelector('attributes time beat-type');
      
      if (beats?.textContent && beatType?.textContent) {
        return `${beats.textContent}/${beatType.textContent}`;
      }
    }
    
    return '4/4';
  }

  private extractTempo(xmlDoc: Document): number {
    const tempoMark = xmlDoc.querySelector('direction sound[tempo]');
    if (tempoMark) {
      const tempo = tempoMark.getAttribute('tempo');
      if (tempo) {
        return parseInt(tempo, 10);
      }
    }
    
    return 120;
  }

  private extractNotes(xmlDoc: Document, staves: StaffData[]): NoteData[] {
    const notes: NoteData[] = [];
    const parts = xmlDoc.querySelectorAll('part');
    
    parts.forEach((part, staffIndex) => {
      if (staffIndex >= staves.length) return;
      
      const measures = part.querySelectorAll('measure');
      let currentPosition = 0;
      
      measures.forEach(measure => {
        const measureNotes = measure.querySelectorAll('note');
        
        measureNotes.forEach(noteElement => {
          if (noteElement.querySelector('rest')) {
            const duration = this.extractDuration(noteElement);
            currentPosition += duration;
            return;
          }
          
          const note = this.parseNoteElement(noteElement, staffIndex, currentPosition);
          if (note) {
            notes.push(note);
          }
          
          const duration = this.extractDuration(noteElement);
          if (!noteElement.querySelector('chord')) {
            currentPosition += duration;
          }
        });
      });
    });

    return notes;
  }

  private parseNoteElement(noteElement: Element, staffIndex: number, position: number): NoteData | null {
    const pitch = noteElement.querySelector('pitch');
    if (!pitch) return null;
    
    const step = pitch.querySelector('step')?.textContent || 'C';
    const alter = pitch.querySelector('alter')?.textContent;
    const octave = parseInt(pitch.querySelector('octave')?.textContent || '4', 10);
    
    let actualPitch = step;
    if (alter === '1') actualPitch += '#';
    else if (alter === '-1') actualPitch += 'b';
    
    const duration = this.convertDuration(noteElement);
    
    return {
      id: this.generateId(),
      pitch: actualPitch,
      octave,
      duration,
      position,
      staff: staffIndex
    };
  }

  private extractDuration(noteElement: Element): number {
    const type = noteElement.querySelector('type')?.textContent;
    
    const durationMap: Record<string, number> = {
      'whole': 4,
      'half': 2,
      'quarter': 1,
      'eighth': 0.5,
      'sixteenth': 0.25,
      'thirty-second': 0.125
    };
    
    return durationMap[type || 'quarter'] || 1;
  }

  private convertDuration(noteElement: Element): string {
    const type = noteElement.querySelector('type')?.textContent;
    
    const durationMap: Record<string, string> = {
      'whole': 'w',
      'half': 'h',
      'quarter': 'q',
      'eighth': '8',
      'sixteenth': '16',
      'thirty-second': '32'
    };
    
    return durationMap[type || 'quarter'] || 'q';
  }

  exportToXML(score: ScoreData): string {
    const xmlParts: string[] = [];
    
    xmlParts.push('<?xml version="1.0" encoding="UTF-8"?>');
    xmlParts.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
    xmlParts.push('<score-partwise version="4.0">');
    
    xmlParts.push(this.generateWorkInfo(score.title));
    xmlParts.push(this.generatePartList(score.staves));
    xmlParts.push(this.generateParts(score));
    
    xmlParts.push('</score-partwise>');
    
    return xmlParts.join('\n');
  }

  private generateWorkInfo(title: string): string {
    return `  <work>
    <work-title>${this.escapeXml(title)}</work-title>
  </work>`;
  }

  private generatePartList(staves: StaffData[]): string {
    const parts: string[] = ['  <part-list>'];
    
    staves.forEach((staff, index) => {
      parts.push(`    <score-part id="P${index + 1}">
      <part-name>${staff.clef === 'bass' ? 'Bass' : 'Treble'}</part-name>
      <part-abbreviation>${staff.clef === 'bass' ? 'B.' : 'T.'}</part-abbreviation>
      <score-instrument id="P${index + 1}-I${index + 1}">
        <instrument-name>Keyboard</instrument-name>
      </score-instrument>
    </score-part>`);
    });
    
    parts.push('  </part-list>');
    return parts.join('\n');
  }

  private generateParts(score: ScoreData): string {
    const parts: string[] = [];
    
    score.staves.forEach((staff, staffIndex) => {
      const notes = score.notes.filter(n => n.staff === staffIndex);
      
      parts.push(`  <part id="P${staffIndex + 1}">`);
      parts.push(this.generateMeasure(staff, notes));
      parts.push('  </part>');
    });
    
    return parts.join('\n');
  }

  private generateMeasure(staff: StaffData, notes: NoteData[]): string {
    const clefSign = staff.clef === 'bass' ? 'F' : 'G';
    const clefLine = staff.clef === 'bass' ? '4' : '2';
    const timeSig = staff.timeSignature.split('/');
    const fifths = this.getKeyFifths(staff.key);
    
    const measure: string[] = [
      '    <measure number="1">',
      '      <attributes>',
      '        <divisions>4</divisions>',
      `        <key><fifths>${fifths}</fifths></key>`,
      `        <time><beats>${timeSig[0]}</beats><beat-type>${timeSig[1] || '4'}</beat-type></time>`,
      `        <clef><sign>${clefSign}</sign><line>${clefLine}</line></clef>`,
      '      </attributes>'
    ];

    const sortedNotes = [...notes].sort((a, b) => a.position - b.position);
    
    sortedNotes.forEach(note => {
      measure.push(this.generateNoteXML(note));
    });
    
    measure.push('    </measure>');
    return measure.join('\n');
  }

  private getKeyFifths(key: string): number {
    const keyMap: Record<string, number> = {
      'Cb': -7, 'Gb': -6, 'Db': -5, 'Ab': -4, 'Eb': -3, 'Bb': -2, 'F': -1,
      'C': 0,
      'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7
    };
    return keyMap[key] ?? 0;
  }

  private generateNoteXML(note: NoteData): string {
    const pitch = this.normalizePitch(note.pitch);
    const alter = this.getAlterValue(note.pitch);
    const duration = this.getXMLDuration(note.duration);
    const type = this.getXMLType(note.duration);
    
    let pitchElement = `<step>${pitch.step}</step>`;
    if (alter !== 0) {
      pitchElement += `<alter>${alter}</alter>`;
    }
    pitchElement += `<octave>${note.octave}</octave>`;
    
    return `      <note>
        <pitch>
          ${pitchElement}
        </pitch>
        <duration>${duration}</duration>
        <type>${type}</type>
      </note>`;
  }

  private normalizePitch(pitch: string): { step: string; alter: number } {
    const match = pitch.match(/^([A-G])(#|b)?$/);
    if (match) {
      return {
        step: match[1],
        alter: match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0
      };
    }
    return { step: 'C', alter: 0 };
  }

  private getAlterValue(pitch: string): number {
    if (pitch.includes('#')) return 1;
    if (pitch.includes('b')) return -1;
    return 0;
  }

  private getXMLDuration(duration: string): number {
    const durationMap: Record<string, number> = {
      'w': 16,
      'h': 8,
      'q': 4,
      '8': 2,
      '16': 1,
      '32': 0.5
    };
    return durationMap[duration] || 4;
  }

  private getXMLType(duration: string): string {
    const typeMap: Record<string, string> = {
      'w': 'whole',
      'h': 'half',
      'q': 'quarter',
      '8': 'eighth',
      '16': 'sixteenth',
      '32': 'thirty-second'
    };
    return typeMap[duration] || 'quarter';
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

export const musicxmlParser = new MusicXMLParser();
