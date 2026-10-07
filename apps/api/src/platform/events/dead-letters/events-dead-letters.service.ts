import { Injectable } from "@nestjs/common";
import { Transactional, TransactionHost } from "@nestjs-cls/transactional";
import { ContextLogger } from "nestjs-context-logger";

import { generateId } from "@/api/kernel/id";
import { TxAdapter } from "@/api/platform/db/tx.module";
import { deadLettersError } from "@/api/platform/events/dead-letters/dead-letters.errors";
import {
  DeadLetter,
  DeadLetterFilter,
  EventsDeadLettersRepository,
  ListDeadLettersQuery,
} from "@/api/platform/events/dead-letters/events-dead-letters.repository";
import { EventHandlersRegistry } from "@/api/platform/events/decorators/event-handlers.registry";
import { MessageBusService } from "@/api/platform/jobs/message-bus/message-bus.service";
import { QueuedJobInsert } from "@/api/platform/jobs/message-bus/message-bus.types";
import { fromDrizzleTx } from "@/api/platform/jobs/message-bus/pgboss-drizzle-db";

export const DEAD_LETTERS_LIST_DEFAULT_LIMIT = 50;
export const DEAD_LETTERS_LIST_MAX_LIMIT = 200;
export const DEAD_LETTERS_BULK_MAX = 500;

const NOT_PENDING = "not found or not pending";

export type DeadLetterTransition = "replayed" | "discarded";

export interface DeadLetterTransitionResult {
  updated: string[];
  skipped: { id: string; reason: string }[];
}

export interface BulkTransitionInput {
  ids?: string[];
  filter?: DeadLetterFilter;
  /** Filter mode only. */
  limit?: number;
}

@Injectable()
export class EventsDeadLettersService {
  private readonly logger = new ContextLogger(EventsDeadLettersService.name);

  constructor(
    private readonly repository: EventsDeadLettersRepository,
    private readonly registry: EventHandlersRegistry,
    private readonly bus: MessageBusService,
    private readonly txHost: TransactionHost<TxAdapter>,
  ) {}

  async list(
    q: Omit<ListDeadLettersQuery, "limit"> & { limit?: number },
  ): Promise<DeadLetter[]> {
    const limit = Math.min(
      q.limit || DEAD_LETTERS_LIST_DEFAULT_LIMIT,
      DEAD_LETTERS_LIST_MAX_LIMIT,
    );
    return this.repository.list({ ...q, limit });
  }

  /** Throws instead of skipping: 404 / 409 / 422. */
  @Transactional()
  async transitionOne(
    id: string,
    status: DeadLetterTransition,
  ): Promise<DeadLetterTransitionResult> {
    const result = await this.transitionByIds([id], status);
    const [skip] = result.skipped;
    if (!skip) return result;

    if (skip.reason === NOT_PENDING) {
      const row = await this.repository.findById(id);
      throw row
        ? deadLettersError("dead_letter_not_pending", {
            id,
            status: row.status,
          })
        : deadLettersError("dead_letter_not_found", { id });
    }
    throw deadLettersError("dead_letter_replay_failed", {
      id,
      reason: skip.reason,
    });
  }

  /** Exactly one of `ids` / `filter`. Filter mode handles up to `limit` rows per call. */
  async transitionBulk(
    input: BulkTransitionInput,
    status: DeadLetterTransition,
  ): Promise<DeadLetterTransitionResult> {
    const { ids, filter } = input;

    if ((ids === undefined) === (filter === undefined)) {
      throw deadLettersError("invalid_bulk_transition", {
        reason: "Send exactly one of `ids` or `filter`",
      });
    }

    if (ids) {
      if (ids.length === 0 || ids.length > DEAD_LETTERS_BULK_MAX) {
        throw deadLettersError("invalid_bulk_transition", {
          reason: `\`ids\` must have 1..${DEAD_LETTERS_BULK_MAX} items`,
        });
      }
      return this.transitionByIds(ids, status);
    }

    if (!Object.values(filter!).some((v) => v !== undefined)) {
      throw deadLettersError("invalid_bulk_transition", {
        reason: "`filter` needs at least one field",
      });
    }
    const limit = Math.min(
      input.limit || DEAD_LETTERS_BULK_MAX,
      DEAD_LETTERS_BULK_MAX,
    );
    return this.transitionMatching(filter!, limit, status);
  }

  @Transactional()
  private async transitionByIds(
    ids: string[],
    status: DeadLetterTransition,
  ): Promise<DeadLetterTransitionResult> {
    const rows = await this.repository.lockPendingByIds(ids);
    const result = await this.apply(rows, status);

    const locked = new Set(rows.map((r) => r.id));
    for (const id of new Set(ids)) {
      if (!locked.has(id)) result.skipped.push({ id, reason: NOT_PENDING });
    }
    return result;
  }

  @Transactional()
  private async transitionMatching(
    filter: DeadLetterFilter,
    limit: number,
    status: DeadLetterTransition,
  ): Promise<DeadLetterTransitionResult> {
    const rows = await this.repository.lockPendingMatching(filter, limit);
    return this.apply(rows, status);
  }

  /** Rows must be locked, pending and ordered by id. */
  private async apply(
    rows: DeadLetter[],
    status: DeadLetterTransition,
  ): Promise<DeadLetterTransitionResult> {
    if (status === "discarded") {
      const ids = rows.map((r) => r.id);
      await this.repository.markDiscarded(ids);
      return { updated: ids, skipped: [] };
    }

    const jobs: QueuedJobInsert[] = [];
    const updated: string[] = [];
    const skipped: DeadLetterTransitionResult["skipped"] = [];

    for (const row of rows) {
      const group = this.registry.getConsumerGroup(row.consumerGroup);
      if (!group) {
        skipped.push({ id: row.id, reason: "unknown consumer group" });
        continue;
      }

      let orderingKey: string;
      try {
        orderingKey = group.orderingKeyFn(row.payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        skipped.push({
          id: row.id,
          reason: `ordering key failed: ${message}`,
        });
        continue;
      }

      // Fresh id: the original job (id = outbox row id) still exists as
      // `completed`, so reusing it would be a silent no-op.
      jobs.push({
        id: generateId(),
        name: group.name,
        data: {
          eventId: row.eventId,
          eventType: row.eventType,
          payload: row.payload,
        },
        singletonKey: orderingKey,
      });
      updated.push(row.id);
    }

    // Same tx as the status flip: both commit or neither.
    await this.bus.insertJobs(jobs, fromDrizzleTx(this.txHost.tx));
    await this.repository.markReplayed(updated);

    this.logger.info("dead letters replayed", {
      replayed: updated.length,
      skipped: skipped.length,
    });

    return { updated, skipped };
  }
}
