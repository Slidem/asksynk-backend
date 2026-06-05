import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { TimersRepository } from "@/api/timers/timers.repository";
import { EventHandler } from "@/shared/event-consumer/event-consumer.decorator";
import { TimerLifecycle } from "@/shared/event-registry/events.registry";
import { EventOf } from "@/shared/event-registry/events.types";

/** Persists timer lifecycle events to the append-only event log, asynchronously. */
@Injectable()
export class TimersEventLogHandler {
  constructor(private readonly timersRepo: TimersRepository) {}

  @EventHandler(TimerLifecycle, { group: "timer-event-log" })
  @Transactional()
  async onTimerLifecycle(
    payload: EventOf<typeof TimerLifecycle>,
  ): Promise<void> {
    await this.timersRepo.appendEvent({
      userId: payload.userId,
      eventType: payload.eventType,
      sessionType: payload.sessionType,
      sessionDurationSeconds: payload.sessionDurationSeconds,
      remainingSeconds: payload.remainingSeconds,
      occurredAt: new Date(payload.occurredAt),
    });
  }
}
