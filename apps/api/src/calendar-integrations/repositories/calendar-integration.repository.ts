import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, eq } from "drizzle-orm";

import {
  CalendarIntegration,
  CalendarIntegrationStatus,
} from "@/api/calendar-integrations/entities/calendar-integration.entity";
import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import {
  CalendarIntegrationCredentials,
  calendarIntegrations,
} from "@/migrations/schema/calendarIntegrations";

type IntegrationRow = typeof calendarIntegrations.$inferSelect;

@Injectable()
export class CalendarIntegrationRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async add(integration: CalendarIntegration): Promise<CalendarIntegration> {
    const [created] = await this.txHost.tx
      .insert(calendarIntegrations)
      .values({
        id: integration.id,
        userId: integration.userId,
        provider: integration.provider,
        externalAccountId: integration.externalAccountId,
        status: integration.status,
        syncDirection: integration.syncDirection,
        credentials: integration.credentials,
        providerData: integration.providerData,
        lastError: integration.lastError,
      })
      .onConflictDoUpdate({
        target: [
          calendarIntegrations.userId,
          calendarIntegrations.provider,
          calendarIntegrations.externalAccountId,
        ],
        set: {
          credentials: integration.credentials,
          providerData: integration.providerData,
          status: integration.status,
          lastError: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return this.mapRow(created);
  }

  async getById(id: string): Promise<CalendarIntegration | null> {
    const row = await this.txHost.tx
      .select()
      .from(calendarIntegrations)
      .where(eq(calendarIntegrations.id, id))
      .then((rows) => rows[0]);

    return row ? this.mapRow(row) : null;
  }

  /** Locks the integration row for the current transaction (token-refresh race guard). */
  async getByIdForUpdate(id: string): Promise<CalendarIntegration | null> {
    const row = await this.txHost.tx
      .select()
      .from(calendarIntegrations)
      .where(eq(calendarIntegrations.id, id))
      .for("update")
      .then((rows) => rows[0]);

    return row ? this.mapRow(row) : null;
  }

  async getOwned(
    id: string,
    userId: string,
  ): Promise<CalendarIntegration | null> {
    const row = await this.txHost.tx
      .select()
      .from(calendarIntegrations)
      .where(
        and(
          eq(calendarIntegrations.id, id),
          eq(calendarIntegrations.userId, userId),
        ),
      )
      .then((rows) => rows[0]);

    return row ? this.mapRow(row) : null;
  }

  async listByUser(userId: string): Promise<CalendarIntegration[]> {
    const rows = await this.txHost.tx
      .select()
      .from(calendarIntegrations)
      .where(eq(calendarIntegrations.userId, userId));

    return rows.map((row) => this.mapRow(row));
  }

  async updateCredentials(
    id: string,
    credentials: CalendarIntegrationCredentials,
  ): Promise<void> {
    await this.txHost.tx
      .update(calendarIntegrations)
      .set({ credentials, updatedAt: new Date() })
      .where(eq(calendarIntegrations.id, id));
  }

  async updateStatus(
    id: string,
    status: CalendarIntegrationStatus,
    lastError: string | null,
  ): Promise<void> {
    await this.txHost.tx
      .update(calendarIntegrations)
      .set({ status, lastError, updatedAt: new Date() })
      .where(eq(calendarIntegrations.id, id));
  }

  async updateSyncDirection(
    id: string,
    syncDirection: CalendarIntegration["syncDirection"],
  ): Promise<void> {
    await this.txHost.tx
      .update(calendarIntegrations)
      .set({ syncDirection, updatedAt: new Date() })
      .where(eq(calendarIntegrations.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.txHost.tx
      .delete(calendarIntegrations)
      .where(eq(calendarIntegrations.id, id));
  }

  private mapRow(row: IntegrationRow): CalendarIntegration {
    return CalendarIntegration.create({
      id: row.id,
      userId: row.userId,
      provider: row.provider,
      externalAccountId: row.externalAccountId,
      status: row.status,
      syncDirection: row.syncDirection,
      credentials: row.credentials,
      providerData: row.providerData,
      lastError: row.lastError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
