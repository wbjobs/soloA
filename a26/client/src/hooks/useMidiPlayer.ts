import { useState, useCallback, useRef, useEffect } from 'react';
import { NoteData, ScoreData } from '../types';
import { noteToMidi, getDurationInBeats, getNotesByStaff, sortNotesByPosition } from '../utils/scoreSerialization';

interface UseMidiPlayerOptions {
  score: ScoreData;
}

interface MidiPlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  currentNoteIndex: number;
  tempo: number;
  volume: number;
}

const BASE_FREQUENCY = 440;

function midiToFrequency(midi: number): number {
  return BASE_FREQUENCY * Math.pow(2, (midi - 69) / 12);
}

interface ActiveNote {
  midi: number;
  osc: OscillatorNode;
  gain: GainNode;
  endTime: number;
}

interface ScheduledNote {
  note: NoteData;
  startTime: number;
  duration: number;
  nextNoteMidi: number | null;
}

export function useMidiPlayer(options: UseMidiPlayerOptions) {
  const { score } = options;

  const [state, setState] = useState<MidiPlayerState>({
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    currentNoteIndex: 0,
    tempo: score.tempo || 120,
    volume: 0.5
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const activeNotesRef = useRef<Map<number, ActiveNote>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const scheduleRef = useRef<ScheduledNote[]>([]);

  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.connect(audioContextRef.current.destination);
      masterGainRef.current.gain.value = state.volume;
      return;
    }
    
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  }, [state.volume]);

  const playNoteWithLegato = useCallback((
    midi: number, 
    startTime: number, 
    duration: number, 
    nextMidi: number | null
  ) => {
    const audioCtx = audioContextRef.current;
    const masterGain = masterGainRef.current;
    
    if (!audioCtx || !masterGain) return;

    const frequency = midiToFrequency(midi);
    const isTied = nextMidi !== null && nextMidi === midi;
    
    const existingNote = activeNotesRef.current.get(midi);
    
    if (existingNote && isTied) {
      existingNote.gain.gain.cancelScheduledValues(startTime);
      existingNote.gain.gain.setValueAtTime(0.25, startTime);
      existingNote.gain.gain.setValueAtTime(0.25, startTime + duration - 0.05);
      existingNote.gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      
      try {
        existingNote.osc.stop(existingNote.endTime);
      } catch (e) {}
      
      existingNote.osc.stop(startTime + duration + 0.1);
      existingNote.endTime = startTime + duration;
      return;
    }
    
    if (existingNote) {
      try {
        existingNote.osc.stop();
      } catch (e) {}
      activeNotesRef.current.delete(midi);
    }
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startTime);

    const attackTime = isTied ? 0.001 : 0.03;
    const releaseTime = isTied ? 0.001 : 0.1;
    const sustainLevel = 0.25;
    const overlapTime = isTied ? 0.02 : 0.01;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(sustainLevel, startTime + attackTime);
    gain.gain.setValueAtTime(sustainLevel, startTime + duration - releaseTime - overlapTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);

    const activeNote: ActiveNote = {
      midi,
      osc,
      gain,
      endTime: startTime + duration
    };
    
    activeNotesRef.current.set(midi, activeNote);

    osc.onended = () => {
      activeNotesRef.current.delete(midi);
    };
  }, []);

  const buildSchedule = useCallback(() => {
    const scheduled: ScheduledNote[] = [];
    const beatsPerSecond = state.tempo / 60;
    
    for (const staff of score.staves) {
      const staffNotes = sortNotesByPosition(getNotesByStaff(score, staff.index));
      
      for (let i = 0; i < staffNotes.length; i++) {
        const note = staffNotes[i];
        const nextNote = i < staffNotes.length - 1 ? staffNotes[i + 1] : null;
        
        let startTime = 0;
        for (let j = 0; j < i; j++) {
          startTime += getDurationInBeats(staffNotes[j].duration) / beatsPerSecond;
        }
        
        const duration = getDurationInBeats(note.duration) / beatsPerSecond;
        
        const nextNoteMidi = nextNote ? noteToMidi(nextNote) : null;
        
        scheduled.push({
          note,
          startTime: startTime + staff.index * 0.02,
          duration,
          nextNoteMidi
        });
      }
    }
    
    return scheduled.sort((a, b) => a.startTime - b.startTime);
  }, [score, state.tempo]);

  const getTotalDuration = useCallback(() => {
    if (score.notes.length === 0) return 0;
    
    const beatsPerSecond = state.tempo / 60;
    let maxDuration = 0;
    
    for (const staff of score.staves) {
      const staffNotes = sortNotesByPosition(getNotesByStaff(score, staff.index));
      let totalBeats = 0;
      for (const note of staffNotes) {
        totalBeats += getDurationInBeats(note.duration);
      }
      const staffDuration = totalBeats / beatsPerSecond;
      if (staffDuration > maxDuration) {
        maxDuration = staffDuration;
      }
    }
    
    return maxDuration;
  }, [score, state.tempo]);

  const play = useCallback(() => {
    initAudio();
    
    const audioCtx = audioContextRef.current;
    if (!audioCtx) return;

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const schedule = buildSchedule();
    scheduleRef.current = schedule;

    if (schedule.length === 0) return;

    const contextStartTime = audioCtx.currentTime + 0.1;
    startTimeRef.current = audioCtx.currentTime;

    for (const scheduled of schedule) {
      playNoteWithLegato(
        noteToMidi(scheduled.note),
        contextStartTime + scheduled.startTime,
        scheduled.duration,
        scheduled.nextNoteMidi
      );
    }

    setState(prev => ({
      ...prev,
      isPlaying: true,
      isPaused: false
    }));

    const totalDuration = getTotalDuration();
    
    const updateProgress = () => {
      if (!audioContextRef.current) return;
      
      const elapsed = audioContextRef.current.currentTime - startTimeRef.current + pausedTimeRef.current;
      
      if (elapsed >= totalDuration) {
        setState(prev => ({
          ...prev,
          isPlaying: false,
          isPaused: false,
          currentTime: 0,
          currentNoteIndex: 0
        }));
        pausedTimeRef.current = 0;
        return;
      }

      let noteIndex = 0;
      for (let i = 0; i < schedule.length; i++) {
        if (elapsed >= schedule[i].startTime) {
          noteIndex = i;
        }
      }

      setState(prev => ({
        ...prev,
        currentTime: elapsed,
        currentNoteIndex: noteIndex
      }));

      animationFrameRef.current = requestAnimationFrame(updateProgress);
    };

    animationFrameRef.current = requestAnimationFrame(updateProgress);
  }, [initAudio, buildSchedule, playNoteWithLegato, getTotalDuration]);

  const pause = useCallback(() => {
    if (!audioContextRef.current || !state.isPlaying) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const audioCtx = audioContextRef.current;
    const now = audioCtx.currentTime;

    for (const activeNote of activeNotesRef.current.values()) {
      try {
        activeNote.gain.gain.cancelScheduledValues(now);
        const currentValue = activeNote.gain.gain.value;
        activeNote.gain.gain.setValueAtTime(currentValue, now);
        activeNote.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
        activeNote.osc.stop(now + 0.15);
      } catch (e) {}
    }
    activeNotesRef.current.clear();

    pausedTimeRef.current = state.currentTime;

    setState(prev => ({
      ...prev,
      isPlaying: false,
      isPaused: true
    }));
  }, [state.isPlaying, state.currentTime]);

  const stop = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const audioCtx = audioContextRef.current;
    if (audioCtx) {
      const now = audioCtx.currentTime;
      for (const activeNote of activeNotesRef.current.values()) {
        try {
          activeNote.gain.gain.cancelScheduledValues(now);
          activeNote.gain.gain.setValueAtTime(activeNote.gain.gain.value, now);
          activeNote.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
          activeNote.osc.stop(now + 0.1);
        } catch (e) {}
      }
    }
    activeNotesRef.current.clear();

    pausedTimeRef.current = 0;

    setState(prev => ({
      ...prev,
      isPlaying: false,
      isPaused: false,
      currentTime: 0,
      currentNoteIndex: 0
    }));
  }, []);

  const setTempo = useCallback((tempo: number) => {
    const clamped = Math.min(240, Math.max(40, tempo));
    setState(prev => ({ ...prev, tempo: clamped }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clamped = Math.min(1, Math.max(0, volume));
    setState(prev => ({ ...prev, volume: clamped }));
    
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = clamped;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      for (const { osc } of activeNotesRef.current.values()) {
        try {
          osc.stop();
        } catch (e) {}
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    ...state,
    play,
    pause,
    stop,
    setTempo,
    setVolume,
    totalDuration: getTotalDuration()
  };
}
