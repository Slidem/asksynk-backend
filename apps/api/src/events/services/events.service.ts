import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import { pick, pickBy } from "lodash";

import { AsksynkError } from "@/api/common/errors/errors.model";
import { Calendar } from "@/api/events/entities/calendar.entity";
import { Event } from "@/api/events/entities/event.entity";
import { CreateEventInput } from "@/api/events/models/create-event.model";
import { DetachInstanceInput } from "@/api/events/models/detach-instance.model";
import { EventInstance } from "@/api/events/models/event-instance.model";
import { ListEventsInput } from "@/api/events/models/list-events.model";
import { SplitSeriesInput } from "@/api/events/models/split-series.model";
import { UpdateEventInput } from "@/api/events/models/update-event.model";
import { CalendarRepository } from "@/api/events/repositories/calendar.repository";
import { EventsRepository } from "@/api/events/repositories/events.repository";
import {
  parseIsoWallClockInTimezone,
  replaceRruleUntil,
  validateAndNormalizeRrule,
} from "@/api/events/utils/recurrence.utils";
import { TagRepository } from "@/api/tags/repositories/tags.repository";
import { generateId } from "@/shared/id";

function mergeNullable<T>(
  input: T | null | undefined,
  fallback: T | null,
): T | null {
  return input !== undefined ? (input ?? null) : fallback;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly eventsRepository: EventsRepository,
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
  async createEvent(userId: string, input: CreateEventInput): Promise<Event> {
    const calendar = await this.ensureCalendar(userId);

    const rrule = input.rrule
      ? validateAndNormalizeRrule(input.rrule, input.timezone, input.start)
      : null;

    await this.validateTagIds(input.tagIds ?? [], userId);

    const event = Event.create({
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

    return this.eventsRepository.add(event);
  }

  @Transactional()
  async getEvent(userId: string, eventId: string): Promise<Event> {
    const event = await this.eventsRepository.getById(eventId);
    if (!event) {
      throw AsksynkError.notFound("Event not found");
    }

    const calendar = await this.calendarRepository.getById(event.calendarId);
    if (!calendar || !calendar.belongsTo(userId)) {
      throw AsksynkError.notFound("Event not found");
    }

    return event;
  }

  @Transactional()
  async listEvents(
    userId: string,
    input: ListEventsInput,
  ): Promise<EventInstance[]> {
    const calendar = await this.calendarRepository.getByUserId(userId);
    if (!calendar) return [];

    return this.eventsRepository.listInWindow(
      calendar.id,
      input.windowStart,
      input.windowEnd,
    );
  }

  @Transactional()
  async updateEvent(userId: string, input: UpdateEventInput): Promise<Event> {
    const event = await this.getEvent(userId, input.eventId);

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

    return this.eventsRepository.update(event);
  }

  @Transactional()
  async deleteEvent(userId: string, eventId: string): Promise<void> {
    await this.getEvent(userId, eventId);
    await this.eventsRepository.delete(eventId);
  }

  @Transactional()
  async addException(
    userId: string,
    eventId: string,
    occurrenceStart: string,
  ): Promise<void> {
    const event = await this.getEvent(userId, eventId);
    if (!event.isRecurring) {
      throw AsksynkError.badRequest("Event is not recurring");
    }
    const occStart = parseIsoWallClockInTimezone(
      occurrenceStart,
      event.timezone,
    );
    await this.eventsRepository.addException(eventId, occStart);
  }

  @Transactional()
  async detachInstance(
    userId: string,
    eventId: string,
    instanceStart: string,
    input: Omit<DetachInstanceInput, "eventId" | "occurrenceStart">,
  ): Promise<Event> {
    const event = await this.getEvent(userId, eventId);
    if (!event.isRecurring) {
      throw AsksynkError.badRequest("Event is not recurring");
    }

    const occStart = parseIsoWallClockInTimezone(instanceStart, event.timezone);
    const timezone = input.timezone ?? event.timezone;
    const start = input.start ?? occStart;

    await this.validateTagIds(input.tagIds ?? [], userId);

    const newEvent = Event.create({
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

    return this.eventsRepository.detachInstance(eventId, occStart, newEvent);
  }

  @Transactional()
  async splitSeries(
    userId: string,
    eventId: string,
    splitStart: string,
    input: Omit<SplitSeriesInput, "eventId" | "splitStart">,
  ): Promise<Event> {
    const event = await this.getEvent(userId, eventId);
    if (!event.isRecurring) {
      throw AsksynkError.badRequest("Event is not recurring");
    }

    const splitDate = parseIsoWallClockInTimezone(splitStart, event.timezone);
    const timezone = input.timezone ?? event.timezone;

    const newUntil = new Date(splitDate.getTime() - 1000);
    const truncatedRrule = replaceRruleUntil(event.rrule!, newUntil);

    const newRruleBase = input.rrule ?? event.rrule!;
    const newRrule = validateAndNormalizeRrule(
      newRruleBase,
      timezone,
      splitDate,
    );

    await this.validateTagIds(input.tagIds ?? [], userId);

    const newEvent = Event.create({
      id: generateId(),
      calendarId: event.calendarId,
      title: input.title ?? event.title,
      description: mergeNullable(input.description, event.description),
      location: mergeNullable(input.location, event.location),
      link: mergeNullable(input.link, event.link),
      start: splitDate,
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

    return this.eventsRepository.splitSeries(eventId, truncatedRrule, newEvent);
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
