import "reflect-metadata";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import { TransactionHost } from "@nestjs-cls/transactional";
import * as dotenv from "dotenv";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import * as path from "path";
import request from "supertest";

import { ERROR_CATALOGUES } from "@/api/error-catalogs.root";
import { EventsModule } from "@/api/events/events.module";
import { TimersService } from "@/api/focus/application/timers.service";
import { TimersRepository } from "@/api/focus/domain/ports/timers.repository";
import { TIMER_TRANSITION_RULES } from "@/api/focus/domain/timer-transition-rules";
import { FocusModule } from "@/api/focus/focus.module";
import { Clock } from "@/api/platform/clock/clock";
import { ClockModule } from "@/api/platform/clock/clock.module";
import { DB_CLIENT_PROVIDER, DbModule } from "@/api/platform/db/db.module";
import { TxAdapter, TxModule } from "@/api/platform/db/tx.module";
import { ErrorsModule } from "@/api/platform/errors/errors.module";
import { AuthUser } from "@/api/platform/http/auth/auth.types";
import { focusSessions } from "@/migrations/schema/focusSessions";
import { eventsOutbox } from "@/migrations/schema/outbox";
import { users } from "@/migrations/schema/users";
import { userTimerLog } from "@/migrations/schema/userTimerLog";
import { userTimers } from "@/migrations/schema/userTimers";
import { MockAuthGuard } from "@/test/helpers/mockAuthGuard";
import { NoopRealtimeModule } from "@/test/helpers/noopRealtimeModule";
import { pollUntil } from "@/test/helpers/pollUntil";
import {
  makeTestUser,
  testUserRegistry,
} from "@/test/helpers/testUserRegistry";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

const JOB_TIMEOUT_MS = 15000;
const HOUR_MS = 3600 * 1000;

const DEFAULT_SETTINGS = {
  focusDurationSeconds: 1500,
  shortBreakDurationSeconds: 300,
  longBreakDurationSeconds: 900,
  longBreakInterval: 4,
  inactivityTimeoutSeconds: 3600,
};

/** Controllable time source overriding the Clock provider. */
class FakeClock {
  private current = new Date();
  now(): Date {
    return new Date(this.current.getTime());
  }
  reset(): void {
    this.current = new Date();
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

interface TimerResponse {
  id: string;
  status: string;
  mode: string | null;
  blockDurationSeconds: number | null;
  remainingSeconds: number | null;
  completesAt: string | null;
  lastActivityAt: string | null;
  suggestedNextMode: string;
  allowedCommands: { command: string; modes?: string[] }[];
  focusBlocksUntilLongBreak: number | null;
  session: {
    id: string;
    startedAt: string;
    completedFocusBlocks: number;
    shortBreaks: number;
    longBreaks: number;
    settings: Record<string, number>;
  } | null;
}

describe("Timers (integration)", () => {
  let app: INestApplication;
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
  let txHost: TransactionHost<TxAdapter>;
  let timersRepo: TimersRepository;
  let timersService: TimersService;
  const clock = new FakeClock();
  // Every user created across the suite; deleted together in afterAll.
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: path.resolve(__dirname, "../../.env.test"),
        }),
        ClockModule,
        DbModule,
        TxModule,
        EventsModule,
        NoopRealtimeModule,
        FocusModule,
        ErrorsModule.forRoot(ERROR_CATALOGUES),
      ],
      providers: [{ provide: APP_GUARD, useClass: MockAuthGuard }],
    })
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    db = module.get(DB_CLIENT_PROVIDER);
    txHost = module.get(TransactionHost);
    timersRepo = module.get(TimersRepository);
    timersService = module.get(TimersService);
  });

  afterAll(async () => {
    // FK cascade removes each user's timers/sessions/settings/log. Delete before
    // app.close() so the still-live db pool handles it.
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    testUserRegistry.clear();
    await app.close();
  });

  beforeEach(() => {
    clock.reset();
  });

  // Creates a fresh user (unique id keeps pg-boss singleton keys isolated) and
  // returns request/poll helpers bound to it, so each test owns its own user
  // and every assertion is scoped to that user.
  async function createUserCtx() {
    const user: AuthUser = makeTestUser();
    testUserRegistry.register(user);
    createdUserIds.push(user.id);
    await db
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: true,
      })
      .onConflictDoNothing();

    const http = () => request(app.getHttpServer());

    async function getTimer(): Promise<TimerResponse> {
      const res = await http()
        .get("/timers")
        .set("x-test-user-id", user.id)
        .expect(200);
      return res.body;
    }

    async function command(
      body: object,
      expectStatus = 200,
    ): Promise<TimerResponse & { error?: string }> {
      const res = await http()
        .patch("/timers")
        .set("x-test-user-id", user.id)
        .send(body)
        .expect(expectStatus);
      return res.body;
    }

    const start = (mode: string) => command({ command: "start", mode });

    async function getSettings(): Promise<Record<string, unknown>> {
      const res = await http()
        .get("/timers/settings")
        .set("x-test-user-id", user.id)
        .expect(200);
      return res.body;
    }

    async function putSettings(
      body: Partial<typeof DEFAULT_SETTINGS> | Record<string, unknown>,
      expectStatus = 200,
    ): Promise<void> {
      await http()
        .put("/timers/settings")
        .set("x-test-user-id", user.id)
        .send({ ...DEFAULT_SETTINGS, ...body })
        .expect(expectStatus);
    }

    async function sessions() {
      return db
        .select()
        .from(focusSessions)
        .where(eq(focusSessions.userId, user.id))
        .orderBy(asc(focusSessions.startedAt));
    }

    async function logRows() {
      return db
        .select()
        .from(userTimerLog)
        .where(eq(userTimerLog.userId, user.id))
        .orderBy(asc(userTimerLog.occurredAt), asc(userTimerLog.createdAt));
    }

    // Timer-log rows are persisted asynchronously by a durable consumer.
    async function awaitLog(transitions: string[]) {
      return pollUntil(
        logRows,
        (rows) =>
          JSON.stringify(rows.map((r) => r.transition).sort()) ===
          JSON.stringify([...transitions].sort()),
        { timeoutMs: 20000, intervalMs: 200 },
      );
    }

    return {
      user,
      getTimer,
      command,
      start,
      getSettings,
      putSettings,
      sessions,
      logRows,
      awaitLog,
    };
  }

  it("returns an idle timer without a session for a fresh user", async () => {
    const { getTimer, sessions } = await createUserCtx();
    const timer = await getTimer();

    expect(timer).toMatchObject({
      status: "idle",
      mode: null,
      remainingSeconds: null,
      session: null,
      focusBlocksUntilLongBreak: null,
      suggestedNextMode: "focus",
      allowedCommands: [{ command: "start", modes: ["focus"] }],
    });
    expect(await sessions()).toHaveLength(0);
  });

  it("exposes default settings and persists updates, incl. a disabled timeout", async () => {
    const { getSettings, putSettings } = await createUserCtx();
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);

    await putSettings({
      focusDurationSeconds: 1200,
      inactivityTimeoutSeconds: null,
    });
    expect(await getSettings()).toMatchObject({
      focusDurationSeconds: 1200,
      inactivityTimeoutSeconds: null,
    });
  });

  it("validates the inactivity timeout bounds (60 min – 24 h)", async () => {
    const { putSettings } = await createUserCtx();
    await putSettings({ inactivityTimeoutSeconds: 1800 }, 400);
    await putSettings({ inactivityTimeoutSeconds: 86401 }, 400);
    await putSettings({ inactivityTimeoutSeconds: 86400 }, 200);
  });

  it("starts focus: opens a session with a settings snapshot and logs it", async () => {
    const { start, putSettings, sessions, awaitLog } = await createUserCtx();
    await putSettings({ focusDurationSeconds: 1200 });

    const timer = await start("focus");
    expect(timer).toMatchObject({
      status: "running",
      mode: "focus",
      blockDurationSeconds: 1200,
      remainingSeconds: 1200,
      focusBlocksUntilLongBreak: 4,
      suggestedNextMode: "short_break",
    });
    expect(timer.completesAt).not.toBeNull();

    const [row] = await sessions();
    expect(row).toMatchObject({
      id: timer.session!.id,
      finishedAt: null,
      endReason: null,
      settings: {
        focusDurationSeconds: 1200,
        shortBreakDurationSeconds: 300,
        longBreakDurationSeconds: 900,
        longBreakInterval: 4,
      },
    });

    const [log] = await awaitLog(["started"]);
    expect(log).toMatchObject({
      sessionId: timer.session!.id,
      mode: "focus",
      durationSeconds: 1200,
      remainingSeconds: 1200,
      reason: null,
    });
  });

  it("pauses (freezing remaining) and resumes", async () => {
    const { start, command, awaitLog } = await createUserCtx();
    await start("focus");

    const paused = await command({ command: "pause" });
    expect(paused.status).toBe("paused");
    expect(paused.remainingSeconds).toBe(1500);
    expect(paused.completesAt).toBeNull();
    expect(paused.allowedCommands.map((c) => c.command)).toEqual([
      "start",
      "resume",
      "stop",
      "reset",
    ]);

    const resumed = await command({ command: "resume" });
    expect(resumed.status).toBe("running");
    expect(resumed.completesAt).not.toBeNull();
    await awaitLog(["started", "paused", "resumed"]);
  });

  it("rejects disallowed transitions (409) and bad payloads (400)", async () => {
    const { command } = await createUserCtx();
    // A new session always starts with focus.
    const res = await command({ command: "start", mode: "short_break" }, 409);
    expect(res.error).toBe("timers.invalid_transition");
    await command({ command: "pause" }, 409);
    await command({ command: "start" }, 400);
    await command({ command: "pause", mode: "focus" }, 400);
    await command({ command: "fly" }, 400);
  });

  it("skips focus → break: counts the focus block and logs skipped + started", async () => {
    const { start, awaitLog } = await createUserCtx();
    await start("focus");
    clock.advance(100 * 1000);

    const timer = await start("short_break");
    expect(timer).toMatchObject({
      status: "running",
      mode: "short_break",
      remainingSeconds: 300,
      focusBlocksUntilLongBreak: 3,
      session: { completedFocusBlocks: 1, shortBreaks: 1, longBreaks: 0 },
    });

    const rows = await awaitLog(["started", "skipped", "started"]);
    const skipped = rows.find((r) => r.transition === "skipped")!;
    expect(skipped).toMatchObject({ mode: "focus", remainingSeconds: 1400 });
  });

  it("rejects skipping to the same mode or between breaks", async () => {
    const { start, command } = await createUserCtx();
    await start("focus");
    await command({ command: "start", mode: "focus" }, 409);
    await start("short_break");
    await command({ command: "start", mode: "long_break" }, 409);
  });

  it("stop abandons the block but keeps the session; next start may be a break", async () => {
    const { start, command, awaitLog } = await createUserCtx();
    const started = await start("focus");

    const stopped = await command({ command: "stop" });
    expect(stopped).toMatchObject({
      status: "idle",
      mode: null,
      session: { id: started.session!.id, completedFocusBlocks: 0 },
    });

    const onBreak = await start("short_break");
    expect(onBreak.session!.id).toBe(started.session!.id);

    const rows = await awaitLog(["started", "stopped", "started"]);
    expect(rows.find((r) => r.transition === "stopped")!.reason).toBeNull();
  });

  it("reset ends the session (no-op without one); the next start opens a new one", async () => {
    const { start, command, sessions, awaitLog } = await createUserCtx();
    const noop = await command({ command: "reset" });
    expect(noop.status).toBe("idle");
    expect(await sessions()).toHaveLength(0);

    const started = await start("focus");
    const reset = await command({ command: "reset" });
    expect(reset).toMatchObject({ status: "idle", session: null });

    const [ended] = await sessions();
    expect(ended).toMatchObject({
      id: started.session!.id,
      endReason: "manual_reset",
    });
    expect(ended.finishedAt).not.toBeNull();

    const next = await start("focus");
    expect(next.session!.id).not.toBe(started.session!.id);

    const rows = await awaitLog(["started", "stopped", "started"]);
    expect(rows.find((r) => r.transition === "stopped")).toMatchObject({
      reason: "manual_reset",
      sessionId: started.session!.id,
    });
  });

  it("completes a running block via the scheduled job", async () => {
    const { start, putSettings, getTimer, awaitLog } = await createUserCtx();
    await putSettings({ focusDurationSeconds: 1 });
    await start("focus");

    const completed = await pollUntil(
      getTimer,
      (t) => t.status === "completed",
      { timeoutMs: JOB_TIMEOUT_MS, intervalMs: 250 },
    );
    expect(completed.remainingSeconds).toBe(0);
    expect(completed.session!.completedFocusBlocks).toBe(1);
    expect(completed.focusBlocksUntilLongBreak).toBe(3);
    await awaitLog(["started", "completed"]);
  });

  it("lazily completes an overdue block on GET, idempotently, stamped at the due time", async () => {
    const { start, getTimer, awaitLog } = await createUserCtx();
    const started = await start("focus");

    clock.advance(1600 * 1000);
    const first = await getTimer();
    expect(first.status).toBe("completed");
    expect(first.lastActivityAt).toBe(started.completesAt);

    const second = await getTimer();
    expect(second.session!.completedFocusBlocks).toBe(1);

    const rows = await awaitLog(["started", "completed"]);
    expect(
      rows.find((r) => r.transition === "completed")!.occurredAt.toISOString(),
    ).toBe(started.completesAt);
  });

  it("suggests a long break when the countdown reaches 0 and resets it on a long break", async () => {
    const { start, putSettings, getTimer } = await createUserCtx();
    await putSettings({ longBreakInterval: 2 });

    await start("focus");
    clock.advance(1501 * 1000);
    await getTimer();
    await start("focus");
    clock.advance(1501 * 1000);

    const done = await getTimer();
    expect(done).toMatchObject({
      status: "completed",
      focusBlocksUntilLongBreak: 0,
      suggestedNextMode: "long_break",
      session: { completedFocusBlocks: 2 },
    });

    const onBreak = await start("long_break");
    expect(onBreak).toMatchObject({
      focusBlocksUntilLongBreak: 2,
      suggestedNextMode: "focus",
      session: { longBreaks: 1 },
    });
  });

  it("keeps a paused timer paused past its original completion time", async () => {
    const { start, command, putSettings, getTimer, logRows } =
      await createUserCtx();
    await putSettings({ focusDurationSeconds: 2 });
    await start("focus");
    await command({ command: "pause" });

    // Advance well past when the (now-cancelled) job would have fired.
    clock.advance(10 * 1000);
    await new Promise((r) => setTimeout(r, 3000));

    expect((await getTimer()).status).toBe("paused");
    expect((await logRows()).some((r) => r.transition === "completed")).toBe(
      false,
    );
  });

  describe("settings change", () => {
    it("ends the session when a duration changes", async () => {
      const { start, putSettings, getTimer, sessions, awaitLog } =
        await createUserCtx();
      await start("focus");

      await putSettings({ focusDurationSeconds: 600 });

      expect(await getTimer()).toMatchObject({ status: "idle", session: null });
      const [ended] = await sessions();
      expect(ended.endReason).toBe("settings_changed");
      const rows = await awaitLog(["started", "stopped"]);
      expect(rows.find((r) => r.transition === "stopped")!.reason).toBe(
        "settings_changed",
      );
    });

    it("keeps the session when only the inactivity timeout changes", async () => {
      const { start, putSettings, getTimer } = await createUserCtx();
      const started = await start("focus");

      await putSettings({ inactivityTimeoutSeconds: 7200 });
      await putSettings({});

      const timer = await getTimer();
      expect(timer.status).toBe("running");
      expect(timer.session!.id).toBe(started.session!.id);
    });
  });

  describe("inactivity", () => {
    it("lazily resets a session paused past the timeout, finished at last activity", async () => {
      const { start, command, getTimer, sessions, awaitLog } =
        await createUserCtx();
      await start("focus");
      clock.advance(60 * 1000);
      const paused = await command({ command: "pause" });

      clock.advance(HOUR_MS + 1000);
      expect(await getTimer()).toMatchObject({ status: "idle", session: null });

      const [ended] = await sessions();
      expect(ended.endReason).toBe("inactivity");
      expect(ended.finishedAt!.toISOString()).toBe(paused.lastActivityAt);

      const rows = await awaitLog(["started", "paused", "stopped"]);
      expect(rows.find((r) => r.transition === "stopped")).toMatchObject({
        reason: "inactivity",
        remainingSeconds: 1440,
      });
    });

    it("a command after the window sees the reset state", async () => {
      const { start, command } = await createUserCtx();
      await start("focus");
      await command({ command: "pause" });

      clock.advance(HOUR_MS + 1000);
      const res = await command({ command: "resume" }, 409);
      expect(res.error).toBe("timers.invalid_transition");
    });

    it("the sweep closes sessions of users who never come back", async () => {
      const { user, start, command, sessions } = await createUserCtx();
      await start("focus");
      await command({ command: "stop" });

      clock.advance(HOUR_MS + 1000);
      await timersService.resetInactiveSessions();

      const [ended] = await sessions();
      expect(ended.endReason).toBe("inactivity");
      const [row] = await db
        .select()
        .from(userTimers)
        .where(eq(userTimers.userId, user.id));
      expect(row).toMatchObject({ status: "idle", currentSessionId: null });
    });

    it("never resets when the timeout is disabled", async () => {
      const { start, command, putSettings, getTimer } = await createUserCtx();
      await putSettings({ inactivityTimeoutSeconds: null });
      await start("focus");
      await command({ command: "pause" });

      clock.advance(48 * HOUR_MS);
      await timersService.resetInactiveSessions();
      expect((await getTimer()).status).toBe("paused");
    });
  });

  it("serves the static transition table with a cache header", async () => {
    const { user } = await createUserCtx();
    const res = await request(app.getHttpServer())
      .get("/timers/transitions")
      .set("x-test-user-id", user.id)
      .expect(200);

    expect(res.headers["cache-control"]).toBe("private, max-age=3600");
    expect(res.body.statuses).toEqual([
      "idle",
      "running",
      "paused",
      "completed",
    ]);
    expect(res.body.triggerOrder).toEqual(["timeout", "inactivity"]);
    expect(res.body.transitions).toHaveLength(TIMER_TRANSITION_RULES.length);
    expect(res.body.transitions[0]).toEqual({
      from: "idle",
      session: "none",
      on: { command: "start", modes: ["focus"] },
      to: "running",
      sessionEffect: "create",
      blockEffect: "start",
    });
    expect(res.body.transitions[1]).toMatchObject({
      on: { command: "reset" },
      noop: true,
    });
  });

  it("rejects saving a stale version with concurrency_conflict, writing nothing", async () => {
    const { user, sessions } = await createUserCtx();
    const now = clock.now();
    const settings = { ...DEFAULT_SETTINGS };

    await expect(
      txHost.withTransaction(async () => {
        const first = await timersRepo.ensure(user.id);
        const stale = await timersRepo.ensure(user.id);
        first.execute({ command: "start", mode: "focus" }, settings, now);
        await timersRepo.save(first);
        stale.execute({ command: "start", mode: "focus" }, settings, now);
        await timersRepo.save(stale);
      }),
    ).rejects.toMatchObject({ code: "core.concurrency_conflict" });
    expect(await sessions()).toHaveLength(0);
  });

  it("rolls back state, sessions and outbox events together", async () => {
    const { user, sessions } = await createUserCtx();
    const now = clock.now();
    await txHost.withTransaction(() => timersRepo.ensure(user.id));

    await expect(
      txHost.withTransaction(async () => {
        const timer = await timersRepo.ensure(user.id);
        timer.execute(
          { command: "start", mode: "focus" },
          DEFAULT_SETTINGS,
          now,
        );
        await timersRepo.save(timer);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    const [row] = await db
      .select()
      .from(userTimers)
      .where(eq(userTimers.userId, user.id));
    expect(row).toMatchObject({ status: "idle", version: 1 });
    expect(await sessions()).toHaveLength(0);

    const outboxRows = await db
      .select({ id: eventsOutbox.id })
      .from(eventsOutbox)
      .where(
        and(
          eq(eventsOutbox.eventType, "timer.lifecycle"),
          sql`${eventsOutbox.payload}->>'userId' = ${user.id}`,
        ),
      );
    expect(outboxRows).toHaveLength(0);
  });
});
