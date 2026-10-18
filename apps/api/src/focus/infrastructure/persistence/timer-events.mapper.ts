import {
  FocusSessionEnded,
  TimerTransitioned,
} from "@/api/focus/domain/timer.events";
import {
  TimerLifecycle,
  TimerSessionEnded,
} from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";

/** Wire keeps `eventType`: it reaches the frontend via the `timer.completed` WS push. */
export const toTimerLifecyclePayload = (
  e: TimerTransitioned,
): EventOf<typeof TimerLifecycle> => ({
  userId: e.userId,
  sessionId: e.sessionId,
  eventType: e.transition,
  mode: e.mode,
  durationSeconds: e.durationSeconds,
  remainingSeconds: e.remainingSeconds,
  reason: e.reason,
  occurredAt: e.occurredAt.toISOString(),
});

export const toTimerSessionEndedPayload = (
  e: FocusSessionEnded,
): EventOf<typeof TimerSessionEnded> => ({
  userId: e.userId,
  sessionId: e.sessionId,
  reason: e.reason,
  finishedAt: e.finishedAt.toISOString(),
});
