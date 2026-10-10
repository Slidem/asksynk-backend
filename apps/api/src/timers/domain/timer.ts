import {
  TimerSessionType,
  TimerStatus,
  TransitionTimerInput,
} from "@/api/timers/models/timer.model";
import { timersError } from "@/api/timers/timers.errors";

export interface TimerProps {
  id: string;
  userId: string;
  status: TimerStatus;
  sessionType: TimerSessionType | null;
  sessionDurationSeconds: number | null;
  transitionedAt: Date | null;
  remainingAtTransition: number | null;
  completedFocusSessions: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TimerSession {
  sessionType: TimerSessionType;
  durationSeconds: number;
}

// What a legal transition decided; the service persists, publishes and (re)schedules it.
export type TimerStarted = {
  type: "started";
  session: TimerSession;
  resetFocusCounter: boolean;
  // Direct switch from a running session: it completes first.
  completesCurrent: boolean;
};
export type TimerPaused = { type: "paused"; remainingSeconds: number };
export type TimerResumed = { type: "resumed" };
export type TimerStopped = { type: "stopped"; remainingSeconds: number };
export type TimerCompleted = { type: "completed"; transitionedAt: Date };
export type TimerTransition =
  | TimerStarted
  | TimerPaused
  | TimerResumed
  | TimerStopped
  | TimerCompleted;

export class Timer {
  readonly id: string;
  readonly userId: string;
  readonly status: TimerStatus;
  readonly sessionType: TimerSessionType | null;
  readonly sessionDurationSeconds: number | null;
  readonly transitionedAt: Date | null;
  readonly remainingAtTransition: number | null;
  readonly completedFocusSessions: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: TimerProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.status = props.status;
    this.sessionType = props.sessionType;
    this.sessionDurationSeconds = props.sessionDurationSeconds;
    this.transitionedAt = props.transitionedAt;
    this.remainingAtTransition = props.remainingAtTransition;
    this.completedFocusSessions = props.completedFocusSessions;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: TimerProps): Timer {
    return new Timer(props);
  }

  /** Legal from any state. */
  start(session: TimerSession): TimerStarted {
    return {
      type: "started",
      session,
      resetFocusCounter: session.sessionType === "long_break",
      completesCurrent: this.status === "running",
    };
  }

  /** Past due → completes instead of leaving a "paused at 0" zombie. */
  pause(now: Date): TimerPaused | TimerCompleted {
    if (this.status !== "running") {
      throw timersError("timer_not_running");
    }
    const remainingSeconds = this.remainingSeconds(now) ?? 0;
    if (remainingSeconds <= 0) {
      return this.complete();
    }
    return { type: "paused", remainingSeconds };
  }

  resume(): TimerResumed {
    if (this.status !== "paused") {
      throw timersError("timer_not_paused");
    }
    return { type: "resumed" };
  }

  stop(now: Date): TimerStopped {
    if (this.status !== "running" && this.status !== "paused") {
      throw timersError("no_active_timer");
    }
    return { type: "stopped", remainingSeconds: this.remainingSeconds(now) ?? 0 };
  }

  complete(): TimerCompleted {
    if (this.status !== "running" || this.transitionedAt === null) {
      throw timersError("timer_not_running");
    }
    return { type: "completed", transitionedAt: this.transitionedAt };
  }

  /** Absolute time the running session completes; null unless running. */
  completesAt(): Date | null {
    if (
      this.status !== "running" ||
      this.transitionedAt === null ||
      this.remainingAtTransition === null
    ) {
      return null;
    }
    return new Date(
      this.transitionedAt.getTime() + this.remainingAtTransition * 1000,
    );
  }

  /** Live remaining seconds. Derived for running; frozen value otherwise; null when idle. */
  remainingSeconds(now: Date): number | null {
    if (this.remainingAtTransition === null) return null;
    if (this.status !== "running" || this.transitionedAt === null) {
      return this.remainingAtTransition;
    }
    const elapsed = Math.floor(
      (now.getTime() - this.transitionedAt.getTime()) / 1000,
    );
    return Math.max(0, this.remainingAtTransition - elapsed);
  }

  /** True when a running session has reached/passed its completion time. */
  isDue(now: Date): boolean {
    const completesAt = this.completesAt();
    return completesAt !== null && now.getTime() >= completesAt.getTime();
  }
}

export function assertValidTransitionInput(input: TransitionTimerInput): void {
  const hasSessionType = input.sessionType != null;
  const hasDuration = input.durationSeconds != null;
  if (hasSessionType !== hasDuration) {
    throw timersError("invalid_session_input", {
      reason: "sessionType and durationSeconds must be provided together",
    });
  }
  if (hasSessionType && input.status !== "running") {
    throw timersError("invalid_session_input", {
      reason: "session fields are only valid when starting (status=running)",
    });
  }
}
