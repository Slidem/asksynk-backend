import { Injectable } from "@nestjs/common";
import { Transactional, TransactionHost } from "@nestjs-cls/transactional";

import { TxAdapter } from "@/api/platform/db/tx.module";
import {
  JobEnvelope,
  JobPayload,
  QueuedJobDef,
} from "@/api/platform/jobs/job.types";
import { JobHandlersRegistry } from "@/api/platform/jobs/job-handlers.registry";
import { JobScheduler } from "@/api/platform/jobs/job-scheduler";
import { toJobUuid } from "@/api/platform/jobs/job-uuid";
import { MessageBusService } from "@/api/platform/jobs/message-bus/message-bus.service";
import { fromDrizzleTx } from "@/api/platform/jobs/message-bus/pgboss-drizzle-db";

@Injectable()
export class PgBossJobScheduler extends JobScheduler {
  constructor(
    private readonly bus: MessageBusService,
    private readonly registry: JobHandlersRegistry,
    private readonly txHost: TransactionHost<TxAdapter>,
  ) {
    super();
  }

  @Transactional()
  async schedule<T extends JobPayload>(
    job: QueuedJobDef<T>,
    payload: NoInfer<T>,
    { id, runAt }: { id: string; runAt?: Date },
  ): Promise<void> {
    this.registry.assertRegistered(job);
    const data: JobEnvelope = { id, payload };
    await this.bus.sendJob(job.name, data, {
      id: toJobUuid(id),
      startAfter: runAt,
      db: fromDrizzleTx(this.txHost.tx),
    });
  }

  @Transactional()
  async cancel<T extends JobPayload>(
    job: QueuedJobDef<T>,
    id: string,
  ): Promise<void> {
    await this.bus.deleteJob(job.name, toJobUuid(id), {
      db: fromDrizzleTx(this.txHost.tx),
    });
  }
}
