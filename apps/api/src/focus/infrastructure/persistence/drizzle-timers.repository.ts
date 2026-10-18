import { Injectable } from "@nestjs/common";
import { Transactional, TransactionHost } from "@nestjs-cls/transactional";
import { and, eq, sql } from "drizzle-orm";

import { TimersRepository } from "@/api/focus/domain/ports/timers.repository";
import { Timer } from "@/api/focus/domain/timer";
import { TimerSessionType, TimerStatus } from "@/api/focus/domain/timer.model";
import { toTimerLifecyclePayload } from "@/api/focus/infrastructure/persistence/timer-events.mapper";
import { concurrencyConflictError } from "@/api/kernel/errors/kernel.errors";
import { TxAdapter } from "@/api/platform/db/tx.module";
import { EventsPublisher } from "@/api/platform/events/publisher/events-publisher";
import { TimerLifecycle } from "@/api/platform/events/registry/events.registry";
import { userTimers } from "@/migrations/schema/userTimers";

type TimerRow = typeof userTimers.$inferSelect;

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
      .select()
      .from(userTimers)
      .where(eq(userTimers.userId, userId));
    return row ? this.mapRow(row) : null;
  }

  /** No insert path: rows only come from `ensure`. */
  @Transactional()
  async save(timer: Timer): Promise<void> {
    const [row] = await this.txHost.tx
      .update(userTimers)
      .set({
        status: timer.status,
        sessionType: timer.sessionType,
        sessionDurationSeconds: timer.sessionDurationSeconds,
        transitionedAt: timer.transitionedAt,
        remainingAtTransition: timer.remainingAtTransition,
        completedFocusSessions: timer.completedFocusSessions,
        updatedAt: timer.updatedAt,
        version: sql`${userTimers.version} + 1`,
      })
      .where(
        and(eq(userTimers.id, timer.id), eq(userTimers.version, timer.version)),
      )
      .returning({ id: userTimers.id });

    if (!row) {
      throw concurrencyConflictError();
    }

    timer.markSaved();

    for (const event of timer.pullEvents()) {
      await this.eventsPublisher.publish(
        TimerLifecycle,
        toTimerLifecyclePayload(event),
      );
    }
  }

  private mapRow(row: TimerRow): Timer {
    return Timer.rehydrate(
      {
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
      },
      row.version,
    );
  }
}
