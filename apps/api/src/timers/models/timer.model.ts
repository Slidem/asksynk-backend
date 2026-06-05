export type TimerStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "stopped";

export type TimerSessionType = "focus" | "short_break" | "long_break";

export type TimerEventType =
  | "started"
  | "paused"
  | "resumed"
  | "stopped"
  | "completed";

/** Subset of TimerStatus a client may request via PATCH /timers. */
export type TimerTransitionStatus = "running" | "paused" | "stopped";

export interface TransitionTimerInput {
  status: TimerTransitionStatus;
  // Present only when starting a fresh session (status="running").
  sessionType?: TimerSessionType;
  durationSeconds?: number;
}

export interface UpdateTimerSettingsInput {
  focusDurationSeconds: number;
  shortBreakDurationSeconds: number;
  longBreakDurationSeconds: number;
  longBreakInterval: number;
}

/** Payload of a scheduled timer-completion job. Addressing + staleness token only. */
export interface TimerCompletionJob {
  userId: string;
  // ISO timestamp of the transition this job was scheduled for.
  transitionedAt: string;
}

export interface BreakSuggestion {
  suggestedSessionType: "short_break" | "long_break";
  completedFocusSessions: number;
  longBreakInterval: number;
}
