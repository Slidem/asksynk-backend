import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ContextLogger } from "nestjs-context-logger";
import PgBoss from "pg-boss";

import { MessageHandler, SendOptions, WorkOptions } from "./message-bus.types";

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
    const boss = this.requireBoss();
    await boss.createQueue(queue);
    return boss.send(queue, data, opts);
  }

  /**
   * Batch-insert pre-built jobs. Ensures referenced queues exist (createQueue
   * is idempotent) before inserting, since pg-boss `insert` does not.
   */
  async insertJobs(jobs: PgBoss.JobInsert[]): Promise<void> {
    if (jobs.length === 0) return;
    const boss = this.requireBoss();
    const queues = new Set(jobs.map((j) => j.name));
    await Promise.all([...queues].map((q) => boss.createQueue(q)));
    await boss.insert(jobs);
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
    await boss.createQueue(queue);
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
   * Subscribes to the specified event and processes incoming messages using the provided handler. The handler will be retried according to the options specified in `opts` in case of failure.
   */
  async subscribe<T extends object>(
    event: string,
    queue: string,
    handler: MessageHandler<T>,
    opts: WorkOptions = {},
  ): Promise<void> {
    const boss = this.requireBoss();

    // idempotent operation; ensures the queue exists before we start working on it
    // we should keep track of created queues in memory to avoid unnecessary calls to pg-boss, but can be done later;
    // TODO: keep track of created queues in memory to avoid unnecessary calls to pg-boss
    await boss.createQueue(queue);
    await boss.subscribe(event, queue);
    await boss.work<T>(
      queue,
      { ...opts, includeMetadata: true },
      async ([job]) => {
        await handler(job.data, job);
      },
    );
  }

  private requireBoss(): PgBoss {
    if (!this.boss) {
      throw new Error("MessageBusService not initialized");
    }
    return this.boss;
  }
}
