import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
} from "drizzle-orm";
import { eventTags, events, recurrences } from "@/migrations/schema/events";

import { ContextLogger } from "nestjs-context-logger";
import { Event } from "@/api/events/event.entity";
import { Injectable } from "@nestjs/common";
import { Recurrence } from "@/api/events/recurrence.entity";
import { RecurrenceType } from "@/api/events/events.model";
import { TransactionHost } from "@nestjs-cls/transactional";
import { TxAdapter } from "@/api/common/db/tx.module";

type EventRow = typeof events.$inferSelect;
type RecurrenceRow = typeof recurrences.$inferSelect;

type CreateEvent = Omit<EventRow, "id" | "createdAt" | "updatedAt">;
type UpdateEvent = Partial<Omit<CreateEvent, "userId">>;
type CreateRecurrence = Omit<RecurrenceRow, "id" | "createdAt" | "updatedAt">;

@Injectable()
export class EventsRepository {
  private readonly logger = new ContextLogger(EventsRepository.name);

  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  // --- Recurrence methods ---
  async createRecurrence(data: CreateRecurrence): Promise<Recurrence> {
    this.logger.info("Creating recurrence", { data });
    const [created] = await this.txHost.tx
      .insert(recurrences)
      .values(data)
      .returning();
    return this.mapDbRowToRecurrence(created);
  }

  async getRecurrenceById(recurrenceId: string): Promise<Recurrence | null> {
    const result = await this.txHost.tx
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, Number(recurrenceId)))
      .then((r) => r[0]);

    return result ? this.mapDbRowToRecurrence(result) : null;
  }

  async deleteRecurrenceById(recurrenceId: string): Promise<void> {
    this.logger.info("Deleting recurrence", { recurrenceId });
    await this.txHost.tx
      .delete(recurrences)
      .where(eq(recurrences.id, Number(recurrenceId)));
  }

  async updateRecurrenceById(
    recurrenceId: string,
    data: Partial<Pick<RecurrenceRow, "until" | "startTime" | "durationMs">>,
  ): Promise<Recurrence> {
    const [updated] = await this.txHost.tx
      .update(recurrences)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(recurrences.id, Number(recurrenceId)))
      .returning();
    return this.mapDbRowToRecurrence(updated);
  }

  // --- Event methods ---
  async createEvent(data: CreateEvent): Promise<Event> {
    this.logger.info("Creating event", { name: data.name });
    const [created] = await this.txHost.tx
      .insert(events)
      .values(data)
      .returning();
    return this.mapDbRowToEvent(created);
  }

  async createEvents(data: CreateEvent[]): Promise<Event[]> {
    if (data.length === 0) return [];
    this.logger.info("Bulk creating events", { count: data.length });
    const created = await this.txHost.tx
      .insert(events)
      .values(data)
      .returning();
    return created.map((row) => this.mapDbRowToEvent(row));
  }

  async getEventById(eventId: string): Promise<Event | null> {
    const result = await this.txHost.tx
      .select()
      .from(events)
      .where(eq(events.id, Number(eventId)))
      .then((r) => r[0]);

    return result ? this.mapDbRowToEvent(result) : null;
  }

  async updateEventById(eventId: string, data: UpdateEvent): Promise<Event> {
    this.logger.info("Updating event", { eventId });
    const [updated] = await this.txHost.tx
      .update(events)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(events.id, Number(eventId)))
      .returning();
    return this.mapDbRowToEvent(updated);
  }

  async deleteEventById(eventId: string): Promise<Event> {
    this.logger.info("Deleting event", { eventId });
    const [deleted] = await this.txHost.tx
      .delete(events)
      .where(eq(events.id, Number(eventId)))
      .returning();
    return this.mapDbRowToEvent(deleted);
  }

  async listEventsByUserIdWithFilters(
    userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      tagIds?: string[];
      hasRecurrence?: boolean;
      orderBy?: "start" | "createdAt";
      orderDirection?: "asc" | "desc";
      limit?: number;
      offset?: number;
    },
  ): Promise<Event[]> {
    const filters = [eq(events.userId, userId)];

    if (options.startDate && options.endDate) {
      filters.push(lte(events.start, options.endDate));
      filters.push(gte(events.end, options.startDate));
    } else if (options.startDate) {
      filters.push(gte(events.end, options.startDate));
    } else if (options.endDate) {
      filters.push(lte(events.start, options.endDate));
    }

    if (options.hasRecurrence !== undefined) {
      filters.push(
        options.hasRecurrence
          ? isNotNull(events.recurrenceId)
          : isNull(events.recurrenceId),
      );
    }

    const orderColumn =
      options.orderBy === "createdAt" ? events.createdAt : events.start;
    const orderFn = options.orderDirection === "asc" ? asc : desc;

    if (options.tagIds && options.tagIds.length > 0) {
      const numericTagIds = options.tagIds.map(Number);
      const rows = await this.txHost.tx
        .selectDistinctOn([events.id])
        .from(events)
        .innerJoin(eventTags, eq(events.id, eventTags.eventId))
        .where(and(...filters, inArray(eventTags.tagId, numericTagIds)))
        .orderBy(events.id, orderFn(orderColumn))
        .limit(options.limit ?? 100)
        .offset(options.offset ?? 0);

      return rows.map((r) => this.mapDbRowToEvent(r.events));
    }

    const query = this.txHost.tx
      .select()
      .from(events)
      .where(and(...filters))
      .orderBy(orderFn(orderColumn));

    if (options.limit !== undefined) {
      query.limit(options.limit);
    }
    if (options.offset !== undefined) {
      query.offset(options.offset);
    }

    const result = await query;
    return result.map((row) => this.mapDbRowToEvent(row));
  }

  async getEventsByRecurrenceId(recurrenceId: string): Promise<Event[]> {
    const results = await this.txHost.tx
      .select()
      .from(events)
      .where(eq(events.recurrenceId, Number(recurrenceId)))
      .orderBy(asc(events.start));
    return results.map((row) => this.mapDbRowToEvent(row));
  }

  async deleteEventsByRecurrenceId(recurrenceId: string): Promise<void> {
    this.logger.info("Deleting all events for recurrence", { recurrenceId });
    await this.txHost.tx
      .delete(events)
      .where(eq(events.recurrenceId, Number(recurrenceId)));
  }

  async deleteFutureEventsByRecurrenceId(
    recurrenceId: string,
    afterDate: Date,
  ): Promise<void> {
    this.logger.info("Deleting future events for recurrence", {
      recurrenceId,
      afterDate,
    });
    await this.txHost.tx
      .delete(events)
      .where(
        and(
          eq(events.recurrenceId, Number(recurrenceId)),
          gte(events.start, afterDate),
        ),
      );
  }

  async updateFutureEventsByRecurrenceId(
    recurrenceId: string,
    afterDate: Date,
    data: Pick<UpdateEvent, "name">,
  ): Promise<void> {
    this.logger.info("Updating future events for recurrence", {
      recurrenceId,
    });
    await this.txHost.tx
      .update(events)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(events.recurrenceId, Number(recurrenceId)),
          gte(events.start, afterDate),
        ),
      );
  }

  // --- EventTag methods ---

  async addTagToEvent(eventId: string, tagId: string): Promise<void> {
    this.logger.info("Adding tag to event", { eventId, tagId });
    await this.txHost.tx.insert(eventTags).values({
      eventId: Number(eventId),
      tagId: Number(tagId),
    });
  }

  async addTagToEvents(eventIds: string[], tagId: string): Promise<void> {
    if (eventIds.length === 0) return;
    await this.txHost.tx.insert(eventTags).values(
      eventIds.map((eventId) => ({
        eventId: Number(eventId),
        tagId: Number(tagId),
      })),
    );
  }

  async removeTagFromEvent(eventId: string, tagId: string): Promise<void> {
    this.logger.info("Removing tag from event", { eventId, tagId });
    await this.txHost.tx
      .delete(eventTags)
      .where(
        and(
          eq(eventTags.eventId, Number(eventId)),
          eq(eventTags.tagId, Number(tagId)),
        ),
      );
  }

  async getEventTagIds(eventId: string): Promise<string[]> {
    const results = await this.txHost.tx
      .select({ tagId: eventTags.tagId })
      .from(eventTags)
      .where(eq(eventTags.eventId, Number(eventId)));
    return results.map((r) => String(r.tagId));
  }

  async eventHasTag(eventId: string, tagId: string): Promise<boolean> {
    const result = await this.txHost.tx
      .select()
      .from(eventTags)
      .where(
        and(
          eq(eventTags.eventId, Number(eventId)),
          eq(eventTags.tagId, Number(tagId)),
        ),
      )
      .then((r) => r[0]);
    return !!result;
  }

  // --- Mappers ---

  private mapDbRowToEvent(row: EventRow): Event {
    return Event.create({
      id: String(row.id),
      userId: row.userId,
      name: row.name,
      start: row.start,
      end: row.end,
      recurrenceId: row.recurrenceId ? String(row.recurrenceId) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private mapDbRowToRecurrence(row: RecurrenceRow): Recurrence {
    return Recurrence.create({
      id: String(row.id),
      userId: row.userId,
      type: row.type as RecurrenceType,
      startTime: row.startTime,
      durationMs: row.durationMs,
      until: row.until,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
