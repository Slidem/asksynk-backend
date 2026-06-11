import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import { ContextLogger } from "nestjs-context-logger";

import { Calendar } from "@/api/calendar-events/entities/calendar.entity";
import { CalendarEvent } from "@/api/calendar-events/entities/calendar-event.entity";
import { CalendarRepository } from "@/api/calendar-events/repositories/calendar.repository";
import { CalendarEventsRepository } from "@/api/calendar-events/repositories/calendar-events.repository";
import { parseIsoWallClockInTimezone } from "@/api/calendar-events/utils/recurrence.utils";
import { CalendarEventLink } from "@/api/calendar-integrations/entities/calendar-event-link.entity";
import { CalendarIntegration } from "@/api/calendar-integrations/entities/calendar-integration.entity";
import { CalendarProviderRegistry } from "@/api/calendar-integrations/providers/calendar-provider.registry";
import {
  ExternalEvent,
  ExternalEventTime,
} from "@/api/calendar-integrations/providers/types";
import { CalendarEventLinkRepository } from "@/api/calendar-integrations/repositories/calendar-event-link.repository";
import { CalendarIntegrationService } from "@/api/calendar-integrations/services/calendar-integration.service";
import { generateId } from "@/shared/id";

interface MappedEventFields {
  title: string;
  description: string | null;
  location: string | null;
  link: string | null;
  start: Date;
  durationSeconds: number;
  allDay: boolean;
  timezone: string;
  rrule: string | null;
  degraded: boolean;
}

@Injectable()
export class CalendarSyncService {
  private readonly logger = new ContextLogger(CalendarSyncService.name);

  constructor(
    private readonly integrationService: CalendarIntegrationService,
    private readonly registry: CalendarProviderRegistry,
    private readonly calendarRepository: CalendarRepository,
    private readonly calendarEventsRepository: CalendarEventsRepository,
    private readonly linkRepository: CalendarEventLinkRepository,
  ) {}

  /**
   * Pulls changes for one provider calendar into asksynk (read-only import).
   * Network IO happens outside transactions; DB mutation is one transaction.
   */
  async syncCalendar(calendarId: string): Promise<void> {
    const calendar = await this.loadSyncableCalendar(calendarId);
    if (!calendar?.integrationId || !calendar.externalId) return;

    const { integration, credentials } =
      await this.integrationService.getFreshCredentials(calendar.integrationId);
    if (integration.status !== "active") return;

    const provider = this.registry.get(integration.provider);

    let result = await provider.listEvents(
      credentials,
      calendar.externalId,
      calendar.syncToken,
    );
    if (result.tokenExpired) {
      this.logger.info("Sync token expired, performing full re-list", {
        calendarId,
      });
      result = await provider.listEvents(
        credentials,
        calendar.externalId,
        null,
      );
    }

    await this.applyChanges(
      calendar,
      integration,
      result.events,
      result.nextSyncToken,
    );
  }

  @Transactional()
  async applyChanges(
    calendar: Calendar,
    integration: CalendarIntegration,
    events: ExternalEvent[],
    nextSyncToken: string | null,
  ): Promise<void> {
    // Two-pass: masters/singles first so instance overrides can resolve their
    // master link in the same run (provider list order is not guaranteed).
    const masters = events.filter((e) => !e.recurringEventExternalId);
    const overrides = events.filter((e) => e.recurringEventExternalId);
    for (const ext of [...masters, ...overrides]) {
      await this.applyEvent(calendar, integration, ext);
    }

    if (nextSyncToken) {
      await this.calendarRepository.updateSyncToken(calendar.id, nextSyncToken);
    }
  }

  private async applyEvent(
    calendar: Calendar,
    integration: CalendarIntegration,
    ext: ExternalEvent,
  ): Promise<void> {
    const link = await this.linkRepository.getByExternal(
      integration.id,
      ext.externalEventId,
    );

    if (ext.cancelled) {
      await this.applyCancellation(calendar, integration, ext, link);
      return;
    }

    // Echo: this external event is our own outbound mirror — refresh etag, don't import.
    if (link?.isMirrored) {
      await this.linkRepository.updateEtag(link.id, ext.etag);
      return;
    }

    const fields = this.mapFields(calendar, ext);

    if (link) {
      const existing = await this.calendarEventsRepository.getById(
        link.asksynkEventId,
      );
      if (existing) {
        this.applyFields(existing, fields);
        await this.calendarEventsRepository.update(existing);
        await this.linkRepository.updateEtag(link.id, ext.etag);
        return;
      }
      // dangling link (local row gone) — fall through and recreate
      await this.linkRepository.delete(link.id);
    }

    await this.importNewEvent(calendar, integration, ext, fields);
  }

  private async importNewEvent(
    calendar: Calendar,
    integration: CalendarIntegration,
    ext: ExternalEvent,
    fields: MappedEventFields,
  ): Promise<void> {
    let originalEventId: string | null = null;
    let originalStart: Date | null = null;

    if (ext.recurringEventExternalId) {
      const masterLink = await this.linkRepository.getByExternal(
        integration.id,
        ext.recurringEventExternalId,
      );
      if (!masterLink) {
        // master not imported yet — retry on the next sync once it exists
        this.logger.debug("Skipping override; master not yet imported", {
          externalEventId: ext.externalEventId,
        });
        return;
      }
      originalEventId = masterLink.asksynkEventId;
      originalStart = ext.originalStart
        ? this.toInstant(ext.originalStart, fields.timezone)
        : null;
    }

    const eventId = generateId();
    const event = CalendarEvent.create({
      id: eventId,
      calendarId: calendar.id,
      title: fields.title,
      description: fields.description,
      location: fields.location,
      link: fields.link,
      start: fields.start,
      durationSeconds: fields.durationSeconds,
      allDay: fields.allDay,
      timezone: fields.timezone,
      rrule: fields.rrule,
      originalEventId,
      originalStart,
      tagIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await this.calendarEventsRepository.add(event);

    await this.linkRepository.add(
      CalendarEventLink.create({
        id: generateId(),
        asksynkEventId: eventId,
        integrationId: integration.id,
        externalCalendarId: calendar.externalId!,
        externalEventId: ext.externalEventId,
        etag: ext.etag,
        origin: "imported",
        degraded: fields.degraded,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  }

  private async applyCancellation(
    calendar: Calendar,
    integration: CalendarIntegration,
    ext: ExternalEvent,
    link: CalendarEventLink | null,
  ): Promise<void> {
    if (link) {
      await this.calendarEventsRepository.delete(link.asksynkEventId);
      await this.linkRepository.delete(link.id);
      return;
    }
    // cancelled occurrence of a recurring series we imported — add an exception
    if (ext.recurringEventExternalId && ext.originalStart) {
      const masterLink = await this.linkRepository.getByExternal(
        integration.id,
        ext.recurringEventExternalId,
      );
      if (masterLink) {
        const tz = calendar.providerState.timezone ?? "UTC";
        await this.calendarEventsRepository.addException(
          masterLink.asksynkEventId,
          this.toInstant(ext.originalStart, tz),
        );
      }
    }
  }

  private async loadSyncableCalendar(
    calendarId: string,
  ): Promise<Calendar | null> {
    const calendar = await this.readCalendar(calendarId);
    if (!calendar || !calendar.syncEnabled || calendar.isNative) return null;
    return calendar;
  }

  @Transactional()
  async readCalendar(calendarId: string): Promise<Calendar | null> {
    return this.calendarRepository.getById(calendarId);
  }

  private mapFields(calendar: Calendar, ext: ExternalEvent): MappedEventFields {
    const timezone =
      ext.start?.timezone ?? calendar.providerState.timezone ?? "UTC";

    const start = ext.start ? this.toInstant(ext.start, timezone) : new Date(0);
    const end = ext.end ? this.toInstant(ext.end, timezone) : start;
    const durationSeconds = Math.max(
      0,
      Math.round((end.getTime() - start.getTime()) / 1000),
    );

    const { rrule, degraded } = this.mapRecurrence(ext.recurrence);

    return {
      title: ext.title,
      description: ext.description,
      location: ext.location,
      link: ext.link,
      start,
      durationSeconds,
      allDay: ext.allDay,
      timezone,
      rrule,
      degraded,
    };
  }

  private applyFields(event: CalendarEvent, fields: MappedEventFields): void {
    event.title = fields.title;
    event.description = fields.description;
    event.location = fields.location;
    event.link = fields.link;
    event.start = fields.start;
    event.durationSeconds = fields.durationSeconds;
    event.allDay = fields.allDay;
    event.timezone = fields.timezone;
    event.rrule = fields.rrule;
  }

  /** Wall-clock instant from a provider time, honouring asksynk's tz convention. */
  private toInstant(time: ExternalEventTime, timezone: string): Date {
    // all-day comes as "YYYY-MM-DD"; timed as RFC3339. Normalize to a wall-clock ISO.
    const iso =
      time.value.length === 10 ? `${time.value}T00:00:00` : time.value;
    return parseIsoWallClockInTimezone(iso, timezone);
  }

  /**
   * MVP: import the first RRULE line only. Anything richer (multiple RRULE,
   * RDATE/EXRULE) is flagged `degraded` so the loss is visible, not silent.
   */
  private mapRecurrence(recurrence: string[] | null): {
    rrule: string | null;
    degraded: boolean;
  } {
    if (!recurrence?.length) return { rrule: null, degraded: false };

    const rruleLines = recurrence.filter((l) => l.startsWith("RRULE:"));
    const extraLines = recurrence.filter((l) => !l.startsWith("RRULE:"));
    if (rruleLines.length === 0) return { rrule: null, degraded: false };

    const rrule = rruleLines[0].replace(/^RRULE:/, "");
    const degraded = rruleLines.length > 1 || extraLines.length > 0;
    return { rrule, degraded };
  }
}
