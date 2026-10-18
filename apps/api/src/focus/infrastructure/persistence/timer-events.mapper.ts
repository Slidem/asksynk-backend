import { TimerTransitioned } from "@/api/focus/domain/timer.events";
import { TimerLifecycle } from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";

/** Wire keeps `eventType`: it reaches the frontend via the `timer.completed` WS push. */
export const toTimerLifecyclePayload = (
  e: TimerTransitioned,
): EventOf<typeof TimerLifecycle> => ({
  userId: e.userId,
  eventType: e.transition,
  sessionType: e.sessionType,
  sessionDurationSeconds: e.sessionDurationSeconds,
  remainingSeconds: e.remainingSeconds,
  occurredAt: e.occurredAt.toISOString(),
});
