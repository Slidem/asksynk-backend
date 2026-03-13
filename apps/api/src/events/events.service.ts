import {
  CreateEventInput,
  DetachInstanceInput,
  EventInstance,
  ListEventsInput,
  SplitSeriesInput,
  UpdateEventInput,
} from "@/api/events/events.model";
import {
  isValidIanaTimezone,
  parseIsoCompact,
  replaceRruleUntil,
  validateAndNormalizeRrule,
} from "@/api/events/recurrence.utils";
import { pick, pickBy } from "lodash";

import { AsksynkError } from "@/api/common/errors/errors.model";
import { Calendar } from "@/api/events/calendar.entity";
import { CalendarRepository } from "@/api/events/calendar.repository";
import { Event } from "@/api/events/event.entity";
import { EventsRepository } from "@/api/events/events.repository";
import { Injectable } from "@nestjs/common";
import { TagRepository } from "@/api/tags/tags.repository";
import { Transactional } from "@nestjs-cls/transactional";
import { generateId } from "@/shared/id";

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

    if (!isValidIanaTimezone(input.timezone)) {
      throw AsksynkError.badRequest(`Invalid timezone: ${input.timezone}`);
    }

    const rrule = input.rrule
      ? validateAndNormalizeRrule(input.rrule, input.timezone, input.start)
      : null;

    if (input.tagIds && input.tagIds.length > 0) {
      const foundTags = await this.tagRepository.getByIds(input.tagIds);
      const allBelongToUser = foundTags.every((t) => t.belongsTo(userId));
      if (foundTags.length !== input.tagIds.length || !allBelongToUser) {
        throw AsksynkError.badRequest("One or more tags not found");
      }
    }

    // TODO: we should try and add defaults directly inside the event; Also there has to be a cleaner way... we can't always have the x ?? y everytime we create an event.
    //  Simply having defaults for undefined values should work
    const event = Event.create({
      id: input.id,
      calendarId: calendar.id,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      link: input.link ?? null,
      start: input.start,
      durationSeconds: input.durationSeconds,
      allDay: input.allDay ?? false,
      timezone: input.timezone,
      rrule,
      color: input.color ?? null,
      originalEventId: null,
      originalStart: null,
      recurrenceEnd: null,
      tagIds: input.tagIds ?? [],
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

    if (input.timezone && !isValidIanaTimezone(input.timezone)) {
      throw AsksynkError.badRequest(`Invalid timezone: ${input.timezone}`);
    }

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

    // TODO: extract extract fetching and validating tags into a function, maybe even extracting this into the tags service and just reusing the tags service.. this is kind o repeating
    if (input.tagIds !== undefined) {
      if (input.tagIds.length > 0) {
        const foundTags = await this.tagRepository.getByIds(input.tagIds);
        const allBelongToUser = foundTags.every((t) => t.belongsTo(userId));
        if (foundTags.length !== input.tagIds.length || !allBelongToUser) {
          throw AsksynkError.badRequest("One or more tags not found");
        }
      }
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
    const occStart = parseIsoCompact(occurrenceStart);
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

    const occStart = parseIsoCompact(instanceStart);
    const timezone = input.timezone ?? event.timezone;
    const start = input.start ?? occStart;

    if (input.timezone && !isValidIanaTimezone(input.timezone)) {
      throw AsksynkError.badRequest(`Invalid timezone: ${input.timezone}`);
    }

    if (input.tagIds && input.tagIds.length > 0) {
      const foundTags = await this.tagRepository.getByIds(input.tagIds);
      const allBelongToUser = foundTags.every((t) => t.belongsTo(userId));
      if (foundTags.length !== input.tagIds.length || !allBelongToUser) {
        throw AsksynkError.badRequest("One or more tags not found");
      }
    }

    const newEvent = Event.create({
      id: generateId(),
      calendarId: event.calendarId,
      title: input.title ?? event.title,
      // TODO: very ugly stuff here, can't we make it cleaner ?
      description:
        input.description !== undefined
          ? (input.description ?? null)
          : event.description,
      location:
        input.location !== undefined
          ? (input.location ?? null)
          : event.location,
      link: input.link !== undefined ? (input.link ?? null) : event.link,
      start,
      durationSeconds: input.durationSeconds ?? event.durationSeconds,
      allDay: event.allDay,
      timezone,
      rrule: null,
      color: input.color !== undefined ? (input.color ?? null) : event.color,
      originalEventId: event.id,
      originalStart: occStart,
      recurrenceEnd: null,
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

    const splitDate = parseIsoCompact(splitStart);
    const timezone = input.timezone ?? event.timezone;

    if (input.timezone && !isValidIanaTimezone(input.timezone)) {
      throw AsksynkError.badRequest(`Invalid timezone: ${input.timezone}`);
    }

    const newUntil = new Date(splitDate.getTime() - 1000);
    const truncatedRrule = replaceRruleUntil(event.rrule!, newUntil);

    const newRruleBase = input.rrule ?? event.rrule!;
    const newRrule = validateAndNormalizeRrule(
      newRruleBase,
      timezone,
      splitDate,
    );

    if (input.tagIds && input.tagIds.length > 0) {
      const foundTags = await this.tagRepository.getByIds(input.tagIds);
      const allBelongToUser = foundTags.every((t) => t.belongsTo(userId));
      if (foundTags.length !== input.tagIds.length || !allBelongToUser) {
        throw AsksynkError.badRequest("One or more tags not found");
      }
    }

    const newEvent = Event.create({
      id: generateId(),
      calendarId: event.calendarId,
      title: input.title ?? event.title,
      description:
        input.description !== undefined
          ? (input.description ?? null)
          : event.description,
      location:
        input.location !== undefined
          ? (input.location ?? null)
          : event.location,
      link: input.link !== undefined ? (input.link ?? null) : event.link,
      start: splitDate,
      durationSeconds: input.durationSeconds ?? event.durationSeconds,
      allDay: event.allDay,
      timezone,
      rrule: newRrule,
      color: input.color !== undefined ? (input.color ?? null) : event.color,
      originalEventId: event.id,
      originalStart: splitDate,
      recurrenceEnd: null,
      tagIds: input.tagIds ?? event.tagIds,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.eventsRepository.splitSeries(eventId, truncatedRrule, newEvent);
  }
}
