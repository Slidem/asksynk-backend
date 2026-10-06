import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";

import { TxAdapter } from "@/api/platform/db/tx.module";
import { eventsOutbox } from "@/migrations/schema/outbox";

@Injectable()
export class EventsOutboxRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  /**
   * Deletes up to `batchSize` terminal rows (realtime, dispatched or failed)
   * older than `olderThan` (a PG interval, e.g. "30 days"). Undispatched
   * durable rows are never deleted. Returns the number deleted.
   *
   * Ids are uuidv7, so the age cut is a PK range: `uuidv7(-interval)` builds
   * the boundary id.
   */
  async deleteTerminal(olderThan: string, batchSize: number): Promise<number> {
    const db = this.txHost.tx;

    const batch = db
      .select({ id: eventsOutbox.id })
      .from(eventsOutbox)
      .where(
        and(
          sql`${eventsOutbox.id} < uuidv7(-${olderThan}::interval)`,
          or(
            eq(eventsOutbox.deliveryMode, "realtime"),
            isNotNull(eventsOutbox.dispatchedAt),
            isNotNull(eventsOutbox.failedAt),
          ),
        ),
      )
      .orderBy(eventsOutbox.id)
      .limit(batchSize);

    const result = await db
      .delete(eventsOutbox)
      .where(inArray(eventsOutbox.id, batch));

    return result.rowCount ?? 0;
  }
}
