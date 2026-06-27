export const TIMER_STATUSES = [
  "idle",
  "running",
  "paused",
  "completed",
  "stopped",
] as const;
export type TimerStatus = (typeof TIMER_STATUSES)[number];

export const TIMER_SESSION_TYPES = [
  "focus",
  "short_break",
  "long_break",
] as const;
export type TimerSessionType = (typeof TIMER_SESSION_TYPES)[number];

export type TimerEventType =
  | "started"
  | "paused"
  | "resumed"
  | "stopped"
  | "completed";

/** Subset of TimerStatus a client may request via PATCH /timers. */
export const TIMER_TRANSITION_STATUSES = [
  "running",
  "paused",
  "stopped",
] as const;
export type TimerTransitionStatus = (typeof TIMER_TRANSITION_STATUSES)[number];

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
