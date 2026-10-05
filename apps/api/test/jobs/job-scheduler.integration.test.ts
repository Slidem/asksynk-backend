import "reflect-metadata";

import { INestApplication, Injectable } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { TransactionHost } from "@nestjs-cls/transactional";
import * as dotenv from "dotenv";
import { sql } from "drizzle-orm";
import * as path from "path";

import { DB } from "@/api/platform/db/db";
import { DB_CLIENT_PROVIDER, DbModule } from "@/api/platform/db/db.module";
import { TxAdapter, TxModule } from "@/api/platform/db/tx.module";
import { defineCronJob, defineJob } from "@/api/platform/jobs/define-job";
import { JobContext } from "@/api/platform/jobs/job.types";
import { JobHandler } from "@/api/platform/jobs/job-handler.decorator";
import { JobHandlersRegistry } from "@/api/platform/jobs/job-handlers.registry";
import { JobScheduler } from "@/api/platform/jobs/job-scheduler";
import { toJobUuid } from "@/api/platform/jobs/job-uuid";
import { JobsModule } from "@/api/platform/jobs/jobs.module";
import { MessageBusService } from "@/api/platform/jobs/message-bus/message-bus.service";
import { pollUntil } from "@/test/helpers/pollUntil";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

type N = { n: number };

const RecordJob = defineJob<N>({
  name: "test.jobs.record",
  options: { pollingIntervalSeconds: 0.5 },
});
const FlakyJob = defineJob<N>({
  name: "test.jobs.flaky",
  options: { pollingIntervalSeconds: 0.5 },
});
// never fires during the test
const IdleCron = defineCronJob({
  name: "test.jobs.idle_cron",
  cron: "0 0 1 1 *",
});
const Unhandled = defineJob<N>({ name: "test.jobs.unhandled" });

const IN_AN_HOUR = () => new Date(Date.now() + 60 * 60 * 1000);

@Injectable()
class TestJobHandlers {
  readonly recorded: [N, JobContext][] = [];
  readonly flakyAttempts: number[] = [];

  @JobHandler(RecordJob)
  async record(payload: N, ctx: JobContext): Promise<void> {
    this.recorded.push([payload, ctx]);
    return Promise.resolve();
  }

  @JobHandler(FlakyJob)
  async flaky(_payload: N, ctx: JobContext): Promise<void> {
    this.flakyAttempts.push(ctx.attempt);
    if (ctx.attempt === 1) throw new Error("flaky");
    return Promise.resolve();
  }

  @JobHandler(IdleCron)
  async idle(): Promise<void> {
    return Promise.resolve();
  }
}

describe("JobScheduler (integration)", () => {
  let app: INestApplication;
  let db: DB;
  let scheduler: JobScheduler;
  let registry: JobHandlersRegistry;
  let bus: MessageBusService;
  let txHost: TransactionHost<TxAdapter>;
  let handlers: TestJobHandlers;

  const jobRows = async (name: string, id: string) => {
    const result = await db.execute(
      sql`select state from pgboss.job where name = ${name} and id = ${toJobUuid(id)}::uuid`,
    );
    return result.rows as { state: string }[];
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: path.resolve(__dirname, "../../.env.test"),
        }),
        DbModule,
        TxModule,
        JobsModule,
      ],
      providers: [TestJobHandlers],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    db = module.get(DB_CLIENT_PROVIDER);
    scheduler = module.get(JobScheduler);
    registry = module.get(JobHandlersRegistry);
    bus = module.get(MessageBusService);
    txHost = module.get(TransactionHost);
    handlers = module.get(TestJobHandlers);
  });

  afterAll(async () => {
    await app.close();
  });

  it("runs a scheduled job with payload, caller id and attempt", async () => {
    await scheduler.schedule(RecordJob, { n: 1 }, { id: "rec-1" });

    await pollUntil(
      async () => handlers.recorded.length,
      (len) => len >= 1,
    );

    expect(handlers.recorded[0]).toEqual([
      { n: 1 },
      { jobId: "rec-1", attempt: 1 },
    ]);
  });

  it("makes a repeat id a no-op", async () => {
    const runAt = IN_AN_HOUR();
    await scheduler.schedule(RecordJob, { n: 2 }, { id: "rec-2", runAt });
    await scheduler.schedule(RecordJob, { n: 2 }, { id: "rec-2", runAt });

    expect(await jobRows(RecordJob.name, "rec-2")).toEqual([
      { state: "created" },
    ]);
  });

  it("frees the id on cancel", async () => {
    await scheduler.schedule(
      RecordJob,
      { n: 3 },
      { id: "rec-3", runAt: IN_AN_HOUR() },
    );
    await scheduler.cancel(RecordJob, "rec-3");

    expect(await jobRows(RecordJob.name, "rec-3")).toEqual([]);

    await scheduler.schedule(
      RecordJob,
      { n: 3 },
      { id: "rec-3", runAt: IN_AN_HOUR() },
    );

    expect(await jobRows(RecordJob.name, "rec-3")).toEqual([
      { state: "created" },
    ]);
  });

  it("discards the schedule when the caller's tx rolls back", async () => {
    await expect(
      txHost.withTransaction(async () => {
        await scheduler.schedule(
          RecordJob,
          { n: 4 },
          { id: "rec-4", runAt: IN_AN_HOUR() },
        );
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    expect(await jobRows(RecordJob.name, "rec-4")).toEqual([]);
  });

  it("joins the caller's tx on cancel", async () => {
    await scheduler.schedule(
      RecordJob,
      { n: 5 },
      { id: "rec-5", runAt: IN_AN_HOUR() },
    );

    await expect(
      txHost.withTransaction(async () => {
        await scheduler.cancel(RecordJob, "rec-5");
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    expect(await jobRows(RecordJob.name, "rec-5")).toEqual([
      { state: "created" },
    ]);
  });

  it("rejects a def with no registered handler", async () => {
    await expect(
      scheduler.schedule(Unhandled, { n: 6 }, { id: "unhandled-1" }),
    ).rejects.toThrow("No handler registered");
  });

  it("retries a failed job", async () => {
    await scheduler.schedule(FlakyJob, { n: 7 }, { id: "flaky-1" });

    await pollUntil(
      async () => [...handlers.flakyAttempts],
      (attempts) => attempts.length >= 2,
    );

    expect(handlers.flakyAttempts.slice(0, 2)).toEqual([1, 2]);
  });

  it("unschedules crons with no def in code on reconcile", async () => {
    await bus.scheduleCron("test.jobs.stale", "0 0 1 1 *");

    await registry.reconcileCrons();

    const names = (await bus.getSchedules()).map((s) => s.name);
    expect(names).toContain(IdleCron.name);
    expect(names).not.toContain("test.jobs.stale");
  });
});
