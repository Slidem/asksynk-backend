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

  async enqueue<T extends object>(
    queue: string,
    data: T,
    opts: SendOptions = {},
  ): Promise<string | null> {
    const boss = this.requireBoss();
    await boss.createQueue(queue);
    return boss.send(queue, data, opts);
  }

  async work<T extends object>(
    queue: string,
    handler: MessageHandler<T>,
    opts: WorkOptions = {},
  ): Promise<void> {
    const boss = this.requireBoss();
    await boss.createQueue(queue);
    await boss.work<T>(queue, opts, async ([job]) => {
      await handler(job.data);
    });
  }

  async publish<T extends object>(event: string, data: T): Promise<void> {
    const boss = this.requireBoss();
    await boss.publish(event, data);
  }

  async subscribe<T extends object>(
    event: string,
    queue: string,
    handler: MessageHandler<T>,
    opts: WorkOptions = {},
  ): Promise<void> {
    const boss = this.requireBoss();
    await boss.createQueue(queue);
    await boss.subscribe(event, queue);
    await boss.work<T>(queue, opts, async ([job]) => {
      await handler(job.data);
    });
  }

  private requireBoss(): PgBoss {
    if (!this.boss) {
      throw new Error("MessageBusService not initialized");
    }
    return this.boss;
  }
}
