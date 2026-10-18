import {
  TimerSessionType,
  TimerTransition,
} from "@/api/focus/domain/timer.model";

export type TimerTransitioned = {
  transition: TimerTransition;
  userId: string;
  sessionType: TimerSessionType;
  sessionDurationSeconds: number;
  remainingSeconds: number;
  occurredAt: Date;
};
