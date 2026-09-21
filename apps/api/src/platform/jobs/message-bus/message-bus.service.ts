import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ContextLogger } from "nestjs-context-logger";
import { Db, JobInsert, PgBoss } from "pg-boss";

import { PgError, PgErrorCode } from "@/api/platform/db/pg-error-codes";
import {
  CancelOptions,
  MessageHandler,
  QueuedJobInsert,
  SendOptions,
  WorkOptions,
} from "@/api/platform/jobs/message-bus/message-bus.types";

/** Max retries when createQueue hits a deadlock during concurrent partition creation. */
const QUEUE_CREATE_MAX_RETRIES = 5;
/** Base backoff in ms; per-attempt delay is full-jittered and grows exponentially. */
const QUEUE_CREATE_BACKOFF_BASE_MS = 50;

@Injectable()
export class MessageBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new ContextLogger(MessageBusService.name);
  private boss: PgBoss | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const connectionString =
      this.configService.getOrThrow<string>("DATABASE_URL");

    this.boss = new PgBoss({
      connectionString,
      schema: "pgboss",
    });

    this.boss.on("error", (error) =>
      this.logger.error("pg-boss error", { error }),
    );

    await this.boss.start();
    this.logger.info("pg-boss started");
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) {
      return;
    }

    await this.boss.stop({ graceful: true });
    this.boss = null;
  }

  /**
   * Sends a message to the specified queue. If the queue does not exist, it will be created automatically. The message will be retried according to the options specified in `opts` in case of failure.
   *
   * @param queue
   * @param data
   * @param opts
   * @returns
   */
  async enqueue<T extends object>(
    queue: string,
    data: T,
    opts: SendOptions = {},
  ): Promise<string | null> {
    await this.ensureQueue(queue);
    return this.requireBoss().send(queue, data, opts);
  }

  /**
   * Cancels a previously enqueued job by id. Only affects jobs still pending
   * (not yet active/completed); cancelling a missing or already-active job
   * throws, so callers that treat cancellation as best-effort should catch.
   *
   * @param queue
   * @param jobId
   * @param opts pass `db` (e.g. `fromDrizzle(tx, sql)`) to cancel inside the caller's transaction.
   */
  async cancel(
    queue: string,
    jobId: string,
    opts: CancelOptions = {},
  ): Promise<void> {
    await this.requireBoss().cancel(queue, jobId, opts);
  }

  /**
   * Batch-insert pre-built jobs. Ensures referenced queues exist (createQueue
   * is idempotent) before inserting, since pg-boss `insert` does not.
   */
  async insertJobs(jobs: QueuedJobInsert[], db?: Db): Promise<void> {
    if (jobs.length === 0) return;
    const boss = this.requireBoss();

    // pg-boss v12 insert() targets a single queue; group jobs by queue name.
    const byQueue = new Map<string, JobInsert[]>();

    for (const { name, ...job } of jobs) {
      const list = byQueue.get(name) ?? [];
      list.push(job);
      byQueue.set(name, list);
    }

    await Promise.all(
      [...byQueue].map(([queue, queueJobs]) =>
        boss.insert(queue, queueJobs, { db }),
      ),
    );
  }

  /**
   *
   * Listens for messages on the specified queue and processes them using the provided handler. If the queue does not exist, it will be created automatically. The handler will be retried according to the options specified in `opts` in case of failure.
   *
   * @param queue
   * @param handler
   * @param opts
   */
  async work<T extends object>(
    queue: string,
    handler: MessageHandler<T>,
    opts: WorkOptions = {},
  ): Promise<void> {
    const boss = this.requireBoss();

    // idempotent operation; ensures the queue exists before we start working on it
    // we should keep track of created queues in memory to avoid unnecessary calls to pg-boss, but can be done later;
    // TODO: keep track of created queues in memory to avoid unnecessary calls to pg-boss
    await this.ensureQueue(queue);
    await boss.work<T>(
      queue,
      { ...opts, includeMetadata: true },
      async ([job]) => {
        await handler(job.data, job);
      },
    );
  }

  /**
   * Publishes an event to all subscribers of the specified event. The event will be retried according to the options specified in `opts` in case of failure.
   *
   * @param event
   * @param data
   */
  async publish<T extends object>(event: string, data: T): Promise<void> {
    await this.requireBoss().publish(event, data);
  }

  /**
   * Registers a recurring (cron) schedule for a queue. pg-boss runs a single
   * clock-monitoring instance, so the job is enqueued on exactly one API
   * instance per tick — no leader election needed. Idempotent: re-registering
   * the same queue updates its schedule. Consume the resulting jobs with
   * {@link work}.
   */
  async scheduleCron<T extends object>(
    queue: string,
    cron: string,
    data?: T,
    opts: SendOptions = {},
  ): Promise<void> {
    const boss = this.requireBoss();
    await this.ensureQueue(queue);
    await boss.schedule(queue, cron, data ?? {}, opts);
  }

  /** Removes a previously registered cron schedule. */
  async unscheduleCron(queue: string): Promise<void> {
    await this.requireBoss().unschedule(queue);
  }

  private requireBoss(): PgBoss {
    if (!this.boss) {
      throw new Error("MessageBusService not initialized");
    }
    return this.boss;
  }

  /**
   * Ensures a queue exists in the message bus, creating it if necessary.
   */
  public async ensureQueue(
    queue: string,
    isFifoQueue: boolean = false,
  ): Promise<void> {
    const boss = this.requireBoss();
    const opt = isFifoQueue ? { policy: "key_strict_fifo" } : {};

    for (let attempt = 0; ; attempt++) {
      try {
        await boss.createQueue(queue, opt);
        return;
      } catch (error) {
        const isDeadlock =
          (error as PgError)?.code === PgErrorCode.DEADLOCK_DETECTED;

        if (!isDeadlock || attempt >= QUEUE_CREATE_MAX_RETRIES) {
          throw error;
        }

        const delayMs = Math.floor(
          Math.random() * QUEUE_CREATE_BACKOFF_BASE_MS * 2 ** attempt,
        );
        this.logger.warn("createQueue deadlock, retrying", {
          queue,
          attempt: attempt + 1,
          delayMs,
        });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}
