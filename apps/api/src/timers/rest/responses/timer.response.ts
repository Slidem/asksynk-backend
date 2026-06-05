import {
  TimerSessionType,
  TimerStatus,
} from "@/api/timers/models/timer.model";

export interface TimerResponse {
  id: string;
  userId: string;
  status: TimerStatus;
  sessionType: TimerSessionType | null;
  sessionDurationSeconds: number | null;
  remainingSeconds: number | null;
  completesAt: string | null;
  completedFocusSessions: number;
  transitionedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
