import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import { pick, pickBy } from "lodash";

import { Calendar } from "@/api/calendar-events/entities/calendar.entity";
import { CalendarEvent } from "@/api/calendar-events/entities/calendar-event.entity";
import { CalendarEventInstance } from "@/api/calendar-events/models/calendar-event-instance.model";
import { CreateCalendarEventInput } from "@/api/calendar-events/models/create-calendar-event.model";
import { DetachCalendarEventInstanceInput } from "@/api/calendar-events/models/detach-calendar-event-instance.model";
import { ListCalendarEventsInput } from "@/api/calendar-events/models/list-calendar-events.model";
import { SplitCalendarEventSeriesInput } from "@/api/calendar-events/models/split-calendar-event-series.model";
import { UpdateCalendarEventInput } from "@/api/calendar-events/models/update-calendar-event.model";
import { CalendarRepository } from "@/api/calendar-events/repositories/calendar.repository";
import { CalendarEventsRepository } from "@/api/calendar-events/repositories/calendar-events.repository";
import {
  parseIsoWallClockInTimezone,
  replaceRruleUntil,
  validateAndNormalizeRrule,
} from "@/api/calendar-events/utils/recurrence.utils";
import { AsksynkError } from "@/api/common/errors/errors.model";
import { TagRepository } from "@/api/tags/repositories/tags.repository";
import { generateId } from "@/shared/id";

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
    private readonly tagRepository: TagRepository,
  ) {}

  @Transactional()
  async ensureCalendar(userId: string): Promise<Calendar> {
    return this.calendarRepository.ensureAsksynkCalendar(userId, generateId());
  }

  @Transactional()
  async getCalendar(userId: string): Promise<Calendar> {
    const calendar = await this.calendarRepository.getByUserId(userId);
    if (!calendar) {
      throw AsksynkError.notFound("Calendar not found");
    }
    return calendar;
  }

  @Transactional()
  async createCalendarEvent(
    userId: string,
    input: CreateCalendarEventInput,
  ): Promise<CalendarEvent> {
    const calendar = await this.ensureCalendar(userId);

    const rrule = input.rrule
      ? validateAndNormalizeRrule(input.rrule, input.timezone, input.start)
      : null;

    await this.validateTagIds(input.tagIds ?? [], userId);

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

    return this.calendarEventsRepository.add(event);
  }

  @Transactional()
  async getCalendarEvent(
    userId: string,
    eventId: string,
  ): Promise<CalendarEvent> {
    const event = await this.calendarEventsRepository.getById(eventId);
    if (!event) {
      throw AsksynkError.notFound("Calendar event not found");
    }

    const calendar = await this.calendarRepository.getById(event.calendarId);
    if (!calendar || !calendar.belongsTo(userId)) {
      throw AsksynkError.notFound("Calendar event not found");
    }

    return event;
  }

  @Transactional()
  async listCalendarEvents(
    userId: string,
    input: ListCalendarEventsInput,
  ): Promise<CalendarEventInstance[]> {
    const calendar = await this.calendarRepository.getByUserId(userId);
    if (!calendar) return [];

    return this.calendarEventsRepository.listInWindow(
      calendar.id,
      input.windowStart,
      input.windowEnd,
      input.tagIds,
    );
  }

  @Transactional()
  async updateCalendarEvent(
    userId: string,
    input: UpdateCalendarEventInput,
  ): Promise<CalendarEvent> {
    const event = await this.getCalendarEvent(userId, input.eventId);

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
    Object.assign(event, updates);

    if (input.rrule !== undefined) {
      event.rrule = input.rrule
        ? validateAndNormalizeRrule(input.rrule, event.timezone, event.start)
        : null;
    }

    if (input.tagIds !== undefined) {
      await this.validateTagIds(input.tagIds, userId);
      event.tagIds = input.tagIds;
    }

    return this.calendarEventsRepository.update(event);
  }

  @Transactional()
  async deleteCalendarEvent(userId: string, eventId: string): Promise<void> {
    await this.getCalendarEvent(userId, eventId);
    await this.calendarEventsRepository.delete(eventId);
  }

  @Transactional()
  async addException(
    userId: string,
    eventId: string,
    occurrenceStart: string,
  ): Promise<void> {
    const event = await this.getCalendarEvent(userId, eventId);
    if (!event.isRecurring) {
      throw AsksynkError.badRequest("Calendar event is not recurring");
    }
    const occStart = parseIsoWallClockInTimezone(
      occurrenceStart,
      event.timezone,
    );
    await this.calendarEventsRepository.addException(eventId, occStart);
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
  ): Promise<CalendarEvent> {
    const event = await this.getCalendarEvent(userId, eventId);
    if (!event.isRecurring) {
      throw AsksynkError.badRequest("Calendar event is not recurring");
    }

    const occStart = parseIsoWallClockInTimezone(instanceStart, event.timezone);
    const timezone = input.timezone ?? event.timezone;
    const start = input.start ?? occStart;

    await this.validateTagIds(input.tagIds ?? [], userId);

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

    return this.calendarEventsRepository.detachInstance(
      eventId,
      occStart,
      newEvent,
    );
  }

  @Transactional()
  async splitSeries(
    userId: string,
    eventId: string,
    splitStart: string,
    input: Omit<SplitCalendarEventSeriesInput, "eventId">,
  ): Promise<CalendarEvent> {
    const event = await this.getCalendarEvent(userId, eventId);
    if (!event.isRecurring) {
      throw AsksynkError.badRequest("Calendar event is not recurring");
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
        event.rrule = validateAndNormalizeRrule(
          input.rrule,
          timezone,
          event.start,
        );
      }

      if (input.tagIds !== undefined) {
        await this.validateTagIds(input.tagIds, userId);
        event.tagIds = input.tagIds;
      }

      return this.calendarEventsRepository.update(event);
    }

    // UNTIL = splitDate - 1 day + 1 second (just after previous occurrence)
    const newUntil = new Date(splitDate.getTime() - 86400000 + 1000);
    const truncatedRrule = replaceRruleUntil(event.rrule!, newUntil);

    const newRruleBase = input.rrule ?? event.rrule!;
    const newRrule = validateAndNormalizeRrule(
      newRruleBase,
      timezone,
      splitDate,
    );

    await this.validateTagIds(input.tagIds ?? [], userId);

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

    return this.calendarEventsRepository.splitSeries(
      eventId,
      truncatedRrule,
      newEvent,
    );
  }

  private async validateTagIds(
    tagIds: string[],
    userId: string,
  ): Promise<void> {
    if (!tagIds || tagIds.length === 0) return;
    const foundTags = await this.tagRepository.getByIds(tagIds);
    const allBelongToUser = foundTags.every((t) => t.belongsTo(userId));
    if (foundTags.length !== tagIds.length || !allBelongToUser) {
      throw AsksynkError.badRequest("One or more tags not found");
    }
  }
}
