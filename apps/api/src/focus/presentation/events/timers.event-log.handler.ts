import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { TimersRepository } from "@/api/focus/domain/ports/timers.repository";
import { TimerEventLogConsumerGroup } from "@/api/focus/presentation/events/timer-event-log.consumer-group";
import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import { TimerLifecycle } from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";

/** Persists timer lifecycle events to the append-only event log, asynchronously. */
@Injectable()
export class TimersEventLogHandler {
  constructor(private readonly timersRepo: TimersRepository) {}

  @EventHandler(TimerLifecycle, TimerEventLogConsumerGroup)
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
