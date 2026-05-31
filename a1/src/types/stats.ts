export interface PomodoroRecord {
  id: number;
  duration: number;
  completed_at: string;
  tag?: string;
}

export interface DailyStats {
  count: number;
  total_seconds: number;
}

export interface TagStats {
  tag: string;
  count: number;
  total_seconds: number;
}

export interface SavedTag {
  id: number;
  name: string;
  color: string;
}
