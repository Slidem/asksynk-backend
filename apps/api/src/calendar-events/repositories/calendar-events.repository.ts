import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { eq, sql } from "drizzle-orm";
import { ContextLogger } from "nestjs-context-logger";

import { CalendarEvent } from "@/api/calendar-events/entities/calendar-event.entity";
import { CalendarEventInstance } from "@/api/calendar-events/models/calendar-event-instance.model";
import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { calendarEvents } from "@/migrations/schema/calendarEvents";
import { calendarEventExceptions } from "@/migrations/schema/calendarEventsExceptions";
import { calendarEventTags } from "@/migrations/schema/calendarEventTags";

import { getInstanceId } from "../utils/instanceId.utils";

type CalendarEventRow = typeof calendarEvents.$inferSelect;

@Injectable()
export class CalendarEventsRepository {
  private readonly logger = new ContextLogger(CalendarEventsRepository.name);

  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async add(event: CalendarEvent): Promise<CalendarEvent> {
    this.logger.info("Adding calendar event", { eventId: event.id });

    await this.txHost.tx.insert(calendarEvents).values({
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
        .insert(calendarEventTags)
        .values(event.tagIds.map((tagId) => ({ eventId: event.id, tagId })));
    }

    return event;
  }

  async getById(id: string): Promise<CalendarEvent | null> {
    const rows = await this.txHost.tx
      .select({
        event: calendarEvents,
        tagId: calendarEventTags.tagId,
      })
      .from(calendarEvents)
      .leftJoin(
        calendarEventTags,
        eq(calendarEventTags.eventId, calendarEvents.id),
      )
      .where(eq(calendarEvents.id, id));

    if (rows.length === 0) return null;

    return this.mapRowsToEvent(rows);
  }

  async update(event: CalendarEvent): Promise<CalendarEvent> {
    this.logger.info("Updating calendar event", { eventId: event.id });

    await this.txHost.tx
      .update(calendarEvents)
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
      .where(eq(calendarEvents.id, event.id));

    await this.txHost.tx
      .delete(calendarEventTags)
      .where(eq(calendarEventTags.eventId, event.id));

    if (event.tagIds.length > 0) {
      await this.txHost.tx
        .insert(calendarEventTags)
        .values(event.tagIds.map((tagId) => ({ eventId: event.id, tagId })));
    }

    return event;
  }

  async delete(eventId: string): Promise<void> {
    this.logger.info("Deleting calendar event", { eventId });
    await this.txHost.tx
      .delete(calendarEvents)
      .where(eq(calendarEvents.id, eventId));
  }

  async listInWindow(
    calendarId: string,
    windowStart: Date,
    windowEnd: Date,
    tagIds?: string[],
  ): Promise<CalendarEventInstance[]> {
    const windowStartIso = windowStart.toISOString();
    const windowEndIso = windowEnd.toISOString();

    const tagFilterFragment = tagIds?.length
      ? sql`AND EXISTS (
            SELECT 1 FROM calendar_event_tags et2
            WHERE et2.event_id = c.id AND et2.tag_id IN (${sql.join(
              tagIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})
          )`
      : sql``;

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
          e.rrule,
          e.start AS occ_start
        FROM calendar_events e
        WHERE e.calendar_id = ${calendarId}
          AND e.rrule IS NULL
          AND e.start < ${windowEndIso}::timestamp
          AND e.start + (e.duration_seconds * INTERVAL '1 second') > ${windowStartIso}::timestamp
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
          e.rrule,
          occurrence AS occ_start
        FROM calendar_events e
        CROSS JOIN LATERAL rrule.between(e.rrule, e.start, ${windowStartIso}::timestamp, ${windowEndIso}::timestamp) AS occurrence
        WHERE e.calendar_id = ${calendarId}
          AND e.rrule IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM calendar_event_exceptions ex
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
        c.rrule,
        c.occ_start AS instance_start,
        COALESCE(
          array_agg(et.tag_id) FILTER (WHERE et.tag_id IS NOT NULL),
          ARRAY[]::uuid[]
        ) AS tag_ids
      FROM combined c
      LEFT JOIN calendar_event_tags et ON et.event_id = c.id
      WHERE TRUE ${tagFilterFragment}
      GROUP BY c.id, c.title, c.description, c.location, c.link, c.duration_seconds, c.all_day, c.timezone, c.color, c.occ_start, c.rrule
      ORDER BY c.occ_start
    `);

    return (result.rows as Record<string, unknown>[]).map((row) => {
      const instanceStart = new Date((row.instance_start as string) + "Z");

      return {
        eventId: row.event_id as string,
        instanceId: getInstanceId(row.event_id as string, instanceStart),
        title: row.title as string,
        description: (row.description as string | null) ?? null,
        location: (row.location as string | null) ?? null,
        link: (row.link as string | null) ?? null,
        instanceStart: instanceStart,
        durationSeconds: Number(row.duration_seconds),
        allDay: Boolean(row.all_day),
        timezone: row.timezone as string,
        color: (row.color as string | null) ?? null,
        rrule: (row.rrule as string | null) ?? null,
        tagIds: (row.tag_ids as string[]) ?? [],
      };
    });
  }

  async addException(eventId: string, occurrenceStart: Date): Promise<void> {
    this.logger.info("Adding calendar event exception", {
      eventId,
      occurrenceStart,
    });
    await this.txHost.tx
      .insert(calendarEventExceptions)
      .values({ eventId, originalStart: occurrenceStart })
      .onConflictDoNothing();
  }

  async detachInstance(
    eventId: string,
    occurrenceStart: Date,
    newEvent: CalendarEvent,
  ): Promise<CalendarEvent> {
    this.logger.info("Detaching calendar event instance", {
      eventId,
      occurrenceStart,
    });

    await this.txHost.tx
      .insert(calendarEventExceptions)
      .values({ eventId, originalStart: occurrenceStart })
      .onConflictDoNothing();

    return this.add(newEvent);
  }

  async splitSeries(
    eventId: string,
    newUntilRrule: string,
    newEvent: CalendarEvent,
  ): Promise<CalendarEvent> {
    this.logger.info("Splitting calendar event series", { eventId });

    await this.txHost.tx
      .update(calendarEvents)
      .set({ rrule: newUntilRrule, updatedAt: new Date() })
      .where(eq(calendarEvents.id, eventId));

    return this.add(newEvent);
  }

  private mapRowsToEvent(
    rows: { event: CalendarEventRow; tagId: string | null }[],
  ): CalendarEvent {
    const first = rows[0].event;
    const tagIds = rows
      .map((r) => r.tagId)
      .filter((id): id is string => id !== null);

    return CalendarEvent.create({
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
