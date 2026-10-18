import {
  TimerSessionType,
  TimerTransition,
} from "@/api/focus/domain/timer.model";

export interface TimerLogEntry {
  userId: string;
  transition: TimerTransition;
  sessionType: TimerSessionType;
  sessionDurationSeconds: number;
  remainingSeconds: number;
  occurredAt: Date;
}

/** Append-only history of timer transitions; not part of the `Timer` aggregate. */
export abstract class TimerLogRepository {
  abstract append(entry: TimerLogEntry): Promise<void>;
}
