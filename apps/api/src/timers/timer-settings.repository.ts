import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { eq } from "drizzle-orm";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { UserTimerSettings } from "@/api/timers/entities/user-timer-settings.entity";
import { UpdateTimerSettingsInput } from "@/api/timers/models/timer.model";
import { userTimerSettings } from "@/migrations/schema/userTimerSettings";

type UserTimerSettingsRow = typeof userTimerSettings.$inferSelect;

@Injectable()
export class TimerSettingsRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  /** Lazily create default settings if missing, then return them. */
  async ensure(userId: string): Promise<UserTimerSettings> {
    await this.txHost.tx
      .insert(userTimerSettings)
      .values({ userId })
      .onConflictDoNothing({ target: userTimerSettings.userId });

    const [row] = await this.txHost.tx
      .select()
      .from(userTimerSettings)
      .where(eq(userTimerSettings.userId, userId));
    return this.mapRow(row);
  }

  /** Upsert all settings fields (creates defaults row implicitly on first write). */
  async update(
    userId: string,
    input: UpdateTimerSettingsInput,
    now: Date,
  ): Promise<UserTimerSettings> {
    const [row] = await this.txHost.tx
      .insert(userTimerSettings)
      .values({ userId, ...input })
      .onConflictDoUpdate({
        target: userTimerSettings.userId,
        set: { ...input, updatedAt: now },
      })
      .returning();
    return this.mapRow(row);
  }

  private mapRow(row: UserTimerSettingsRow): UserTimerSettings {
    return UserTimerSettings.create({
      id: row.id,
      userId: row.userId,
      focusDurationSeconds: row.focusDurationSeconds,
      shortBreakDurationSeconds: row.shortBreakDurationSeconds,
      longBreakDurationSeconds: row.longBreakDurationSeconds,
      longBreakInterval: row.longBreakInterval,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
