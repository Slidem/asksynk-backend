import { Injectable } from "@nestjs/common";
import { Transactional, TransactionHost } from "@nestjs-cls/transactional";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";

import { FocusSession } from "@/api/focus/domain/focus-session";
import { TimersRepository } from "@/api/focus/domain/ports/timers.repository";
import { Timer } from "@/api/focus/domain/timer";
import {
  SessionEndReason,
  TimerMode,
  TimerStatus,
} from "@/api/focus/domain/timer.model";
import {
  toTimerLifecyclePayload,
  toTimerSessionEndedPayload,
} from "@/api/focus/infrastructure/persistence/timer-events.mapper";
import { concurrencyConflictError } from "@/api/kernel/errors/kernel.errors";
import { TxAdapter } from "@/api/platform/db/tx.module";
import { EventsPublisher } from "@/api/platform/events/publisher/events-publisher";
import {
  TimerLifecycle,
  TimerSessionEnded,
} from "@/api/platform/events/registry/events.registry";
import { focusSessions } from "@/migrations/schema/focusSessions";
import { userTimers } from "@/migrations/schema/userTimers";
import { userTimerSettings } from "@/migrations/schema/userTimerSettings";

type TimerRow = typeof userTimers.$inferSelect;
type FocusSessionRow = typeof focusSessions.$inferSelect;

@Injectable()
export class DrizzleTimersRepository extends TimersRepository {
  constructor(
    private readonly txHost: TransactionHost<TxAdapter>,
    private readonly eventsPublisher: EventsPublisher,
  ) {
    super();
  }

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
      .select({ timer: userTimers, session: focusSessions })
      .from(userTimers)
      .leftJoin(
        focusSessions,
        eq(focusSessions.id, userTimers.currentSessionId),
      )
      .where(eq(userTimers.userId, userId));
    return row ? this.mapRow(row.timer, row.session) : null;
  }

  /**
   * No timer insert path: rows only come from `ensure`. Version check first, so a
   * conflict writes nothing; then sessions (the timer row has an FK to them).
   */
  @Transactional()
  async save(timer: Timer): Promise<void> {
    const [current] = await this.txHost.tx
      .select({ id: userTimers.id })
      .from(userTimers)
      .where(
        and(eq(userTimers.id, timer.id), eq(userTimers.version, timer.version)),
      )
      .for("update");

    if (!current) {
      throw concurrencyConflictError();
    }

    for (const session of timer.sessionsToSave()) {
      await this.upsertSession(session, timer.updatedAt);
    }

    // Row is locked at the checked version above.
    await this.txHost.tx
      .update(userTimers)
      .set({
        status: timer.status,
        mode: timer.mode,
        transitionedAt: timer.transitionedAt,
        remainingAtTransition: timer.remainingAtTransition,
        currentSessionId: timer.session?.id ?? null,
        focusBlocksUntilLongBreak: timer.focusBlocksUntilLongBreak,
        lastActivityAt: timer.lastActivityAt,
        updatedAt: timer.updatedAt,
        version: sql`${userTimers.version} + 1`,
      })
      .where(eq(userTimers.id, timer.id));

    timer.markSaved();

    for (const event of timer.pullEvents()) {
      if (event.type === "timer_transitioned") {
        await this.eventsPublisher.publish(
          TimerLifecycle,
          toTimerLifecyclePayload(event),
        );
      } else {
        await this.eventsPublisher.publish(
          TimerSessionEnded,
          toTimerSessionEndedPayload(event),
        );
      }
    }
  }

  async findInactiveUserIds(now: Date): Promise<string[]> {
    const rows = await this.txHost.tx
      .select({ userId: userTimers.userId })
      .from(userTimers)
      .innerJoin(
        userTimerSettings,
        eq(userTimerSettings.userId, userTimers.userId),
      )
      .where(
        and(
          isNotNull(userTimers.currentSessionId),
          ne(userTimers.status, "running"),
          isNotNull(userTimerSettings.inactivityTimeoutSeconds),
          sql`${userTimers.lastActivityAt} + make_interval(secs => ${userTimerSettings.inactivityTimeoutSeconds}) < ${now}`,
        ),
      );
    return rows.map((r) => r.userId);
  }

  private async upsertSession(
    session: FocusSession,
    updatedAt: Date,
  ): Promise<void> {
    const values = {
      finishedAt: session.finishedAt,
      endReason: session.endReason,
      completedFocusBlocks: session.completedFocusBlocks,
      shortBreaks: session.shortBreaks,
      longBreaks: session.longBreaks,
      updatedAt,
    };
    await this.txHost.tx
      .insert(focusSessions)
      .values({
        id: session.id,
        userId: session.userId,
        startedAt: session.startedAt,
        settings: session.settings,
        createdAt: session.startedAt,
        ...values,
      })
      .onConflictDoUpdate({ target: focusSessions.id, set: values });
  }

  private mapRow(row: TimerRow, sessionRow: FocusSessionRow | null): Timer {
    return Timer.rehydrate(
      {
        id: row.id,
        userId: row.userId,
        status: row.status as TimerStatus,
        mode: row.mode as TimerMode | null,
        transitionedAt: row.transitionedAt,
        remainingAtTransition: row.remainingAtTransition,
        focusBlocksUntilLongBreak: row.focusBlocksUntilLongBreak,
        lastActivityAt: row.lastActivityAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      sessionRow ? this.mapSession(sessionRow) : null,
      row.version,
    );
  }

  private mapSession(row: FocusSessionRow): FocusSession {
    return FocusSession.rehydrate({
      id: row.id,
      userId: row.userId,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      endReason: row.endReason as SessionEndReason | null,
      completedFocusBlocks: row.completedFocusBlocks,
      shortBreaks: row.shortBreaks,
      longBreaks: row.longBreaks,
      settings: row.settings,
    });
  }
}
