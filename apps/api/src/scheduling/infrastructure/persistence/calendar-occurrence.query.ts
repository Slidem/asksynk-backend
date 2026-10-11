import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { sql } from "drizzle-orm";

import { TxAdapter } from "@/api/platform/db/tx.module";
import {
  CalendarOccurrencePort,
  NextOccurrence,
} from "@/api/scheduling/contract/occurrence.port";

@Injectable()
export class DrizzleCalendarOccurrenceQuery extends CalendarOccurrencePort {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {
    super();
  }

  async findNextOccurrenceByTag(
    tagIds: string[],
    after: Date,
  ): Promise<Map<string, NextOccurrence>> {
    if (tagIds.length === 0) return new Map();

    const afterIso = after.toISOString();
    const windowEndIso = new Date(
      after.getTime() + 365 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const rows = await this.txHost.tx.execute<{
      tag_id: string;
      occ_start: string;
      event_id: string;
    }>(sql`
      WITH non_recurring AS (
        SELECT cet.tag_id, e.id AS event_id, e.start AS occ_start
        FROM calendar_events e
        JOIN calendar_event_tags cet ON cet.event_id = e.id
        WHERE cet.tag_id IN (${sql.join(
          tagIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
          AND e.rrule IS NULL
          AND e.start + (e.duration_seconds * INTERVAL '1 second') > ${afterIso}::timestamptz
      ),
      recurring AS (
        SELECT cet.tag_id, e.id AS event_id, occurrence AS occ_start
        FROM calendar_events e
        JOIN calendar_event_tags cet ON cet.event_id = e.id
        CROSS JOIN LATERAL rrule.between(
          e.rrule,
          e.start,
          ${afterIso}::timestamptz - (e.duration_seconds * INTERVAL '1 second'),
          ${windowEndIso}::timestamptz
        ) AS occurrence
        WHERE cet.tag_id IN (${sql.join(
          tagIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
          AND e.rrule IS NOT NULL
          AND occurrence + (e.duration_seconds * INTERVAL '1 second') > ${afterIso}::timestamptz
          AND NOT EXISTS (
            SELECT 1 FROM calendar_event_exceptions ex
            WHERE ex.event_id = e.id AND ex.original_start = occurrence
          )
      ),
      combined AS (
        SELECT * FROM non_recurring
        UNION ALL
        SELECT * FROM recurring
      )
      SELECT DISTINCT ON (tag_id) tag_id, occ_start, event_id
      FROM combined
      ORDER BY tag_id, occ_start ASC, event_id ASC
    `);

    const result = new Map<string, NextOccurrence>();

    for (const row of rows.rows) {
      result.set(row.tag_id, {
        startAt: new Date(row.occ_start),
        eventId: row.event_id,
      });
    }

    return result;
  }
}
