import { Injectable } from "@nestjs/common";

import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import { TimerLifecycle } from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";
import { RealtimeBroadcaster } from "@/api/platform/realtime/realtime-broadcaster";

@Injectable()
export class TimersBroadcaster {
  constructor(private readonly broadcaster: RealtimeBroadcaster) {}

  @EventHandler(TimerLifecycle)
  async onTimerLifecycle(
    payload: EventOf<typeof TimerLifecycle>,
  ): Promise<void> {
    if (payload.eventType !== "completed") {
      return;
    }

    this.broadcaster.emit(
      [{ kind: "user", id: payload.userId }],
      "timer.completed",
      payload,
    );
  }
}
