import {
  TimerSessionType,
  TimerStatus,
} from "@/api/timers/models/timer.model";

export interface UserTimerProps {
  id: string;
  userId: string;
  status: TimerStatus;
  sessionType: TimerSessionType | null;
  sessionDurationSeconds: number | null;
  transitionedAt: Date | null;
  remainingAtTransition: number | null;
  pendingCompletionJobRef: string | null;
  completedFocusSessions: number;
  createdAt: Date;
  updatedAt: Date;
}

export class UserTimer {
  readonly id: string;
  readonly userId: string;
  readonly status: TimerStatus;
  readonly sessionType: TimerSessionType | null;
  readonly sessionDurationSeconds: number | null;
  readonly transitionedAt: Date | null;
  readonly remainingAtTransition: number | null;
  readonly pendingCompletionJobRef: string | null;
  readonly completedFocusSessions: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: UserTimerProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.status = props.status;
    this.sessionType = props.sessionType;
    this.sessionDurationSeconds = props.sessionDurationSeconds;
    this.transitionedAt = props.transitionedAt;
    this.remainingAtTransition = props.remainingAtTransition;
    this.pendingCompletionJobRef = props.pendingCompletionJobRef;
    this.completedFocusSessions = props.completedFocusSessions;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: UserTimerProps): UserTimer {
    return new UserTimer(props);
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
