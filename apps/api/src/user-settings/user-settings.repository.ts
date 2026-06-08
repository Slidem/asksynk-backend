import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { eq } from "drizzle-orm";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { UserSettings } from "@/api/user-settings/entities/user-settings.entity";
import { UpdateUserSettingsInput } from "@/api/user-settings/models/user-settings.model";
import { userSettings } from "@/migrations/schema/userSettings";

type UserSettingsRow = typeof userSettings.$inferSelect;

@Injectable()
export class UserSettingsRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  /** Lazily create default settings if missing, then return them. */
  async ensure(userId: string): Promise<UserSettings> {
    await this.txHost.tx
      .insert(userSettings)
      .values({ userId })
      .onConflictDoNothing({ target: userSettings.userId });

    const [row] = await this.txHost.tx
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    return this.mapRow(row);
  }

  /** Upsert all settings fields (creates defaults row implicitly on first write). */
  async update(
    userId: string,
    input: UpdateUserSettingsInput,
    now: Date,
  ): Promise<UserSettings> {
    const [row] = await this.txHost.tx
      .insert(userSettings)
      .values({ userId, ...input })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { ...input, updatedAt: now },
      })
      .returning();
    return this.mapRow(row);
  }

  private mapRow(row: UserSettingsRow): UserSettings {
    return UserSettings.create({
      id: row.id,
      userId: row.userId,
      attentionItemNotifications: row.attentionItemNotifications,
      timerNotifications: row.timerNotifications,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
