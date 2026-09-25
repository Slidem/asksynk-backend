import "reflect-metadata";

import { INestApplication, Injectable } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import * as dotenv from "dotenv";
import { eq } from "drizzle-orm";
import * as path from "path";

import { EventsModule } from "@/api/events/events.module";
import { generateId } from "@/api/kernel/id";
import { DB_CLIENT_PROVIDER, DbModule } from "@/api/platform/db/db.module";
import { TxModule } from "@/api/platform/db/tx.module";
import { MAX_ATTEMPTS } from "@/api/platform/events/consumer/durable-delivery.constants";
import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import { TaskDeleted } from "@/api/platform/events/registry/events.registry";
import {
  ConsumerGroup,
  EventOf,
} from "@/api/platform/events/registry/events.types";
import { eventsDeadLetters } from "@/migrations/schema/eventsDeadLetters";
import { eventsOutbox } from "@/migrations/schema/outbox";
import { pollUntil } from "@/test/helpers/pollUntil";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

const POISON = "poison";

const DeadLetterTestConsumerGroup: ConsumerGroup<typeof TaskDeleted> = {
  name: "dead-letter-test",
  orderingKeyFn: (event) => `user:${event.assigneeUserId}`,
};

@Injectable()
class DeadLetterTestHandler {
  readonly calls: string[] = [];

  @EventHandler(TaskDeleted, DeadLetterTestConsumerGroup)
  async onTaskDeleted(payload: EventOf<typeof TaskDeleted>): Promise<void> {
    this.calls.push(payload.taskId);
    if (payload.taskId === POISON) {
      throw new Error("poison event");
    }
  }
}

describe("Durable events dead-lettering (integration)", () => {
  let app: INestApplication;
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let handler: DeadLetterTestHandler;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: path.resolve(__dirname, "../../.env.test"),
        }),
        DbModule,
        TxModule,
        EventsModule,
      ],
      providers: [DeadLetterTestHandler],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    db = module.get(DB_CLIENT_PROVIDER);
    handler = module.get(DeadLetterTestHandler);
  });

  afterAll(async () => {
    await app.close();
  });

  it("dead-letters after MAX_ATTEMPTS and unblocks the key for the next event", async () => {
    const assigneeUserId = generateId();
    const okTaskId = generateId();

    const [poisonRow] = await db
      .insert(eventsOutbox)
      .values({
        eventType: TaskDeleted.name,
        deliveryMode: "durable",
        payload: { taskId: POISON, assigneeUserId },
      })
      .returning({ id: eventsOutbox.id });

    await db.insert(eventsOutbox).values({
      eventType: TaskDeleted.name,
      deliveryMode: "durable",
      payload: { taskId: okTaskId, assigneeUserId },
    });

    const [deadLetter] = await pollUntil(
      () =>
        db
          .select()
          .from(eventsDeadLetters)
          .where(eq(eventsDeadLetters.eventId, poisonRow.id)),
      (rows) => rows.length === 1,
      { timeoutMs: 40000, intervalMs: 250 },
    );

    expect(deadLetter).toMatchObject({
      consumerGroup: DeadLetterTestConsumerGroup.name,
      eventType: TaskDeleted.name,
      attempts: MAX_ATTEMPTS,
      status: "pending",
      payload: { taskId: POISON, assigneeUserId },
    });

    expect(deadLetter.error).toContain("poison event");

    // Same key: only runs once the poison job completed.
    await pollUntil(
      async () => handler.calls,
      (calls) => calls.includes(okTaskId),
      { timeoutMs: 10000 },
    );

    expect(handler.calls.filter((id) => id === POISON)).toHaveLength(
      MAX_ATTEMPTS,
    );

    expect(handler.calls.indexOf(okTaskId)).toBeGreaterThan(
      handler.calls.lastIndexOf(POISON),
    );
  }, 60000);
});
