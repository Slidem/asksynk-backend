import "reflect-metadata";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import * as dotenv from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import * as path from "path";
import request from "supertest";

import { AuthUser } from "@/api/auth/auth.types";
import { Clock } from "@/api/common/clock/clock";
import { ClockModule } from "@/api/common/clock/clock.module";
import { EventsModule } from "@/api/events/events.module";
import {
  DB_CLIENT_PROVIDER,
  DbModule,
} from "@/api/infrastructure/db/db.module";
import { TxModule } from "@/api/infrastructure/db/tx.module";
import { TimersModule } from "@/api/timers/timers.module";
import { users } from "@/migrations/schema/users";
import { userTimerEvents } from "@/migrations/schema/userTimerEvents";
import { MockAuthGuard } from "@/test/helpers/mockAuthGuard";
import { pollUntil } from "@/test/helpers/pollUntil";
import {
  makeTestUser,
  testUserRegistry,
} from "@/test/helpers/testUserRegistry";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

const JOB_TIMEOUT_MS = 15000;

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
  sessionType: string | null;
  sessionDurationSeconds: number | null;
  remainingSeconds: number | null;
  completesAt: string | null;
  completedFocusSessions: number;
}

describe("Timers (integration)", () => {
  let app: INestApplication;
  let db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle>;
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
        TimersModule,
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
  });

  afterAll(async () => {
    // FK cascade removes each user's timers/settings/events. Delete before
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

    async function getTimer(): Promise<TimerResponse> {
      const res = await request(app.getHttpServer())
        .get("/timers")
        .set("x-test-user-id", user.id)
        .expect(200);
      return res.body;
    }

    async function patchTimer(
      body: object,
      expectStatus = 200,
    ): Promise<TimerResponse> {
      const res = await request(app.getHttpServer())
        .patch("/timers")
        .set("x-test-user-id", user.id)
        .send(body)
        .expect(expectStatus);
      return res.body;
    }

    async function getSettings(): Promise<Record<string, number>> {
      const res = await request(app.getHttpServer())
        .get("/timers/settings")
        .set("x-test-user-id", user.id)
        .expect(200);
      return res.body;
    }

    async function putSettings(body: object): Promise<void> {
      await request(app.getHttpServer())
        .put("/timers/settings")
        .set("x-test-user-id", user.id)
        .send(body)
        .expect(200);
    }

    async function getSuggestion(): Promise<Record<string, unknown>> {
      const res = await request(app.getHttpServer())
        .get("/timers/suggestion")
        .set("x-test-user-id", user.id)
        .expect(200);
      return res.body;
    }

    async function eventCount(eventType: string): Promise<number> {
      const rows = await db
        .select()
        .from(userTimerEvents)
        .where(
          and(
            eq(userTimerEvents.userId, user.id),
            eq(userTimerEvents.eventType, eventType as never),
          ),
        );
      return rows.length;
    }

    // Event-log rows are persisted asynchronously by a durable consumer.
    async function awaitEventCount(
      eventType: string,
      expected: number,
    ): Promise<void> {
      await pollUntil(
        () => eventCount(eventType),
        (c) => c === expected,
        {
          timeoutMs: 20000,
          intervalMs: 200,
        },
      );
    }

    return {
      user,
      getTimer,
      patchTimer,
      getSettings,
      putSettings,
      getSuggestion,
      eventCount,
      awaitEventCount,
    };
  }

  // --- tests ---
  it("returns an idle timer for a fresh user", async () => {
    const { getTimer } = await createUserCtx();
    const timer = await getTimer();
    expect(timer.status).toBe("idle");
    expect(timer.sessionType).toBeNull();
    expect(timer.remainingSeconds).toBeNull();
    expect(timer.completedFocusSessions).toBe(0);
  });

  it("exposes default settings and persists updates", async () => {
    const { getSettings, putSettings } = await createUserCtx();
    const defaults = await getSettings();
    expect(defaults).toEqual({
      focusDurationSeconds: 1500,
      shortBreakDurationSeconds: 300,
      longBreakDurationSeconds: 900,
      longBreakInterval: 4,
    });

    await putSettings({
      focusDurationSeconds: 1200,
      shortBreakDurationSeconds: 240,
      longBreakDurationSeconds: 600,
      longBreakInterval: 3,
    });

    expect(await getSettings()).toMatchObject({
      focusDurationSeconds: 1200,
      longBreakInterval: 3,
    });
  });

  it("starts a focus session and records a started event", async () => {
    const { patchTimer, awaitEventCount } = await createUserCtx();
    const timer = await patchTimer({
      status: "running",
      sessionType: "focus",
      durationSeconds: 1500,
    });
    expect(timer.status).toBe("running");
    expect(timer.sessionType).toBe("focus");
    expect(timer.sessionDurationSeconds).toBe(1500);
    expect(timer.remainingSeconds).toBe(1500);
    expect(timer.completesAt).not.toBeNull();
    await awaitEventCount("started", 1);
  });

  it("pauses (freezing remaining) and resumes", async () => {
    const { patchTimer, awaitEventCount } = await createUserCtx();
    await patchTimer({
      status: "running",
      sessionType: "focus",
      durationSeconds: 1500,
    });

    const paused = await patchTimer({ status: "paused" });
    expect(paused.status).toBe("paused");
    expect(paused.remainingSeconds).toBe(1500);
    expect(paused.completesAt).toBeNull();
    await awaitEventCount("paused", 1);

    const resumed = await patchTimer({ status: "running" });
    expect(resumed.status).toBe("running");
    expect(resumed.completesAt).not.toBeNull();
    await awaitEventCount("resumed", 1);
  });

  it("stops a session without touching the focus counter", async () => {
    const { patchTimer } = await createUserCtx();
    await patchTimer({
      status: "running",
      sessionType: "focus",
      durationSeconds: 1500,
    });
    const stopped = await patchTimer({ status: "stopped" });
    expect(stopped.status).toBe("stopped");
    expect(stopped.completedFocusSessions).toBe(0);
  });

  it("rejects invalid transitions and bad payload combos", async () => {
    const { patchTimer } = await createUserCtx();
    // pause while idle
    await patchTimer({ status: "paused" }, 400);
    // session fields without duration
    await patchTimer({ status: "running", sessionType: "focus" }, 400);
    // session fields with a non-running status
    await patchTimer(
      { status: "paused", sessionType: "focus", durationSeconds: 1500 },
      400,
    );
  });

  it("directly switches a running session, completing the current one", async () => {
    const { patchTimer, awaitEventCount, getTimer } = await createUserCtx();
    await patchTimer({
      status: "running",
      sessionType: "focus",
      durationSeconds: 1500,
    });

    // Switch focus -> short_break directly while running.
    const switched = await patchTimer({
      status: "running",
      sessionType: "short_break",
      durationSeconds: 300,
    });
    expect(switched.status).toBe("running");
    expect(switched.sessionType).toBe("short_break");
    expect(switched.sessionDurationSeconds).toBe(300);
    expect(switched.remainingSeconds).toBe(300);
    // The overridden focus session was completed and counted.
    expect(switched.completedFocusSessions).toBe(1);

    // Log: one completed (old focus) + two started (focus, short_break).
    await awaitEventCount("completed", 1);
    await awaitEventCount("started", 2);

    // New break session is live, not auto-completed early.
    const current = await getTimer();
    expect(current.status).toBe("running");
    expect(current.sessionType).toBe("short_break");
  });

  it("counts each completed focus session when switching focus -> focus", async () => {
    const { patchTimer, awaitEventCount } = await createUserCtx();
    await patchTimer({
      status: "running",
      sessionType: "focus",
      durationSeconds: 1500,
    });

    await patchTimer({
      status: "running",
      sessionType: "focus",
      durationSeconds: 1500,
    });

    const third = await patchTimer({
      status: "running",
      sessionType: "focus",
      durationSeconds: 1500,
    });
    // Two prior focus sessions completed via the switches.
    expect(third.completedFocusSessions).toBe(2);
    expect(third.status).toBe("running");
    await awaitEventCount("completed", 2);
    await awaitEventCount("started", 3);
  });

  it("completes a running timer via the scheduled job", async () => {
    const { patchTimer, getTimer, awaitEventCount } = await createUserCtx();
    await patchTimer({
      status: "running",
      sessionType: "focus",
      durationSeconds: 1,
    });

    const completed = await pollUntil(
      getTimer,
      (t) => t.status === "completed",
      { timeoutMs: JOB_TIMEOUT_MS, intervalMs: 250 },
    );
    expect(completed.completedFocusSessions).toBe(1);
    expect(completed.remainingSeconds).toBe(0);
    await awaitEventCount("completed", 1);
  });

  it("lazily completes an overdue timer on GET, idempotently", async () => {
    const { patchTimer, getTimer, awaitEventCount } = await createUserCtx();
    await patchTimer({
      status: "running",
      sessionType: "focus",
      durationSeconds: 1500,
    });

    clock.advance(1501 * 1000);

    const first = await getTimer();
    expect(first.status).toBe("completed");
    expect(first.completedFocusSessions).toBe(1);

    // Second GET must not double-complete.
    const second = await getTimer();
    expect(second.status).toBe("completed");
    expect(second.completedFocusSessions).toBe(1);
    await awaitEventCount("completed", 1);
  });

  it("does not bump the focus counter when a break completes", async () => {
    const { patchTimer, getTimer } = await createUserCtx();
    await patchTimer({
      status: "running",
      sessionType: "short_break",
      durationSeconds: 1500,
    });
    clock.advance(1501 * 1000);
    const completed = await getTimer();
    expect(completed.status).toBe("completed");
    expect(completed.completedFocusSessions).toBe(0);
  });

  it("suggests a long break after the configured interval and resets on long break", async () => {
    const { patchTimer, getTimer, getSuggestion, putSettings } =
      await createUserCtx();
    await putSettings({
      focusDurationSeconds: 1500,
      shortBreakDurationSeconds: 300,
      longBreakDurationSeconds: 900,
      longBreakInterval: 2,
    });

    for (let i = 0; i < 2; i++) {
      await patchTimer({
        status: "running",
        sessionType: "focus",
        durationSeconds: 1500,
      });
      clock.advance(1501 * 1000);
      await getTimer(); // triggers lazy completion
    }

    expect(await getSuggestion()).toMatchObject({
      suggestedSessionType: "long_break",
      completedFocusSessions: 2,
      longBreakInterval: 2,
    });

    // Starting a long break resets the cadence counter.
    await patchTimer({
      status: "running",
      sessionType: "long_break",
      durationSeconds: 900,
    });
    expect(await getSuggestion()).toMatchObject({
      suggestedSessionType: "short_break",
      completedFocusSessions: 0,
    });
  });

  it("keeps a paused timer paused past its original completion time", async () => {
    const { patchTimer, getTimer, eventCount } = await createUserCtx();
    await patchTimer({
      status: "running",
      sessionType: "focus",
      durationSeconds: 2,
    });
    await patchTimer({ status: "paused" });

    // Advance well past when the (now-cancelled) job would have fired.
    clock.advance(10 * 1000);
    await new Promise((r) => setTimeout(r, 3000));

    const timer = await getTimer();
    expect(timer.status).toBe("paused");
    expect(await eventCount("completed")).toBe(0);
  });

  it("does not retroactively change a running session when settings change", async () => {
    const { patchTimer, getTimer, putSettings } = await createUserCtx();
    await patchTimer({
      status: "running",
      sessionType: "focus",
      durationSeconds: 1500,
    });
    await putSettings({
      focusDurationSeconds: 10,
      shortBreakDurationSeconds: 300,
      longBreakDurationSeconds: 900,
      longBreakInterval: 4,
    });

    const timer = await getTimer();
    expect(timer.status).toBe("running");
    expect(timer.remainingSeconds).toBe(1500);
  });
});
