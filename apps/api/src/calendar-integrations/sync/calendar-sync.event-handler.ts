import { Injectable } from "@nestjs/common";

import { CalendarOutboundSyncService } from "@/api/calendar-integrations/services/calendar-outbound-sync.service";
import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import { CalendarSyncConsumerGroup } from "@/api/calendar-integrations/calendar-sync.consumer-group";
import {
  CalendarEventCreated,
  CalendarEventDeleted,
  CalendarEventUpdated,
} from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";

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
