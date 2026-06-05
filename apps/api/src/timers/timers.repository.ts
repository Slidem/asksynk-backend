import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, eq, inArray, sql } from "drizzle-orm";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { UserTimer } from "@/api/timers/entities/user-timer.entity";
import {
  TimerEventType,
  TimerSessionType,
  TimerStatus,
} from "@/api/timers/models/timer.model";
import { userTimerEvents } from "@/migrations/schema/userTimerEvents";
import { userTimers } from "@/migrations/schema/userTimers";

type UserTimerRow = typeof userTimers.$inferSelect;

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
  async ensure(userId: string): Promise<UserTimer> {
    await this.txHost.tx
      .insert(userTimers)
      .values({ userId })
      .onConflictDoNothing({ target: userTimers.userId });

    const timer = await this.getByUserId(userId);
    // Guaranteed to exist after the upsert above.
    return timer!;
  }

  async getByUserId(userId: string): Promise<UserTimer | null> {
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
  async start(userId: string, input: StartInput): Promise<UserTimer> {
    const [row] = await this.txHost.tx
      .update(userTimers)
      .set({
        status: "running",
        sessionType: input.sessionType,
        sessionDurationSeconds: input.durationSeconds,
        remainingAtTransition: input.durationSeconds,
        transitionedAt: input.transitionedAt,
        pendingCompletionJobRef: null,
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
  ): Promise<UserTimer | null> {
    const [row] = await this.txHost.tx
      .update(userTimers)
      .set({
        status: "paused",
        remainingAtTransition,
        transitionedAt,
        pendingCompletionJobRef: null,
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
  ): Promise<UserTimer | null> {
    const [row] = await this.txHost.tx
      .update(userTimers)
      .set({
        status: "running",
        transitionedAt,
        pendingCompletionJobRef: null,
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
  ): Promise<UserTimer | null> {
    const [row] = await this.txHost.tx
      .update(userTimers)
      .set({
        status: "stopped",
        remainingAtTransition,
        transitionedAt,
        pendingCompletionJobRef: null,
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
  ): Promise<UserTimer | null> {
    const [row] = await this.txHost.tx
      .update(userTimers)
      .set({
        status: "completed",
        remainingAtTransition: 0,
        pendingCompletionJobRef: null,
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

  /** Attach the scheduled completion job ref, only if the transition still matches. */
  async setPendingJobRef(
    userId: string,
    ref: string,
    transitionedAtGuard: Date,
  ): Promise<void> {
    await this.txHost.tx
      .update(userTimers)
      .set({ pendingCompletionJobRef: ref })
      .where(
        and(
          eq(userTimers.userId, userId),
          eq(userTimers.status, "running"),
          eq(userTimers.transitionedAt, transitionedAtGuard),
        ),
      );
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

  private mapRow(row: UserTimerRow): UserTimer {
    return UserTimer.create({
      id: row.id,
      userId: row.userId,
      status: row.status as TimerStatus,
      sessionType: row.sessionType as TimerSessionType | null,
      sessionDurationSeconds: row.sessionDurationSeconds,
      transitionedAt: row.transitionedAt,
      remainingAtTransition: row.remainingAtTransition,
      pendingCompletionJobRef: row.pendingCompletionJobRef,
      completedFocusSessions: row.completedFocusSessions,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
