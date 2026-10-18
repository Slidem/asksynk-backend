import {
  SessionEndReason,
  TimerMode,
  TimerTransition,
} from "@/api/focus/domain/timer.model";

/** A block changed state; one timer-log row each. */
export type TimerTransitioned = {
  type: "timer_transitioned";
  transition: TimerTransition;
  userId: string;
  sessionId: string;
  mode: TimerMode;
  durationSeconds: number;
  remainingSeconds: number;
  // Set when a reset abandoned the block; null = the user's own action.
  reason: SessionEndReason | null;
  occurredAt: Date;
};

export type FocusSessionEnded = {
  type: "focus_session_ended";
  userId: string;
  sessionId: string;
  reason: SessionEndReason;
  finishedAt: Date;
};

export type TimerEvent = TimerTransitioned | FocusSessionEnded;
