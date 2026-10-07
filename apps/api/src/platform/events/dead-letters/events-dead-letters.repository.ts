import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, desc, eq, gte, inArray, lt, lte, SQL, sql } from "drizzle-orm";

import { TxAdapter } from "@/api/platform/db/tx.module";
import {
  eventsDeadLetters,
  eventsDeadLetterStatus,
} from "@/migrations/schema/eventsDeadLetters";

export type DeadLetter = typeof eventsDeadLetters.$inferSelect;
export type DeadLetterStatus = (typeof eventsDeadLetterStatus.enumValues)[number];

export interface DeadLetterFilter {
  consumerGroup?: string;
  eventType?: string;
  /** Inclusive bounds on `created_at`. */
  from?: Date;
  to?: Date;
}

export interface ListDeadLettersQuery extends DeadLetterFilter {
  status: DeadLetterStatus;
  /** Id of the last row of the previous page. */
  cursor?: string;
  limit: number;
}

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
   * Upsert on (eventId, consumerGroup). A replayed event that fails again goes
   * back to `pending` with the new error; `replay_count` is kept. Also
   * idempotent for a crash between this write and the job completing, which
   * re-runs the terminal attempt.
   */
  async record(input: RecordDeadLetterInput): Promise<void> {
    await this.txHost.tx
      .insert(eventsDeadLetters)
      .values(input)
      .onConflictDoUpdate({
        target: [eventsDeadLetters.eventId, eventsDeadLetters.consumerGroup],
        set: {
          status: "pending",
          error: sql`excluded.error`,
          attempts: sql`excluded.attempts`,
          updatedAt: sql`now()`,
        },
      });
  }

  async findById(id: string): Promise<DeadLetter | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(eventsDeadLetters)
      .where(eq(eventsDeadLetters.id, id))
      .limit(1);
    return row ?? null;
  }

  /** Newest first. */
  async list(q: ListDeadLettersQuery): Promise<DeadLetter[]> {
    const filters = [
      eq(eventsDeadLetters.status, q.status),
      ...filterConditions(q),
    ];
    if (q.cursor) filters.push(lt(eventsDeadLetters.id, q.cursor));

    return this.txHost.tx
      .select()
      .from(eventsDeadLetters)
      .where(and(...filters))
      .orderBy(desc(eventsDeadLetters.id))
      .limit(q.limit);
  }

  /** Locks the pending rows among `ids`, oldest first. Others are absent. */
  async lockPendingByIds(ids: string[]): Promise<DeadLetter[]> {
    return this.txHost.tx
      .select()
      .from(eventsDeadLetters)
      .where(
        and(
          inArray(eventsDeadLetters.id, ids),
          eq(eventsDeadLetters.status, "pending"),
        ),
      )
      .orderBy(eventsDeadLetters.id)
      .for("update");
  }

  /** Locks up to `limit` pending rows matching `filter`, oldest first. */
  async lockPendingMatching(
    filter: DeadLetterFilter,
    limit: number,
  ): Promise<DeadLetter[]> {
    return this.txHost.tx
      .select()
      .from(eventsDeadLetters)
      .where(
        and(eq(eventsDeadLetters.status, "pending"), ...filterConditions(filter)),
      )
      .orderBy(eventsDeadLetters.id)
      .limit(limit)
      .for("update", { skipLocked: true });
  }

  async markReplayed(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.txHost.tx
      .update(eventsDeadLetters)
      .set({
        status: "replayed",
        replayCount: sql`${eventsDeadLetters.replayCount} + 1`,
        updatedAt: sql`now()`,
      })
      .where(inArray(eventsDeadLetters.id, ids));
  }

  async markDiscarded(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.txHost.tx
      .update(eventsDeadLetters)
      .set({ status: "discarded", updatedAt: sql`now()` })
      .where(inArray(eventsDeadLetters.id, ids));
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

function filterConditions(f: DeadLetterFilter): SQL[] {
  const conditions: SQL[] = [];
  if (f.consumerGroup) {
    conditions.push(eq(eventsDeadLetters.consumerGroup, f.consumerGroup));
  }
  if (f.eventType) {
    conditions.push(eq(eventsDeadLetters.eventType, f.eventType));
  }
  if (f.from) conditions.push(gte(eventsDeadLetters.createdAt, f.from));
  if (f.to) conditions.push(lte(eventsDeadLetters.createdAt, f.to));
  return conditions;
}
