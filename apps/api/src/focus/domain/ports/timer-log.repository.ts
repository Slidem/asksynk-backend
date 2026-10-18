import {
  SessionEndReason,
  TimerMode,
  TimerTransition,
} from "@/api/focus/domain/timer.model";

export interface TimerLogEntry {
  userId: string;
  sessionId: string;
  transition: TimerTransition;
  mode: TimerMode;
  durationSeconds: number;
  remainingSeconds: number;
  reason: SessionEndReason | null;
  occurredAt: Date;
}

/** Append-only history of timer transitions; not part of the `Timer` aggregate. */
export abstract class TimerLogRepository {
  abstract append(entry: TimerLogEntry): Promise<void>;
}
