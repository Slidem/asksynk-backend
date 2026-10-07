import "reflect-metadata";

import { INestApplication, Injectable, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import * as dotenv from "dotenv";
import { eq } from "drizzle-orm";
import * as path from "path";
import request from "supertest";

import { ADMIN_API_KEY_HEADER } from "@/api/auth/admin-api-key.guard";
import { EventsModule } from "@/api/events/events.module";
import { generateId } from "@/api/kernel/id";
import { DB_CLIENT_PROVIDER, DbModule } from "@/api/platform/db/db.module";
import { TxModule } from "@/api/platform/db/tx.module";
import { AllExceptionsFilter } from "@/api/platform/errors/errors.filter";
import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import { TaskDeleted } from "@/api/platform/events/registry/events.registry";
import {
  ConsumerGroup,
  EventOf,
} from "@/api/platform/events/registry/events.types";
import { eventsDeadLetters } from "@/migrations/schema/eventsDeadLetters";
import { pollUntil } from "@/test/helpers/pollUntil";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

const ADMIN_KEY = "test-admin-key-".padEnd(40, "x");
const BASE = "/admin/events/dead-letters";

const ReplayTestConsumerGroup: ConsumerGroup<typeof TaskDeleted> = {
  name: "dead-letter-replay-test",
  orderingKeyFn: (event) => `user:${event.assigneeUserId}`,
};

@Injectable()
class ReplayTestHandler {
  readonly calls: string[] = [];
  readonly failing = new Set<string>();

  @EventHandler(TaskDeleted, ReplayTestConsumerGroup)
  async onTaskDeleted(payload: EventOf<typeof TaskDeleted>): Promise<void> {
    this.calls.push(payload.taskId);
    if (this.failing.has(payload.taskId)) {
      throw new Error("still failing");
    }
  }
}

describe("Dead-letter admin API (integration)", () => {
  let app: INestApplication;
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let handler: ReplayTestHandler;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: path.resolve(__dirname, "../../.env.test"),
          load: [() => ({ ADMIN_API_KEY: ADMIN_KEY })],
        }),
        DbModule,
        TxModule,
        EventsModule,
      ],
      providers: [
        ReplayTestHandler,
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    db = module.get(DB_CLIENT_PROVIDER);
    handler = module.get(ReplayTestHandler);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set(ADMIN_API_KEY_HEADER, ADMIN_KEY),
    patch: (url: string, body: object) =>
      request(app.getHttpServer())
        .patch(url)
        .set(ADMIN_API_KEY_HEADER, ADMIN_KEY)
        .send(body),
  });

  const seed = async (
    opts: {
      consumerGroup?: string;
      status?: "pending" | "replayed" | "discarded";
    } = {},
  ) => {
    const taskId = generateId();
    const [row] = await db
      .insert(eventsDeadLetters)
      .values({
        consumerGroup: opts.consumerGroup ?? ReplayTestConsumerGroup.name,
        eventId: generateId(),
        eventType: TaskDeleted.name,
        payload: { taskId, assigneeUserId: generateId() },
        error: "boom",
        attempts: 3,
        status: opts.status ?? "pending",
      })
      .returning();
    return { ...row, taskId };
  };

  const findRow = async (id: string) => {
    const [row] = await db
      .select()
      .from(eventsDeadLetters)
      .where(eq(eventsDeadLetters.id, id));
    return row;
  };

  describe("auth", () => {
    it("rejects a missing or wrong key", async () => {
      await request(app.getHttpServer()).get(BASE).expect(401);
      await request(app.getHttpServer())
        .get(BASE)
        .set(ADMIN_API_KEY_HEADER, "x".repeat(40))
        .expect(401);
    });
  });

  describe("GET", () => {
    it("filters by group and status, newest first, with a cursor", async () => {
      const group = `list-test-${generateId()}`;
      const a = await seed({ consumerGroup: group });
      const b = await seed({ consumerGroup: group });
      await seed({ consumerGroup: group, status: "discarded" });

      const first = await api()
        .get(`${BASE}?consumerGroup=${group}&limit=1`)
        .expect(200);
      expect(first.body.map((r: { id: string }) => r.id)).toEqual([b.id]);

      const second = await api()
        .get(`${BASE}?consumerGroup=${group}&limit=1&cursor=${b.id}`)
        .expect(200);
      expect(second.body.map((r: { id: string }) => r.id)).toEqual([a.id]);

      const discarded = await api()
        .get(`${BASE}?consumerGroup=${group}&status=discarded`)
        .expect(200);
      expect(discarded.body).toHaveLength(1);
    });
  });

  describe("PATCH /:id", () => {
    it("replays: re-enqueues with a fresh job id and marks it replayed", async () => {
      const row = await seed();

      const res = await api()
        .patch(`${BASE}/${row.id}`, { status: "replayed" })
        .expect(200);
      expect(res.body).toEqual({ updated: [row.id], skipped: [] });

      await pollUntil(
        async () => handler.calls,
        (calls) => calls.includes(row.taskId),
        { timeoutMs: 10000 },
      );
      expect(await findRow(row.id)).toMatchObject({
        status: "replayed",
        replayCount: 1,
      });
    });

    it("a replay that fails again goes back to pending", async () => {
      const row = await seed();
      handler.failing.add(row.taskId);

      await api()
        .patch(`${BASE}/${row.id}`, { status: "replayed" })
        .expect(200);

      const updated = await pollUntil(
        () => findRow(row.id),
        (r) => r.status === "pending",
        { timeoutMs: 40000, intervalMs: 250 },
      );
      expect(updated.replayCount).toBe(1);
      expect(updated.error).toContain("still failing");
      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        row.updatedAt.getTime(),
      );
    }, 60000);

    it("discards without enqueuing", async () => {
      const row = await seed();

      await api()
        .patch(`${BASE}/${row.id}`, { status: "discarded" })
        .expect(200);

      expect((await findRow(row.id)).status).toBe("discarded");
      expect(handler.calls).not.toContain(row.taskId);
    });

    it("404 for an unknown id, 409 when not pending", async () => {
      await api()
        .patch(`${BASE}/${generateId()}`, { status: "replayed" })
        .expect(404);

      const row = await seed({ status: "discarded" });
      await api()
        .patch(`${BASE}/${row.id}`, { status: "replayed" })
        .expect(409);
    });

    it("422 when the consumer group is not registered", async () => {
      const row = await seed({ consumerGroup: "no-such-group" });

      await api()
        .patch(`${BASE}/${row.id}`, { status: "replayed" })
        .expect(422);
      expect((await findRow(row.id)).status).toBe("pending");
    });
  });

  describe("PATCH / (bulk)", () => {
    it("by ids: skips the ones that aren't pending", async () => {
      const pending = await seed();
      const done = await seed({ status: "replayed" });

      const res = await api()
        .patch(BASE, { status: "discarded", ids: [pending.id, done.id] })
        .expect(200);

      expect(res.body).toEqual({
        updated: [pending.id],
        skipped: [{ id: done.id, reason: "not found or not pending" }],
      });
    });

    it("by filter: handles at most `limit` rows, the rest stay pending", async () => {
      const group = `bulk-test-${generateId()}`;
      const rows = [
        await seed({ consumerGroup: group }),
        await seed({ consumerGroup: group }),
        await seed({ consumerGroup: group }),
      ];

      const res = await api()
        .patch(BASE, {
          status: "discarded",
          filter: { consumerGroup: group },
          limit: 2,
        })
        .expect(200);

      // oldest first
      expect(res.body.updated).toEqual([rows[0].id, rows[1].id]);
      expect((await findRow(rows[2].id)).status).toBe("pending");
    });

    it("400 unless exactly one of ids / filter, and filter is non-empty", async () => {
      await api().patch(BASE, { status: "replayed" }).expect(400);
      await api()
        .patch(BASE, {
          status: "replayed",
          ids: [generateId()],
          filter: { consumerGroup: "x" },
        })
        .expect(400);
      await api().patch(BASE, { status: "replayed", filter: {} }).expect(400);
    });
  });
});
