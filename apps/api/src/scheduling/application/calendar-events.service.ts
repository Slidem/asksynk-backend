import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import { pick, pickBy } from "lodash";

import { Actor } from "@/api/kernel/actor/actor";
import { generateId } from "@/api/kernel/id";
import { ConnectionPolicyPort } from "@/api/network/contract/connection-policy.port";
import { EventsPublisher } from "@/api/platform/events/publisher/events-publisher";
import {
  CalendarEventCreated,
  CalendarEventDeleted,
  CalendarEventUpdated,
} from "@/api/platform/events/registry/events.registry";
import { CreateCalendarEventInput } from "@/api/scheduling/application/create-calendar-event.model";
import { DetachCalendarEventInstanceInput } from "@/api/scheduling/application/detach-calendar-event-instance.model";
import { ListCalendarEventsInput } from "@/api/scheduling/application/list-calendar-events.model";
import { SplitCalendarEventSeriesInput } from "@/api/scheduling/application/split-calendar-event-series.model";
import { UpdateCalendarEventInput } from "@/api/scheduling/application/update-calendar-event.model";
import { calendarEventError } from "@/api/scheduling/calendar-events.errors";
import { Calendar } from "@/api/scheduling/domain/calendar";
import { CalendarEvent } from "@/api/scheduling/domain/calendar-event";
import { toCalendarEventInstance } from "@/api/scheduling/domain/calendar-event-instance.mapper";
import { CalendarEventInstance } from "@/api/scheduling/domain/calendar-event-instance.model";
import { CalendarRepository } from "@/api/scheduling/domain/ports/calendar.repository";
import { CalendarEventsRepository } from "@/api/scheduling/domain/ports/calendar-events.repository";
import { parseIsoWallClockInTimezone } from "@/api/scheduling/domain/recurrence";
import { RecurrenceRule } from "@/api/scheduling/domain/recurrence-rule.vo";
import { TagCatalogPort } from "@/api/tagging/contract/tag-catalog.port";

function mergeNullable<T>(
  input: T | null | undefined,
  fallback: T | null,
): T | null {
  return input !== undefined ? (input ?? null) : fallback;
}

@Injectable()
export class CalendarEventsService {
  constructor(
    private readonly calendarEventsRepository: CalendarEventsRepository,
    private readonly calendarRepository: CalendarRepository,
    private readonly tagCatalog: TagCatalogPort,
    private readonly connections: ConnectionPolicyPort,
    private readonly eventsPublisher: EventsPublisher,
  ) {}

  @Transactional()
  async ensureCalendar(userId: string): Promise<Calendar> {
    return this.calendarRepository.ensureAsksynkCalendar(userId, generateId());
  }

  @Transactional()
  async getCalendar(userId: string): Promise<Calendar> {
    const calendar = await this.calendarRepository.getAsksynkByUserId(userId);
    if (!calendar) {
      throw calendarEventError("calendar_not_found_for_user", { userId });
    }
    return calendar;
  }

  @Transactional()
  async createCalendarEvent(
    userId: string,
    input: CreateCalendarEventInput,
  ): Promise<CalendarEventInstance> {
    const calendar = await this.ensureCalendar(userId);

    const rrule = input.rrule
      ? RecurrenceRule.create(input.rrule, input.timezone, input.start).value
      : null;

    await this.tagCatalog.assertOwnedBy(userId, input.tagIds ?? []);

    const event = CalendarEvent.create({
      id: input.id,
      calendarId: calendar.id,
      title: input.title,
      description: input.description,
      location: input.location,
      link: input.link,
      start: input.start,
      durationSeconds: input.durationSeconds,
      allDay: input.allDay,
      timezone: input.timezone,
      rrule,
      color: input.color,
      tagIds: input.tagIds,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const created = await this.calendarEventsRepository.add(event);
    const endAt = new Date(
      created.start.getTime() + created.durationSeconds * 1000,
    );
    await this.eventsPublisher.publish(CalendarEventCreated, {
      eventId: created.id,
      userId,
      tagIds: created.tagIds,
      startAt: created.start.toISOString(),
      endAt: endAt.toISOString(),
    });
    return toCalendarEventInstance(created, calendar.source);
  }

  @Transactional()
  async getCalendarEvent(
    userId: string,
    eventId: string,
  ): Promise<CalendarEvent> {
    const event = await this.calendarEventsRepository.getById(eventId);
    if (!event) {
      throw calendarEventError("calendar_event_not_found", { id: eventId });
    }

    const calendar = await this.calendarRepository.getById(event.calendarId);
    if (!calendar || !calendar.belongsTo(userId)) {
      throw calendarEventError("calendar_event_not_found", { id: eventId });
    }

    return event;
  }

  @Transactional()
  async getCalendarEventInstance(
    userId: string,
    eventId: string,
  ): Promise<CalendarEventInstance> {
    const event = await this.getCalendarEvent(userId, eventId);
    return this.toInstance(event);
  }

  @Transactional()
  async listCalendarEvents(
    actor: Actor,
    input: ListCalendarEventsInput,
  ): Promise<CalendarEventInstance[]> {
    const userId = await this.connections.resolveTargetUserId(
      actor,
      input.userId,
    );
    const calendars = await this.calendarRepository.listByUserId(userId);
    if (calendars.length === 0) return [];

    const allCalendarIds = calendars.map((c) => c.id);

    if (input.calendarId && !allCalendarIds.includes(input.calendarId)) {
      throw calendarEventError("calendar_not_found", {
        id: input.calendarId,
      });
    }

    const calendarIds = input.calendarId ? [input.calendarId] : allCalendarIds;

    return this.calendarEventsRepository.listInWindow(
      calendarIds,
      input.windowStart,
      input.windowEnd,
      input.tagIds,
    );
  }

  @Transactional()
  async updateCalendarEvent(
    userId: string,
    input: UpdateCalendarEventInput,
  ): Promise<CalendarEventInstance> {
    const event = await this.getCalendarEvent(userId, input.eventId);
    const calendar = await this.calendarRepository.getById(event.calendarId);

    const updates = pickBy(
      pick(input, [
        "title",
        "description",
        "location",
        "link",
        "start",
        "durationSeconds",
        "allDay",
        "timezone",
        "color",
      ]),
      (v) => v !== undefined,
    );

    // Imported (non-native) events are read-only except for tag association.
    if (
      (Object.keys(updates).length > 0 || input.rrule !== undefined) &&
      !calendar?.isNative
    ) {
      throw calendarEventError("imported_calendar_event_readonly", {
        id: event.id,
      });
    }

    Object.assign(event, updates);

    if (input.rrule !== undefined) {
      event.rrule = input.rrule
        ? RecurrenceRule.create(input.rrule, event.timezone, event.start).value
        : null;
    }

    if (input.tagIds !== undefined) {
      await this.tagCatalog.assertOwnedBy(userId, input.tagIds);
      event.tagIds = input.tagIds;
    }

    const updated = await this.calendarEventsRepository.update(event);
    await this.emitUpdated(userId, updated);
    return toCalendarEventInstance(updated, calendar?.source ?? "asksynk");
  }

  @Transactional()
  async deleteCalendarEvent(userId: string, eventId: string): Promise<void> {
    const event = await this.getCalendarEvent(userId, eventId);
    const calendar = await this.calendarRepository.getById(event.calendarId);
    if (!calendar?.isNative) {
      throw calendarEventError("imported_calendar_event_readonly", {
        id: eventId,
      });
    }
    await this.calendarEventsRepository.delete(eventId);
    await this.eventsPublisher.publish(CalendarEventDeleted, {
      eventId: event.id,
      userId,
    });
  }

  private async toInstance(
    event: CalendarEvent,
  ): Promise<CalendarEventInstance> {
    const calendar = await this.calendarRepository.getById(event.calendarId);
    return toCalendarEventInstance(event, calendar?.source ?? "asksynk");
  }

  @Transactional()
  async addException(
    userId: string,
    eventId: string,
    occurrenceStart: string,
  ): Promise<void> {
    const event = await this.getCalendarEvent(userId, eventId);
    if (!event.isRecurring) {
      throw calendarEventError("calendar_event_is_not_recurring", {
        id: eventId,
      });
    }
    const occStart = parseIsoWallClockInTimezone(
      occurrenceStart,
      event.timezone,
    );
    await this.calendarEventsRepository.addException(eventId, occStart);
    await this.emitUpdated(userId, event);
  }

  @Transactional()
  async detachInstance(
    userId: string,
    eventId: string,
    instanceStart: string,
    input: Omit<
      DetachCalendarEventInstanceInput,
      "eventId" | "occurrenceStart"
    >,
  ): Promise<CalendarEventInstance> {
    const event = await this.getCalendarEvent(userId, eventId);
    if (!event.isRecurring) {
      throw calendarEventError("calendar_event_is_not_recurring", {
        id: eventId,
      });
    }

    const occStart = parseIsoWallClockInTimezone(instanceStart, event.timezone);
    const timezone = input.timezone ?? event.timezone;
    const start = input.start ?? occStart;

    await this.tagCatalog.assertOwnedBy(userId, input.tagIds ?? []);

    const newEvent = CalendarEvent.create({
      id: generateId(),
      calendarId: event.calendarId,
      title: input.title ?? event.title,
      description: mergeNullable(input.description, event.description),
      location: mergeNullable(input.location, event.location),
      link: mergeNullable(input.link, event.link),
      start,
      durationSeconds: input.durationSeconds ?? event.durationSeconds,
      allDay: event.allDay,
      timezone,
      rrule: null,
      color: mergeNullable(input.color, event.color),
      originalEventId: event.id,
      originalStart: occStart,
      tagIds: input.tagIds ?? event.tagIds,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const detached = await this.calendarEventsRepository.detachInstance(
      eventId,
      occStart,
      newEvent,
    );
    await this.emitUpdated(userId, event);
    await this.emitUpdated(userId, detached);
    return this.toInstance(detached);
  }

  @Transactional()
  async splitSeries(
    userId: string,
    eventId: string,
    splitStart: string,
    input: Omit<SplitCalendarEventSeriesInput, "eventId">,
  ): Promise<CalendarEventInstance> {
    const event = await this.getCalendarEvent(userId, eventId);
    if (!event.isRecurring) {
      throw calendarEventError("calendar_event_is_not_recurring", {
        id: eventId,
      });
    }

    const splitDate = parseIsoWallClockInTimezone(splitStart, event.timezone);
    const timezone = input.timezone ?? event.timezone;

    // Split at recurrence start — no actual split, just update in-place
    if (splitDate.getTime() === event.start.getTime()) {
      event.title = input.title ?? event.title;
      event.description = mergeNullable(input.description, event.description);
      event.location = mergeNullable(input.location, event.location);
      event.link = mergeNullable(input.link, event.link);
      event.start = input.start
        ? parseIsoWallClockInTimezone(input.start, timezone)
        : event.start;
      event.durationSeconds = input.durationSeconds ?? event.durationSeconds;
      event.timezone = timezone;
      event.color = mergeNullable(input.color, event.color);

      if (input.rrule) {
        event.rrule = RecurrenceRule.create(
          input.rrule,
          timezone,
          event.start,
        ).value;
      }

      if (input.tagIds !== undefined) {
        await this.tagCatalog.assertOwnedBy(userId, input.tagIds);
        event.tagIds = input.tagIds;
      }

      const inPlaceUpdated = await this.calendarEventsRepository.update(event);
      await this.emitUpdated(userId, inPlaceUpdated);
      return this.toInstance(inPlaceUpdated);
    }

    // UNTIL = splitDate - 1 day + 1 second (just after previous occurrence)
    const newUntil = new Date(splitDate.getTime() - 86400000 + 1000);
    const truncatedRrule = RecurrenceRule.restore(event.rrule!).withUntil(
      newUntil,
    ).value;

    const newRruleBase = input.rrule ?? event.rrule!;
    const newRrule = RecurrenceRule.create(
      newRruleBase,
      timezone,
      splitDate,
    ).value;

    await this.tagCatalog.assertOwnedBy(userId, input.tagIds ?? []);

    const newEvent = CalendarEvent.create({
      id: generateId(),
      calendarId: event.calendarId,
      title: input.title ?? event.title,
      description: mergeNullable(input.description, event.description),
      location: mergeNullable(input.location, event.location),
      link: mergeNullable(input.link, event.link),
      start: input.start
        ? parseIsoWallClockInTimezone(input.start, timezone)
        : splitDate,
      durationSeconds: input.durationSeconds ?? event.durationSeconds,
      allDay: event.allDay,
      timezone,
      rrule: newRrule,
      color: mergeNullable(input.color, event.color),
      originalEventId: event.id,
      originalStart: splitDate,
      tagIds: input.tagIds ?? event.tagIds,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const splitResult = await this.calendarEventsRepository.splitSeries(
      eventId,
      truncatedRrule,
      newEvent,
    );
    await this.emitUpdated(userId, event);
    await this.emitUpdated(userId, splitResult);
    return this.toInstance(splitResult);
  }

  private async emitUpdated(
    userId: string,
    event: CalendarEvent,
  ): Promise<void> {
    const endAt = new Date(
      event.start.getTime() + event.durationSeconds * 1000,
    );
    await this.eventsPublisher.publish(CalendarEventUpdated, {
      eventId: event.id,
      userId,
      tagIds: event.tagIds,
      startAt: event.start.toISOString(),
      endAt: endAt.toISOString(),
    });
  }
}
