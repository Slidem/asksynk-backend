import { Injectable } from "@nestjs/common";

import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import {
  CalendarEventCreated,
  CalendarEventDeleted,
  CalendarEventUpdated,
} from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";
import { CalendarOutboundSyncService } from "@/api/scheduling/services/calendar-outbound-sync.service";
import { CalendarSyncConsumerGroup } from "@/api/scheduling/sync/calendar-sync.consumer-group";

/**
 * Durable consumer (group `calendar-sync`) that mirrors native asksynk events to
 * external providers. Exactly-once + failover across instances via pg-boss.
 */
@Injectable()
export class CalendarSyncEventHandler {
  constructor(private readonly outbound: CalendarOutboundSyncService) {}

  @EventHandler(CalendarEventCreated, CalendarSyncConsumerGroup)
  async onCreated(
    payload: EventOf<typeof CalendarEventCreated>,
  ): Promise<void> {
    await this.outbound.mirrorEvent(payload.eventId, payload.userId);
  }

  @EventHandler(CalendarEventUpdated, CalendarSyncConsumerGroup)
  async onUpdated(
    payload: EventOf<typeof CalendarEventUpdated>,
  ): Promise<void> {
    await this.outbound.mirrorEvent(payload.eventId, payload.userId);
  }

  @EventHandler(CalendarEventDeleted, CalendarSyncConsumerGroup)
  async onDeleted(
    payload: EventOf<typeof CalendarEventDeleted>,
  ): Promise<void> {
    await this.outbound.deleteMirrors(payload.eventId);
  }
}
