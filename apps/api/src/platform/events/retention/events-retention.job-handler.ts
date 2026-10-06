import { Injectable } from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";

import { EventsDeadLettersRepository } from "@/api/platform/events/dead-letters/events-dead-letters.repository";
import { EventsOutboxRepository } from "@/api/platform/events/outbox/events-outbox.repository";
import { CronJob } from "@/api/platform/jobs/cron-job.decorator";

const RETENTION = "30 days";
const BATCH_SIZE = 1000;

/** Prunes terminal outbox rows and resolved dead letters older than RETENTION. */
@Injectable()
export class EventsRetentionJobHandler {
  private readonly logger = new ContextLogger(EventsRetentionJobHandler.name);

  constructor(
    private readonly outbox: EventsOutboxRepository,
    private readonly deadLetters: EventsDeadLettersRepository,
  ) {}

  @CronJob({ name: "events.retention", cron: "0 3 * * *" })
  async prune(): Promise<void> {
    const outbox = await drain((n) => this.outbox.deleteTerminal(RETENTION, n));
    const deadLetters = await drain((n) =>
      this.deadLetters.deleteResolved(RETENTION, n),
    );

    this.logger.info("events retention done", { outbox, deadLetters });
  }
}

/** Batched so each DELETE stays short; the first run may have a large backlog. */
async function drain(
  deleteBatch: (batchSize: number) => Promise<number>,
): Promise<number> {
  let total = 0;
  let deleted: number;

  do {
    deleted = await deleteBatch(BATCH_SIZE);
    total += deleted;
  } while (deleted === BATCH_SIZE);

  return total;
}
