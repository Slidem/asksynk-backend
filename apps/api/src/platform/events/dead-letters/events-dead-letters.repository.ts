import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, inArray, sql } from "drizzle-orm";

import { TxAdapter } from "@/api/platform/db/tx.module";
import { eventsDeadLetters } from "@/migrations/schema/eventsDeadLetters";

export interface RecordDeadLetterInput {
  consumerGroup: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  error: string;
  attempts: number;
}

@Injectable()
export class EventsDeadLettersRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  /**
   * Idempotent on (eventId, consumerGroup): a crash between this insert and the
   * job completing re-runs the terminal attempt, which must not duplicate.
   */
  async record(input: RecordDeadLetterInput): Promise<void> {
    await this.txHost.tx
      .insert(eventsDeadLetters)
      .values(input)
      .onConflictDoNothing();
  }

  /**
   * Deletes up to `batchSize` replayed/discarded rows last transitioned before
   * `olderThan` (a PG interval, e.g. "30 days"). Pending rows are never
   * deleted. Returns the number deleted.
   */
  async deleteResolved(olderThan: string, batchSize: number): Promise<number> {
    const db = this.txHost.tx;

    const batch = db
      .select({ id: eventsDeadLetters.id })
      .from(eventsDeadLetters)
      .where(
        and(
          inArray(eventsDeadLetters.status, ["replayed", "discarded"]),
          sql`${eventsDeadLetters.updatedAt} < now() - ${olderThan}::interval`,
        ),
      )
      .limit(batchSize);

    const result = await db
      .delete(eventsDeadLetters)
      .where(inArray(eventsDeadLetters.id, batch));

    return result.rowCount ?? 0;
  }
}
