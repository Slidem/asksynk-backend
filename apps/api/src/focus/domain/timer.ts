import { TimerTransitioned } from "@/api/focus/domain/timer.events";
import {
  TimerSessionType,
  TimerStatus,
  TimerTransition,
  TransitionTimerInput,
} from "@/api/focus/domain/timer.model";
import { timersError } from "@/api/focus/focus.errors";
import { AggregateRoot } from "@/api/kernel/domain/aggregate-root";

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

export class Timer extends AggregateRoot<TimerTransitioned> {
  private constructor(
    private readonly props: TimerProps,
    version: number,
  ) {
    super(version);
  }

  static rehydrate(props: TimerProps, version: number): Timer {
    return new Timer({ ...props }, version);
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get status(): TimerStatus {
    return this.props.status;
  }
  get sessionType(): TimerSessionType | null {
    return this.props.sessionType;
  }
  get sessionDurationSeconds(): number | null {
    return this.props.sessionDurationSeconds;
  }
  get transitionedAt(): Date | null {
    return this.props.transitionedAt;
  }
  get remainingAtTransition(): number | null {
    return this.props.remainingAtTransition;
  }
  get completedFocusSessions(): number {
    return this.props.completedFocusSessions;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Legal from any state. A running session completes first (counts toward the cadence). */
  start(session: TimerSession, now: Date): void {
    if (this.props.status === "running") {
      this.complete(now);
    }
    if (session.sessionType === "long_break") {
      this.props.completedFocusSessions = 0;
    }
    this.props.status = "running";
    this.props.sessionType = session.sessionType;
    this.props.sessionDurationSeconds = session.durationSeconds;
    this.props.remainingAtTransition = session.durationSeconds;
    this.props.transitionedAt = now;
    this.transitioned("started", now);
  }

  /** Past due → completes instead of leaving a "paused at 0" zombie. */
  pause(now: Date): void {
    if (this.props.status !== "running") {
      throw timersError("timer_not_running");
    }
    const remainingSeconds = this.remainingSeconds(now) ?? 0;
    if (remainingSeconds <= 0) {
      this.complete(now);
      return;
    }
    this.props.status = "paused";
    this.props.remainingAtTransition = remainingSeconds;
    this.props.transitionedAt = now;
    this.transitioned("paused", now);
  }

  resume(now: Date): void {
    if (this.props.status !== "paused") {
      throw timersError("timer_not_paused");
    }
    this.props.status = "running";
    this.props.transitionedAt = now;
    this.transitioned("resumed", now);
  }

  stop(now: Date): void {
    if (this.props.status !== "running" && this.props.status !== "paused") {
      throw timersError("no_active_timer");
    }
    this.props.remainingAtTransition = this.remainingSeconds(now) ?? 0;
    this.props.status = "stopped";
    this.props.transitionedAt = now;
    this.transitioned("stopped", now);
  }

  /** Keeps `transitionedAt`: it identifies the completed run span. */
  complete(now: Date): void {
    if (this.props.status !== "running") {
      throw timersError("timer_not_running");
    }
    if (this.props.sessionType === "focus") {
      this.props.completedFocusSessions += 1;
    }
    this.props.status = "completed";
    this.props.remainingAtTransition = 0;
    this.transitioned("completed", now);
  }

  /** Absolute time the running session completes; null unless running. */
  completesAt(): Date | null {
    if (
      this.props.status !== "running" ||
      this.props.transitionedAt === null ||
      this.props.remainingAtTransition === null
    ) {
      return null;
    }
    return new Date(
      this.props.transitionedAt.getTime() +
        this.props.remainingAtTransition * 1000,
    );
  }

  /** Live remaining seconds. Derived for running; frozen value otherwise; null when idle. */
  remainingSeconds(now: Date): number | null {
    const { status, transitionedAt, remainingAtTransition } = this.props;
    if (remainingAtTransition === null) return null;
    if (status !== "running" || transitionedAt === null) {
      return remainingAtTransition;
    }
    const elapsed = Math.floor(
      (now.getTime() - transitionedAt.getTime()) / 1000,
    );
    return Math.max(0, remainingAtTransition - elapsed);
  }

  /** True when a running session has reached/passed its completion time. */
  isDue(now: Date): boolean {
    const completesAt = this.completesAt();
    return completesAt !== null && now.getTime() >= completesAt.getTime();
  }

  /** True while still running the span that started at `transitionedAt` (completion-job staleness guard). */
  isRunSpan(transitionedAt: Date): boolean {
    return (
      this.props.status === "running" &&
      this.props.transitionedAt?.getTime() === transitionedAt.getTime()
    );
  }

  /** Records the transition from the post-mutation state; every non-idle state has a session. */
  private transitioned(transition: TimerTransition, now: Date): void {
    this.props.updatedAt = now;
    this.record({
      transition,
      userId: this.props.userId,
      sessionType: this.props.sessionType!,
      sessionDurationSeconds: this.props.sessionDurationSeconds!,
      remainingSeconds: this.props.remainingAtTransition!,
      occurredAt: now,
    });
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
