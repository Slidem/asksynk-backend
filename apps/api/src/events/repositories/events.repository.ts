import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { eq, sql } from "drizzle-orm";
import { ContextLogger } from "nestjs-context-logger";

import { Event } from "@/api/events/entities/event.entity";
import { EventInstance } from "@/api/events/models/event-instance.model";
import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { eventExceptions } from "@/migrations/schema/event_exceptions";
import { eventTags } from "@/migrations/schema/event_tags";
import { events } from "@/migrations/schema/events";

type EventRow = typeof events.$inferSelect;

@Injectable()
export class EventsRepository {
  private readonly logger = new ContextLogger(EventsRepository.name);

  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async add(event: Event): Promise<Event> {
    this.logger.info("Adding event", { eventId: event.id });

    await this.txHost.tx.insert(events).values({
      id: event.id,
      calendarId: event.calendarId,
      title: event.title,
      description: event.description,
      location: event.location,
      link: event.link,
      start: event.start,
      durationSeconds: event.durationSeconds,
      allDay: event.allDay,
      timezone: event.timezone,
      rrule: event.rrule,
      color: event.color,
      originalEventId: event.originalEventId,
      originalStart: event.originalStart,
      recurrenceEnd: event.recurrenceEnd,
    });

    if (event.tagIds?.length > 0) {
      await this.txHost.tx
        .insert(eventTags)
        .values(event.tagIds.map((tagId) => ({ eventId: event.id, tagId })));
    }

    return event;
  }

  async getById(id: string): Promise<Event | null> {
    const rows = await this.txHost.tx
      .select({
        event: events,
        tagId: eventTags.tagId,
      })
      .from(events)
      .leftJoin(eventTags, eq(eventTags.eventId, events.id))
      .where(eq(events.id, id));

    if (rows.length === 0) return null;

    return this.mapRowsToEvent(rows);
  }

  async update(event: Event): Promise<Event> {
    this.logger.info("Updating event", { eventId: event.id });

    await this.txHost.tx
      .update(events)
      .set({
        title: event.title,
        description: event.description,
        location: event.location,
        link: event.link,
        start: event.start,
        durationSeconds: event.durationSeconds,
        allDay: event.allDay,
        timezone: event.timezone,
        rrule: event.rrule,
        color: event.color,
        recurrenceEnd: event.recurrenceEnd,
        updatedAt: new Date(),
      })
      .where(eq(events.id, event.id));

    await this.txHost.tx
      .delete(eventTags)
      .where(eq(eventTags.eventId, event.id));

    if (event.tagIds.length > 0) {
      await this.txHost.tx
        .insert(eventTags)
        .values(event.tagIds.map((tagId) => ({ eventId: event.id, tagId })));
    }

    return event;
  }

  async delete(eventId: string): Promise<void> {
    this.logger.info("Deleting event", { eventId });
    await this.txHost.tx.delete(events).where(eq(events.id, eventId));
  }

  async listInWindow(
    calendarId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<EventInstance[]> {
    const result = await this.txHost.tx.execute(sql`
      WITH oneoff AS (
        SELECT
          e.id,
          e.title,
          e.description,
          e.location,
          e.link,
          e.duration_seconds,
          e.all_day,
          e.timezone,
          e.color,
          e.start AS occ_start
        FROM events e
        WHERE e.calendar_id = ${calendarId}
          AND e.rrule IS NULL
          AND e.start < ${windowEnd}::timestamp
          AND e.start + (e.duration_seconds * INTERVAL '1 second') > ${windowStart}::timestamp
      ),
      recurring AS (
        SELECT
          e.id,
          e.title,
          e.description,
          e.location,
          e.link,
          e.duration_seconds,
          e.all_day,
          e.timezone,
          e.color,
          occurrence AS occ_start
        FROM events e
        CROSS JOIN LATERAL rrule.between(e.rrule, e.start, ${windowStart}::timestamp, ${windowEnd}::timestamp) AS occurrence
        WHERE e.calendar_id = ${calendarId}
          AND e.rrule IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM event_exceptions ex
            WHERE ex.event_id = e.id AND ex.original_start = occurrence
          )
      ),
      combined AS (
        SELECT * FROM oneoff
        UNION ALL
        SELECT * FROM recurring
      )
      SELECT
        c.id AS event_id,
        c.title,
        c.description,
        c.location,
        c.link,
        c.duration_seconds,
        c.all_day,
        c.timezone,
        c.color,
        c.occ_start AS instance_start,
        COALESCE(
          array_agg(et.tag_id) FILTER (WHERE et.tag_id IS NOT NULL),
          ARRAY[]::text[]
        ) AS tag_ids
      FROM combined c
      LEFT JOIN event_tags et ON et.event_id = c.id
      GROUP BY c.id, c.title, c.description, c.location, c.link, c.duration_seconds, c.all_day, c.timezone, c.color, c.occ_start
      ORDER BY c.occ_start
    `);

    return (result.rows as Record<string, unknown>[]).map((row) => ({
      eventId: row.event_id as string,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      location: (row.location as string | null) ?? null,
      link: (row.link as string | null) ?? null,
      instanceStart: new Date(row.instance_start as string),
      durationSeconds: Number(row.duration_seconds),
      allDay: Boolean(row.all_day),
      timezone: row.timezone as string,
      color: (row.color as string | null) ?? null,
      tagIds: (row.tag_ids as string[]) ?? [],
    }));
  }

  async addException(eventId: string, occurrenceStart: Date): Promise<void> {
    this.logger.info("Adding event exception", { eventId, occurrenceStart });
    await this.txHost.tx
      .insert(eventExceptions)
      .values({ eventId, originalStart: occurrenceStart })
      .onConflictDoNothing();
  }

  async detachInstance(
    eventId: string,
    occurrenceStart: Date,
    newEvent: Event,
  ): Promise<Event> {
    this.logger.info("Detaching instance", { eventId, occurrenceStart });

    await this.txHost.tx
      .insert(eventExceptions)
      .values({ eventId, originalStart: occurrenceStart })
      .onConflictDoNothing();

    return this.add(newEvent);
  }

  async splitSeries(
    eventId: string,
    newUntilRrule: string,
    newEvent: Event,
  ): Promise<Event> {
    this.logger.info("Splitting series", { eventId });

    await this.txHost.tx
      .update(events)
      .set({ rrule: newUntilRrule, updatedAt: new Date() })
      .where(eq(events.id, eventId));

    return this.add(newEvent);
  }

  private mapRowsToEvent(
    rows: { event: EventRow; tagId: string | null }[],
  ): Event {
    const first = rows[0].event;
    const tagIds = rows
      .map((r) => r.tagId)
      .filter((id): id is string => id !== null);

    return Event.create({
      id: first.id,
      calendarId: first.calendarId,
      title: first.title,
      description: first.description,
      location: first.location,
      link: first.link,
      start: first.start,
      durationSeconds: first.durationSeconds,
      allDay: first.allDay,
      timezone: first.timezone,
      rrule: first.rrule,
      color: first.color,
      originalEventId: first.originalEventId,
      originalStart: first.originalStart,
      recurrenceEnd: first.recurrenceEnd,
      tagIds,
      createdAt: first.createdAt,
      updatedAt: first.updatedAt,
    });
  }
}
