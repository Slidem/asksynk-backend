import {
  CreateEventInput,
  CreateRecurringEventsInput,
  EventTagInput,
  ListEventsInput,
  UpdateEventInput,
  UpdateRecurrenceEventsInput,
} from "@/api/events/events.model";
import { Injectable, NotFoundException } from "@nestjs/common";
import {
  computeOccurrences,
  defaultUntilDate,
} from "@/api/events/recurrence.utils";

import { AsksynkError } from "@/api/common/errors/errors.model";
import { ContextLogger } from "nestjs-context-logger";
import { Event } from "@/api/events/event.entity";
import { EventsRepository } from "@/api/events/events.repository";
import { Recurrence } from "@/api/events/recurrence.entity";
import { TagRepository } from "@/api/tags/tags.repository";
import { Transactional } from "@nestjs-cls/transactional";
import _ from "lodash";

@Injectable()
export class EventsService {
  private readonly logger = new ContextLogger(EventsService.name);

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly tagRepository: TagRepository,
  ) {}

  @Transactional()
  async createEvent(input: CreateEventInput): Promise<Event> {
    this.logger.info("Creating event", { userId: input.userId });
    this.validateEventDates(input.start, input.end);

    if (input.tagIds?.length) {
      await this.validateTimeblockTags(input.tagIds, input.userId);
    }

    const event = await this.eventsRepository.createEvent({
      userId: input.userId,
      name: input.name,
      start: input.start,
      end: input.end,
      recurrenceId: null,
    });

    if (input.tagIds?.length) {
      for (const tagId of input.tagIds) {
        await this.eventsRepository.addTagToEvent(event.id, tagId);
      }
    }

    return event;
  }

  @Transactional()
  async createRecurringEvents(
    input: CreateRecurringEventsInput,
  ): Promise<{ recurrence: Recurrence; events: Event[] }> {
    this.logger.info("Creating recurring events", { userId: input.userId });
    this.validateEventDates(input.start, input.end);

    if (input.tagIds?.length) {
      await this.validateTimeblockTags(input.tagIds, input.userId);
    }

    const until = input.until ?? defaultUntilDate(input.start);
    const durationMs = input.end.getTime() - input.start.getTime();

    const occurrences = computeOccurrences({
      type: input.recurrenceType,
      start: input.start,
      end: input.end,
      until,
    });

    if (occurrences.length === 0) {
      throw AsksynkError.badRequest(
        "No occurrences generated for given params",
      );
    }

    const recurrence = await this.eventsRepository.createRecurrence({
      userId: input.userId,
      type: input.recurrenceType,
      startTime: input.start,
      durationMs,
      until,
    });

    const createdEvents = await this.eventsRepository.createEvents(
      occurrences.map((occ) => ({
        userId: input.userId,
        name: input.name,
        start: occ.start,
        end: occ.end,
        recurrenceId: Number(recurrence.id),
      })),
    );

    if (input.tagIds?.length) {
      const eventIds = createdEvents.map((e) => e.id);
      for (const tagId of input.tagIds) {
        await this.eventsRepository.addTagToEvents(eventIds, tagId);
      }
    }

    return { recurrence, events: createdEvents };
  }

  @Transactional()
  async updateEvent(input: UpdateEventInput): Promise<Event> {
    this.logger.info("Updating event", { eventId: input.eventId });

    const existing = await this.eventsRepository.getEventById(input.eventId);
    if (!existing || !existing.belongsTo(input.userId)) {
      throw new NotFoundException("Event not found");
    }

    if (input.start || input.end) {
      const start = input.start ?? existing.start;
      const end = input.end ?? existing.end;
      this.validateEventDates(start, end);
    }

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.start !== undefined) updateData.start = input.start;
    if (input.end !== undefined) updateData.end = input.end;
    if (input.removeRecurrence) updateData.recurrenceId = null;

    return this.eventsRepository.updateEventById(input.eventId, updateData);
  }

  @Transactional()
  async deleteEvent(userId: string, eventId: string): Promise<Event> {
    this.logger.info("Deleting event", { userId, eventId });

    const existing = await this.eventsRepository.getEventById(eventId);
    if (!existing || !existing.belongsTo(userId)) {
      throw new NotFoundException("Event not found");
    }

    return this.eventsRepository.deleteEventById(eventId);
  }

  @Transactional()
  async getEventById(userId: string, eventId: string): Promise<Event> {
    const event = await this.eventsRepository.getEventById(eventId);
    if (!event || !event.belongsTo(userId)) {
      throw new NotFoundException("Event not found");
    }
    return event;
  }

  @Transactional()
  async listEvents(userId: string, input: ListEventsInput): Promise<Event[]> {
    return this.eventsRepository.listEventsByUserIdWithFilters(userId, {
      startDate: input.startDate,
      endDate: input.endDate,
      tagIds: input.tagIds,
      hasRecurrence: input.hasRecurrence,
      orderBy: input.orderBy ?? "start",
      orderDirection: input.orderDirection ?? "asc",
      limit: input.limit,
      offset: input.offset,
    });
  }

  // --- Recurrence ops ---

  @Transactional()
  async getRecurrenceWithEvents(
    userId: string,
    recurrenceId: string,
  ): Promise<{ recurrence: Recurrence; events: Event[] }> {
    const recurrence =
      await this.eventsRepository.getRecurrenceById(recurrenceId);
    if (!recurrence || !recurrence.belongsTo(userId)) {
      throw new NotFoundException("Recurrence not found");
    }

    const events =
      await this.eventsRepository.getEventsByRecurrenceId(recurrenceId);

    return { recurrence, events };
  }

  @Transactional()
  async updateRecurrenceEvents(
    input: UpdateRecurrenceEventsInput,
  ): Promise<{ recurrence: Recurrence; events: Event[] }> {
    this.logger.info("Updating recurrence events", {
      recurrenceId: input.recurrenceId,
    });

    const recurrence = await this.eventsRepository.getRecurrenceById(
      input.recurrenceId,
    );
    if (!recurrence || !recurrence.belongsTo(input.userId)) {
      throw new NotFoundException("Recurrence not found");
    }

    const now = new Date();
    const hasDateChanges = input.start !== undefined || input.end !== undefined;

    if (hasDateChanges) {
      const newStart = input.start ?? recurrence.startTime;
      const newEnd =
        input.end ?? new Date(newStart.getTime() + recurrence.durationMs);
      this.validateEventDates(newStart, newEnd);

      const newDurationMs = newEnd.getTime() - newStart.getTime();

      // Delete future events
      await this.eventsRepository.deleteFutureEventsByRecurrenceId(
        input.recurrenceId,
        now,
      );

      // Recompute from now to until
      const occurrences = computeOccurrences({
        type: recurrence.type,
        start:
          newStart > now
            ? newStart
            : this.nextOccurrenceAfter(now, newStart, recurrence.type),
        end: newEnd,
        until: recurrence.until,
      });

      if (occurrences.length > 0) {
        const eventName =
          input.name ?? (await this.getRecurrenceEventName(input.recurrenceId));

        await this.eventsRepository.createEvents(
          occurrences.map((occ) => ({
            userId: input.userId,
            name: eventName,
            start: occ.start,
            end: occ.end,
            recurrenceId: Number(input.recurrenceId),
          })),
        );
      }

      // Update recurrence metadata
      await this.eventsRepository.updateRecurrenceById(input.recurrenceId, {
        startTime: newStart,
        durationMs: newDurationMs,
      });
    } else if (input.name !== undefined) {
      await this.eventsRepository.updateFutureEventsByRecurrenceId(
        input.recurrenceId,
        now,
        { name: input.name },
      );
    }

    return this.getRecurrenceWithEvents(input.userId, input.recurrenceId);
  }

  @Transactional()
  async deleteRecurrenceEvents(
    userId: string,
    recurrenceId: string,
  ): Promise<void> {
    this.logger.info("Deleting recurrence and events", { recurrenceId });

    const recurrence =
      await this.eventsRepository.getRecurrenceById(recurrenceId);
    if (!recurrence || !recurrence.belongsTo(userId)) {
      throw new NotFoundException("Recurrence not found");
    }

    await this.eventsRepository.deleteEventsByRecurrenceId(recurrenceId);
    await this.eventsRepository.deleteRecurrenceById(recurrenceId);
  }

  // --- Private helpers ---
  private validateEventDates(start: Date, end: Date): void {
    if (start >= end) {
      throw AsksynkError.badRequest("Event start must be before end");
    }
  }

  private async validateTimeblockTags(
    tagIds: string[],
    userId: string,
  ): Promise<void> {
    const existingTags = await this.tagRepository.getTagsByIds(tagIds);
    const existingTagIds = existingTags.map((t) => String(t.id));
    const tagsNotFound = _.difference(tagIds, existingTagIds);

    if (existingTags.some((t) => !t.belongsTo(userId))) {
      throw new NotFoundException("One or more tags not found");
    }

    if (tagsNotFound.length > 0) {
      throw new NotFoundException(`Tags not found: ${tagsNotFound.join(", ")}`);
    }
  }

  private async getRecurrenceEventName(recurrenceId: string): Promise<string> {
    const events =
      await this.eventsRepository.getEventsByRecurrenceId(recurrenceId);
    return events[0]?.name ?? "Untitled";
  }

  private nextOccurrenceAfter(
    after: Date,
    referenceStart: Date,
    type: string,
  ): Date {
    const cursor = new Date(referenceStart);
    while (cursor <= after) {
      switch (type) {
        case "daily":
        case "weekdays":
          cursor.setDate(cursor.getDate() + 1);
          break;
        case "weekly":
          cursor.setDate(cursor.getDate() + 7);
          break;
        case "bi-weekly":
          cursor.setDate(cursor.getDate() + 14);
          break;
        case "monthly":
          cursor.setMonth(cursor.getMonth() + 1);
          break;
      }
    }
    return cursor;
  }
}
