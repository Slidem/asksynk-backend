import { Injectable } from "@nestjs/common";
import { Transactional, TransactionHost } from "@nestjs-cls/transactional";
import { TransactionalAdapterDrizzleOrm } from "@nestjs-cls/transactional-adapter-drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ContextLogger } from "nestjs-context-logger";

import { MessageBusService } from "../message-bus/message-bus.service";
import { fromDrizzleTx } from "./pgboss-drizzle-db";
import { ScheduledJobService, ScheduleJobInput } from "./scheduled-job.service";

@Injectable()
export class PgBossScheduledJobService extends ScheduledJobService {
  private readonly logger = new ContextLogger(PgBossScheduledJobService.name);

  constructor(
    private readonly messageBus: MessageBusService,
    private readonly txHost: TransactionHost<
      TransactionalAdapterDrizzleOrm<NodePgDatabase>
    >,
  ) {
    super();
  }

  /** Routes the job insert through the active tx (or a new one) via pg-boss's drizzle adapter. */
  @Transactional()
  async schedule<T extends object>(
    queue: string,
    input: ScheduleJobInput<T>,
  ): Promise<string | null> {
    return this.messageBus.enqueue(queue, input.payload, {
      startAfter: input.runAt,
      singletonKey: input.jobId,
      db: fromDrizzleTx(this.txHost.tx),
    });
  }

  @Transactional()
  async cancel(queue: string, ref: string): Promise<void> {
    // Best-effort: the job may have already fired or been archived. A stale
    // fire is harmless when handlers re-validate before acting.
    try {
      await this.messageBus.cancel(queue, ref, {
        db: fromDrizzleTx(this.txHost.tx),
      });
    } catch (error) {
      this.logger.debug("scheduled job cancel failed (ignored)", {
        queue,
        ref,
        error,
      });
    }
  }

  async process<T extends object>(
    queue: string,
    handler: (payload: T) => Promise<void>,
  ): Promise<void> {
    await this.messageBus.work<T>(queue, async (data) => handler(data));
  }
}
