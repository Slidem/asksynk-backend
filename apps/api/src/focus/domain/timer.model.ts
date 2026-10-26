export const TIMER_STATUSES = [
  "idle",
  "running",
  "paused",
  "completed",
] as const;

export type TimerStatus = (typeof TIMER_STATUSES)[number];

export const TIMER_MODES = ["focus", "short_break", "long_break"] as const;

export type TimerMode = (typeof TIMER_MODES)[number];

export const FOCUS_MODES = ["focus"] as const;

export const BREAK_MODES = ["short_break", "long_break"] as const;

export type BreakMode = (typeof BREAK_MODES)[number];

export const TIMER_COMMANDS = [
  "start",
  "pause",
  "resume",
  "stop",
  "reset",
] as const;

export type TimerCommand = (typeof TIMER_COMMANDS)[number];

/** What changes the timer without a command. */
export const TIMER_TRIGGERS = [
  "timeout",
  "inactivity",
  "settings_changed",
] as const;

export type TimerTrigger = (typeof TIMER_TRIGGERS)[number];

/** Triggers the server applies, in this order, before any command. */
export const TIMER_TRIGGER_ORDER = ["timeout", "inactivity"] as const;

/** Block transitions as recorded in the timer log. */
export const TIMER_TRANSITIONS = [
  "started",
  "paused",
  "resumed",
  "stopped",
  "completed",
  "skipped",
] as const;

export type TimerTransition = (typeof TIMER_TRANSITIONS)[number];

export const SESSION_END_REASONS = [
  "manual_reset",
  "inactivity",
  "settings_changed",
] as const;

export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

/** The settings a session runs with; snapshotted when the session starts. */
export interface TimerSettingsSnapshot {
  focusDurationSeconds: number;
  shortBreakDurationSeconds: number;
  longBreakDurationSeconds: number;
  longBreakInterval: number;
}

export interface TimerCommandInput {
  command: TimerCommand;
  mode?: TimerMode;
}

export interface AllowedCommand {
  command: TimerCommand;
  modes?: TimerMode[];
}

/** All timer settings; the inactivity timeout is read live, never snapshotted. */
export interface TimerSettingsValues extends TimerSettingsSnapshot {
  // null = never auto-reset a session.
  inactivityTimeoutSeconds: number | null;
}

export type UpdateTimerSettingsInput =
  TimerSettingsValues; /** What a rule is matched against. */

export interface TimerState {
  status: TimerStatus;
  hasSession: boolean;
  mode: TimerMode | null;
}
