import { Timer } from "@/api/timers/domain/timer";
import {
  TimerEventType,
  TimerSessionType,
} from "@/api/timers/models/timer.model";

export interface StartInput {
  sessionType: TimerSessionType;
  durationSeconds: number;
  transitionedAt: Date;
  resetFocusCounter: boolean;
}

export interface AppendEventInput {
  userId: string;
  eventType: TimerEventType;
  sessionType: TimerSessionType;
  sessionDurationSeconds: number;
  remainingSeconds: number;
  occurredAt: Date;
}

export abstract class TimersRepository {
  abstract ensure(userId: string): Promise<Timer>;
  abstract getByUserId(userId: string): Promise<Timer | null>;
  abstract start(userId: string, input: StartInput): Promise<Timer>;
  abstract pause(
    userId: string,
    remainingAtTransition: number,
    transitionedAt: Date,
  ): Promise<Timer | null>;
  abstract resume(
    userId: string,
    transitionedAt: Date,
  ): Promise<Timer | null>;
  abstract stop(
    userId: string,
    remainingAtTransition: number,
    transitionedAt: Date,
  ): Promise<Timer | null>;
  abstract completeIfRunning(
    userId: string,
    transitionedAtGuard: Date,
    now: Date,
  ): Promise<Timer | null>;
  abstract appendEvent(input: AppendEventInput): Promise<void>;
}
