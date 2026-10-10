import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, eq, inArray, sql } from "drizzle-orm";

import { TxAdapter } from "@/api/platform/db/tx.module";
import { Timer } from "@/api/timers/domain/timer";
import {
  TimerEventType,
  TimerSessionType,
  TimerStatus,
} from "@/api/timers/models/timer.model";
import { userTimerEvents } from "@/migrations/schema/userTimerEvents";
import { userTimers } from "@/migrations/schema/userTimers";

type TimerRow = typeof userTimers.$inferSelect;

interface StartInput {
  sessionType: TimerSessionType;
  durationSeconds: number;
  transitionedAt: Date;
  resetFocusCounter: boolean;
}

interface AppendEventInput {
  userId: string;
  eventType: TimerEventType;
  sessionType: TimerSessionType;
  sessionDurationSeconds: number;
  remainingSeconds: number;
  occurredAt: Date;
}

@Injectable()
export class TimersRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  /** Lazily create the user's idle timer row if missing, then return it. */
  async ensure(userId: string): Promise<Timer> {
    await this.txHost.tx
      .insert(userTimers)
      .values({ userId })
      .onConflictDoNothing({ target: userTimers.userId });

    const timer = await this.getByUserId(userId);
    // Guaranteed to exist after the upsert above.
    return timer!;
  }

  async getByUserId(userId: string): Promise<Timer | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(userTimers)
      .where(eq(userTimers.userId, userId));
    return row ? this.mapRow(row) : null;
  }

  /**
   * Start a fresh session. Unconditional — overrides whatever state the timer
   * is in (the caller completes a running session first when switching).
   */
  async start(userId: string, input: StartInput): Promise<Timer> {
    const [row] = await this.txHost.tx
      .update(userTimers)
      .set({
        status: "running",
        sessionType: input.sessionType,
        sessionDurationSeconds: input.durationSeconds,
        remainingAtTransition: input.durationSeconds,
        transitionedAt: input.transitionedAt,
        ...(input.resetFocusCounter ? { completedFocusSessions: 0 } : {}),
        updatedAt: input.transitionedAt,
      })
      .where(eq(userTimers.userId, userId))
      .returning();
    return this.mapRow(row);
  }

  /** Pause a running session, freezing the remaining time. */
  async pause(
    userId: string,
    remainingAtTransition: number,
    transitionedAt: Date,
  ): Promise<Timer | null> {
    const [row] = await this.txHost.tx
      .update(userTimers)
      .set({
        status: "paused",
        remainingAtTransition,
        transitionedAt,
        updatedAt: transitionedAt,
      })
      .where(
        and(eq(userTimers.userId, userId), eq(userTimers.status, "running")),
      )
      .returning();
    return row ? this.mapRow(row) : null;
  }

  /** Resume a paused session. Remaining is unchanged. */
  async resume(
    userId: string,
    transitionedAt: Date,
  ): Promise<Timer | null> {
    const [row] = await this.txHost.tx
      .update(userTimers)
      .set({
        status: "running",
        transitionedAt,
        updatedAt: transitionedAt,
      })
      .where(
        and(eq(userTimers.userId, userId), eq(userTimers.status, "paused")),
      )
      .returning();
    return row ? this.mapRow(row) : null;
  }

  /** Stop/abandon the current session. */
  async stop(
    userId: string,
    remainingAtTransition: number,
    transitionedAt: Date,
  ): Promise<Timer | null> {
    const [row] = await this.txHost.tx
      .update(userTimers)
      .set({
        status: "stopped",
        remainingAtTransition,
        transitionedAt,
        updatedAt: transitionedAt,
      })
      .where(
        and(
          eq(userTimers.userId, userId),
          inArray(userTimers.status, ["running", "paused"]),
        ),
      )
      .returning();
    return row ? this.mapRow(row) : null;
  }

  /**
   * Idempotent completion. Only completes a still-running session whose
   * transition matches the guard (so stale/paused/restarted timers are
   * untouched). Increments the focus counter for completed focus sessions.
   * Returns the updated timer, or null if nothing was completed.
   */
  async completeIfRunning(
    userId: string,
    transitionedAtGuard: Date,
    now: Date,
  ): Promise<Timer | null> {
    const [row] = await this.txHost.tx
      .update(userTimers)
      .set({
        status: "completed",
        remainingAtTransition: 0,
        completedFocusSessions: sql`${userTimers.completedFocusSessions} + CASE WHEN ${userTimers.sessionType} = 'focus' THEN 1 ELSE 0 END`,
        updatedAt: now,
      })
      .where(
        and(
          eq(userTimers.userId, userId),
          eq(userTimers.status, "running"),
          eq(userTimers.transitionedAt, transitionedAtGuard),
        ),
      )
      .returning();
    return row ? this.mapRow(row) : null;
  }

  async appendEvent(input: AppendEventInput): Promise<void> {
    await this.txHost.tx.insert(userTimerEvents).values({
      userId: input.userId,
      eventType: input.eventType,
      sessionType: input.sessionType,
      sessionDurationSeconds: input.sessionDurationSeconds,
      remainingSeconds: input.remainingSeconds,
      occurredAt: input.occurredAt,
    });
  }

  private mapRow(row: TimerRow): Timer {
    return Timer.create({
      id: row.id,
      userId: row.userId,
      status: row.status as TimerStatus,
      sessionType: row.sessionType as TimerSessionType | null,
      sessionDurationSeconds: row.sessionDurationSeconds,
      transitionedAt: row.transitionedAt,
      remainingAtTransition: row.remainingAtTransition,
      completedFocusSessions: row.completedFocusSessions,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
