import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { TimerLogRepository } from "@/api/focus/domain/ports/timer-log.repository";
import { TimerLogConsumerGroup } from "@/api/focus/presentation/events/timer-log.consumer-group";
import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import { TimerLifecycle } from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";

/** Appends timer lifecycle events to the timer log, asynchronously. */
@Injectable()
export class TimerLogHandler {
  constructor(private readonly timerLog: TimerLogRepository) {}

  @EventHandler(TimerLifecycle, TimerLogConsumerGroup)
  @Transactional()
  async onTimerLifecycle(
    payload: EventOf<typeof TimerLifecycle>,
  ): Promise<void> {
    await this.timerLog.append({
      userId: payload.userId,
      sessionId: payload.sessionId,
      transition: payload.eventType,
      mode: payload.mode,
      durationSeconds: payload.durationSeconds,
      remainingSeconds: payload.remainingSeconds,
      reason: payload.reason,
      occurredAt: new Date(payload.occurredAt),
    });
  }
}
