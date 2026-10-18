import "reflect-metadata";

import { TimersBroadcaster } from "@/api/focus/presentation/ws/timers.broadcaster";
import { TimerLifecycle } from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";
import { RealtimeBroadcaster } from "@/api/platform/realtime/realtime-broadcaster";

const lifecycle = (
  eventType: EventOf<typeof TimerLifecycle>["eventType"],
): EventOf<typeof TimerLifecycle> => ({
  userId: "u1",
  sessionId: "s1",
  eventType,
  mode: "focus",
  durationSeconds: 1500,
  remainingSeconds: 0,
  reason: null,
  occurredAt: "2026-01-01T00:00:00.000Z",
});

describe("TimersBroadcaster", () => {
  let emit: jest.Mock;
  let broadcaster: TimersBroadcaster;

  beforeEach(() => {
    emit = jest.fn();
    broadcaster = new TimersBroadcaster({
      emit,
    } as unknown as RealtimeBroadcaster);
  });

  it("pushes timer.completed to the user", async () => {
    const payload = lifecycle("completed");
    await broadcaster.onTimerLifecycle(payload);

    expect(emit).toHaveBeenCalledWith(
      [{ kind: "user", id: "u1" }],
      "timer.completed",
      payload,
    );
  });

  it.each(["started", "paused", "resumed", "stopped", "skipped"] as const)(
    "ignores %s",
    async (eventType) => {
      await broadcaster.onTimerLifecycle(lifecycle(eventType));
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it("pushes timer.session_ended to the user", async () => {
    const payload = {
      userId: "u1",
      sessionId: "s1",
      reason: "inactivity" as const,
      finishedAt: "2026-01-01T00:00:00.000Z",
    };
    await broadcaster.onTimerSessionEnded(payload);

    expect(emit).toHaveBeenCalledWith(
      [{ kind: "user", id: "u1" }],
      "timer.session_ended",
      payload,
    );
  });
});
