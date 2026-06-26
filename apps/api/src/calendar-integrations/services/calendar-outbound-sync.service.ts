import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import { ContextLogger } from "nestjs-context-logger";

import { CalendarEvent } from "@/api/calendar-events/entities/calendar-event.entity";
import { CalendarRepository } from "@/api/calendar-events/repositories/calendar.repository";
import { CalendarEventsRepository } from "@/api/calendar-events/repositories/calendar-events.repository";
import { utcToIso } from "@/api/calendar-events/utils/recurrence.utils";
import { CalendarEventLink } from "@/api/calendar-integrations/entities/calendar-event-link.entity";
import { CalendarIntegration } from "@/api/calendar-integrations/entities/calendar-integration.entity";
import { CalendarProviderRegistry } from "@/api/calendar-integrations/providers/calendar-provider.registry";
import { ExternalEventInput } from "@/api/calendar-integrations/providers/types";
import { CalendarEventLinkRepository } from "@/api/calendar-integrations/repositories/calendar-event-link.repository";
import { CalendarIntegrationRepository } from "@/api/calendar-integrations/repositories/calendar-integration.repository";
import { CalendarIntegrationService } from "@/api/calendar-integrations/services/calendar-integration.service";
import { generateId } from "@/shared/id";

/**
 * Mirrors native asksynk events out to bidirectional integrations. Handlers are
 * idempotent create-or-update and tolerate out-of-order delivery: Created/Updated
 * no-op if the row is gone; Deleted fans out from surviving `mirrored` links.
 * Only `source='asksynk'` events reach here — imported events never mirror back.
 */
@Injectable()
export class CalendarOutboundSyncService {
  private readonly logger = new ContextLogger(CalendarOutboundSyncService.name);

  constructor(
    private readonly integrationService: CalendarIntegrationService,
    private readonly registry: CalendarProviderRegistry,
    private readonly calendarRepository: CalendarRepository,
    private readonly calendarEventsRepository: CalendarEventsRepository,
    private readonly integrationRepository: CalendarIntegrationRepository,
    private readonly linkRepository: CalendarEventLinkRepository,
  ) {}

  @Transactional()
  async mirrorEvent(eventId: string, userId: string): Promise<void> {
    const event = await this.calendarEventsRepository.getById(eventId);
    if (!event) return; // deleted before this ran — nothing to mirror

    const calendar = await this.calendarRepository.getById(event.calendarId);
    if (!calendar || !calendar.isNative) return; // only native events mirror out

    const integrations = (
      await this.integrationRepository.listByUser(userId)
    ).filter((i) => i.status === "active" && i.isBidirectional);
    if (integrations.length === 0) return;

    const input = this.buildInput(event);
    for (const integration of integrations) {
      await this.mirrorToIntegration(integration, eventId, input);
    }
  }

  @Transactional()
  async deleteMirrors(eventId: string): Promise<void> {
    const links = await this.linkRepository.listByEvent(eventId);
    for (const link of links.filter((l) => l.isMirrored)) {
      await this.deleteMirror(link);
    }
  }

  private async mirrorToIntegration(
    integration: CalendarIntegration,
    eventId: string,
    input: ExternalEventInput,
  ): Promise<void> {
    const target = await this.resolvePrimaryExternalId(integration.id);
    if (!target) {
      this.logger.warn("No target calendar for mirror; skipping", {
        integrationId: integration.id,
      });
      return;
    }

    const provider = this.registry.get(integration.provider);
    const result = await this.integrationService.getFreshCredentials(
      integration.id,
    );

    if (result.result === "failure") {
      this.logger.warn("Failed to refresh credentials; skipping mirror", {
        integrationId: integration.id,
      });
      return;
    }

    const { credentials } = result;

    const link = await this.linkRepository.getByEventAndIntegration(
      eventId,
      integration.id,
    );

    if (!link) {
      const res = await provider.createEvent(credentials, target, input);
      await this.linkRepository.add(
        CalendarEventLink.create({
          id: generateId(),
          asksynkEventId: eventId,
          integrationId: integration.id,
          externalCalendarId: target,
          externalEventId: res.externalEventId,
          etag: res.etag,
          origin: "mirrored",
          degraded: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      return;
    }

    if (!link.isMirrored) return; // imported link — never push back

    const res = await provider.updateEvent(
      credentials,
      link.externalCalendarId,
      link.externalEventId,
      input,
    );
    await this.linkRepository.updateEtag(link.id, res.etag);
  }

  private async deleteMirror(link: CalendarEventLink): Promise<void> {
    const integration = await this.integrationRepository.getById(
      link.integrationId,
    );

    if (!integration || integration.status !== "active") {
      return;
    }

    try {
      const refreshResult = await this.integrationService.getFreshCredentials(
        link.integrationId,
      );

      if (refreshResult.result === "failure") {
        this.logger.warn(
          "Failed to refresh credentials; skipping mirror deletion",
          {
            integrationId: link.integrationId,
          },
        );
        return;
      }

      const { credentials } = refreshResult;
      await this.registry
        .get(integration.provider)
        .deleteEvent(
          credentials,
          link.externalCalendarId,
          link.externalEventId,
        );
    } catch (err) {
      // best-effort: drop the link anyway so we don't loop forever
      this.logger.warn("Failed to delete external mirror (dropping link)", {
        linkId: link.id,
        err,
      });
    }
    await this.linkRepository.delete(link.id);
  }

  private async resolvePrimaryExternalId(
    integrationId: string,
  ): Promise<string | null> {
    const calendars =
      await this.calendarRepository.listByIntegration(integrationId);
    const primary = calendars.find(
      (c) => c.providerState.isPrimary && c.externalId,
    );
    return primary?.externalId ?? calendars[0]?.externalId ?? null;
  }

  private buildInput(event: CalendarEvent): ExternalEventInput {
    const end = new Date(event.start.getTime() + event.durationSeconds * 1000);
    return {
      title: event.title,
      description: event.description,
      location: event.location,
      start: utcToIso(event.start, event.timezone),
      end: utcToIso(end, event.timezone),
      timezone: event.timezone,
      allDay: event.allDay,
      rrule: event.rrule,
    };
  }
}
