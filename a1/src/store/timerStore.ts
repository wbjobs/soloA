import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { SavedTag } from "../types/stats";

export type TimerStatus = "idle" | "running" | "paused" | "completed";
export type TimerMode = "work" | "shortBreak" | "longBreak";

interface TimerState {
  status: TimerStatus;
  mode: TimerMode;
  remainingSeconds: number;
  workDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  completedPomodoros: number;
  currentTag: string | null;
  savedTags: SavedTag[];

  setStatus: (status: TimerStatus) => void;
  setMode: (mode: TimerMode) => void;
  setRemainingSeconds: (seconds: number) => void;
  setCurrentTag: (tag: string | null) => void;
  setSavedTags: (tags: SavedTag[]) => void;
  loadSavedTags: () => Promise<void>;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  reset: () => Promise<void>;
  toggle: () => Promise<void>;
  decrementSecond: () => void;
  nextMode: () => void;
  savePomodoro: () => Promise<void>;
}

export const useTimerStore = create<TimerState>((set, get) => ({
  status: "idle",
  mode: "work",
  remainingSeconds: 25 * 60,
  workDuration: 25 * 60,
  shortBreakDuration: 5 * 60,
  longBreakDuration: 15 * 60,
  completedPomodoros: 0,
  currentTag: null,
  savedTags: [],

  setStatus: (status) => set({ status }),
  setMode: (mode) => {
    const durations = {
      work: get().workDuration,
      shortBreak: get().shortBreakDuration,
      longBreak: get().longBreakDuration,
    };
    set({ mode, remainingSeconds: durations[mode], status: "idle" });
  },
  setRemainingSeconds: (seconds) => set({ remainingSeconds: seconds }),
  setCurrentTag: (tag) => set({ currentTag: tag }),
  setSavedTags: (tags) => set({ savedTags: tags }),

  loadSavedTags: async () => {
    try {
      const tags = await invoke<SavedTag[]>("get_saved_tags_data");
      set({ savedTags: tags });
      if (tags.length > 0 && !get().currentTag) {
        set({ currentTag: tags[0].name });
      }
    } catch (e) {
      console.error("Failed to load saved tags:", e);
    }
  },

  start: async () => {
    set({ status: "running" });
    await invoke("start_timer");
  },

  pause: async () => {
    set({ status: "paused" });
    await invoke("pause_timer");
  },

  reset: async () => {
    const { mode, workDuration, shortBreakDuration, longBreakDuration } = get();
    const durations = { work: workDuration, shortBreak: shortBreakDuration, longBreak: longBreakDuration };
    set({ status: "idle", remainingSeconds: durations[mode] });
    await invoke("reset_timer");
  },

  toggle: async () => {
    const { status, start, pause } = get();
    if (status === "running") {
      await pause();
    } else {
      await start();
    }
  },

  decrementSecond: () => {
    const { remainingSeconds, status } = get();
    if (status === "running" && remainingSeconds > 0) {
      set({ remainingSeconds: remainingSeconds - 1 });
    }
    if (remainingSeconds <= 1 && status === "running") {
      set({ status: "completed" });
    }
  },

  nextMode: () => {
    const { mode, completedPomodoros } = get();
    let nextMode: TimerMode;
    let newCompletedCount = completedPomodoros;

    if (mode === "work") {
      newCompletedCount = completedPomodoros + 1;
      nextMode = newCompletedCount % 4 === 0 ? "longBreak" : "shortBreak";
    } else {
      nextMode = "work";
    }

    const durations = {
      work: get().workDuration,
      shortBreak: get().shortBreakDuration,
      longBreak: get().longBreakDuration,
    };

    set({
      mode: nextMode,
      remainingSeconds: durations[nextMode],
      status: "idle",
      completedPomodoros: newCompletedCount,
    });
  },

  savePomodoro: async () => {
    const { mode, workDuration, currentTag } = get();
    if (mode === "work") {
      await invoke("save_pomodoro_record", { 
        duration: workDuration, 
        tag: currentTag 
      });
    }
  },
}));
