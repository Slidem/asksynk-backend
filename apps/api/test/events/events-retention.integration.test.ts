import "reflect-metadata";

import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import * as dotenv from "dotenv";
import { inArray, SQL, sql } from "drizzle-orm";
import * as path from "path";

import { generateId } from "@/api/kernel/id";
import { DB_CLIENT_PROVIDER, DbModule } from "@/api/platform/db/db.module";
import { TxModule } from "@/api/platform/db/tx.module";
import { EventsDeadLettersRepository } from "@/api/platform/events/dead-letters/events-dead-letters.repository";
import { EventsOutboxRepository } from "@/api/platform/events/outbox/events-outbox.repository";
import { EventsRetentionJobHandler } from "@/api/platform/events/retention/events-retention.job-handler";
import { eventsDeadLetters } from "@/migrations/schema/eventsDeadLetters";
import { eventsOutbox } from "@/migrations/schema/outbox";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

// No handlers for it, so nothing in the test DB dispatches these rows.
const EVENT_TYPE = "test.retention";
const OLD_ID = sql`uuidv7(-interval '31 days')`;
const RECENT_ID = sql`uuidv7(-interval '1 day')`;

describe("Events retention (integration)", () => {
  let app: INestApplication;
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let handler: EventsRetentionJobHandler;
  let outboxRepo: EventsOutboxRepository;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: path.resolve(__dirname, "../../.env.test"),
        }),
        DbModule,
        TxModule,
      ],
      providers: [
        EventsRetentionJobHandler,
        EventsOutboxRepository,
        EventsDeadLettersRepository,
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    db = module.get(DB_CLIENT_PROVIDER);
    handler = module.get(EventsRetentionJobHandler);
    outboxRepo = module.get(EventsOutboxRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  const insertOutbox = async (
    row: Omit<Partial<typeof eventsOutbox.$inferInsert>, "id"> & {
      id: SQL;
      deliveryMode: "realtime" | "durable" | "dual";
    },
  ): Promise<string> => {
    const [{ id }] = await db
      .insert(eventsOutbox)
      .values({ eventType: EVENT_TYPE, payload: {}, ...row })
      .returning({ id: eventsOutbox.id });
    return id;
  };

  const insertDeadLetter = async (
    status: "pending" | "replayed" | "discarded",
    daysAgo: number,
  ): Promise<string> => {
    const [{ id }] = await db
      .insert(eventsDeadLetters)
      .values({
        consumerGroup: "retention-test",
        eventId: generateId(),
        eventType: EVENT_TYPE,
        payload: {},
        error: "boom",
        attempts: 3,
        status,
        updatedAt: sql`now() - make_interval(days => ${daysAgo})`,
      })
      .returning({ id: eventsDeadLetters.id });
    return id;
  };

  const outboxIds = async (ids: string[]) =>
    (
      await db
        .select({ id: eventsOutbox.id })
        .from(eventsOutbox)
        .where(inArray(eventsOutbox.id, ids))
    ).map((r) => r.id);

  const deadLetterIds = async (ids: string[]) =>
    (
      await db
        .select({ id: eventsDeadLetters.id })
        .from(eventsDeadLetters)
        .where(inArray(eventsDeadLetters.id, ids))
    ).map((r) => r.id);

  it("prunes only old terminal outbox rows and old resolved dead letters", async () => {
    const oldRealtime = await insertOutbox({
      id: OLD_ID,
      deliveryMode: "realtime",
    });
    const oldDispatched = await insertOutbox({
      id: OLD_ID,
      deliveryMode: "durable",
      dispatchedAt: new Date(),
    });
    const oldFailed = await insertOutbox({
      id: OLD_ID,
      deliveryMode: "dual",
      failedAt: new Date(),
      error: "build failed",
    });
    const oldUndispatched = await insertOutbox({
      id: OLD_ID,
      deliveryMode: "durable",
    });
    const recentDispatched = await insertOutbox({
      id: RECENT_ID,
      deliveryMode: "durable",
      dispatchedAt: new Date(),
    });

    const oldReplayed = await insertDeadLetter("replayed", 31);
    const oldDiscarded = await insertDeadLetter("discarded", 31);
    const oldPending = await insertDeadLetter("pending", 31);
    const recentReplayed = await insertDeadLetter("replayed", 1);

    await handler.prune();

    expect(
      await outboxIds([
        oldRealtime,
        oldDispatched,
        oldFailed,
        oldUndispatched,
        recentDispatched,
      ]),
    ).toEqual(expect.arrayContaining([oldUndispatched, recentDispatched]));
    expect(
      await outboxIds([oldRealtime, oldDispatched, oldFailed]),
    ).toHaveLength(0);

    expect(
      await deadLetterIds([
        oldReplayed,
        oldDiscarded,
        oldPending,
        recentReplayed,
      ]),
    ).toEqual(expect.arrayContaining([oldPending, recentReplayed]));
    expect(await deadLetterIds([oldReplayed, oldDiscarded])).toHaveLength(0);
  });

  it("deletes in batches of at most batchSize", async () => {
    const ids = [
      await insertOutbox({ id: OLD_ID, deliveryMode: "realtime" }),
      await insertOutbox({ id: OLD_ID, deliveryMode: "realtime" }),
      await insertOutbox({ id: OLD_ID, deliveryMode: "realtime" }),
    ];

    expect(await outboxRepo.deleteTerminal("30 days", 2)).toBe(2);
    expect(await outboxRepo.deleteTerminal("30 days", 2)).toBe(1);
    expect(await outboxRepo.deleteTerminal("30 days", 2)).toBe(0);
    expect(await outboxIds(ids)).toHaveLength(0);
  });
});
