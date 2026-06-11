import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, eq, isNotNull } from "drizzle-orm";
import { ContextLogger } from "nestjs-context-logger";

import { Calendar } from "@/api/calendar-events/entities/calendar.entity";
import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { calendarIntegrations } from "@/migrations/schema/calendarIntegrations";
import { calendars } from "@/migrations/schema/calendars";

type CalendarRow = typeof calendars.$inferSelect;

@Injectable()
export class CalendarRepository {
  private readonly logger = new ContextLogger(CalendarRepository.name);

  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async ensureAsksynkCalendar(userId: string, id: string): Promise<Calendar> {
    await this.txHost.tx
      .insert(calendars)
      .values({ id, userId, source: "asksynk" })
      .onConflictDoNothing();

    const calendar = await this.getAsksynkByUserId(userId);
    if (!calendar) {
      // unreachable: just inserted-or-existing; narrow the type
      throw new Error("Failed to ensure asksynk calendar");
    }
    return calendar;
  }

  async getAsksynkByUserId(userId: string): Promise<Calendar | null> {
    const calendar = await this.txHost.tx
      .select()
      .from(calendars)
      .where(and(eq(calendars.userId, userId), eq(calendars.source, "asksynk")))
      .then((rows) => rows[0]);

    if (!calendar) return null;
    return this.mapDbRowToCalendar(calendar);
  }

  async getById(id: string): Promise<Calendar | null> {
    const calendar = await this.txHost.tx
      .select()
      .from(calendars)
      .where(eq(calendars.id, id))
      .then((rows) => rows[0]);

    if (!calendar) return null;
    return this.mapDbRowToCalendar(calendar);
  }

  async listByUserId(userId: string): Promise<Calendar[]> {
    const rows = await this.txHost.tx
      .select()
      .from(calendars)
      .where(eq(calendars.userId, userId));

    return rows.map((row) => this.mapDbRowToCalendar(row));
  }

  async listByIntegration(integrationId: string): Promise<Calendar[]> {
    const rows = await this.txHost.tx
      .select()
      .from(calendars)
      .where(eq(calendars.integrationId, integrationId));

    return rows.map((row) => this.mapDbRowToCalendar(row));
  }

  async getByIntegrationAndExternalId(
    integrationId: string,
    externalId: string,
  ): Promise<Calendar | null> {
    const calendar = await this.txHost.tx
      .select()
      .from(calendars)
      .where(
        and(
          eq(calendars.integrationId, integrationId),
          eq(calendars.externalId, externalId),
        ),
      )
      .then((rows) => rows[0]);

    if (!calendar) return null;
    return this.mapDbRowToCalendar(calendar);
  }

  /** Provider calendars that are sync-enabled and belong to an active integration. */
  async listSyncEnabledProviderCalendars(): Promise<Calendar[]> {
    const rows = await this.txHost.tx
      .select({ calendar: calendars })
      .from(calendars)
      .innerJoin(
        calendarIntegrations,
        eq(calendars.integrationId, calendarIntegrations.id),
      )
      .where(
        and(
          isNotNull(calendars.integrationId),
          eq(calendars.syncEnabled, true),
          eq(calendarIntegrations.status, "active"),
        ),
      );

    return rows.map((row) => this.mapDbRowToCalendar(row.calendar));
  }

  async add(calendar: Calendar): Promise<Calendar> {
    const [created] = await this.txHost.tx
      .insert(calendars)
      .values({
        id: calendar.id,
        userId: calendar.userId,
        source: calendar.source,
        name: calendar.name,
        color: calendar.color,
        externalId: calendar.externalId,
        integrationId: calendar.integrationId,
        syncEnabled: calendar.syncEnabled,
        syncToken: calendar.syncToken,
        providerState: calendar.providerState,
      })
      .onConflictDoNothing()
      .returning();

    if (created) return this.mapDbRowToCalendar(created);

    // conflict on (integrationId, externalId): return the existing row
    const existing = await this.getByIntegrationAndExternalId(
      calendar.integrationId!,
      calendar.externalId!,
    );
    return existing!;
  }

  async setSyncEnabled(calendarId: string, enabled: boolean): Promise<void> {
    await this.txHost.tx
      .update(calendars)
      .set({ syncEnabled: enabled })
      .where(eq(calendars.id, calendarId));
  }

  async updateSyncToken(
    calendarId: string,
    syncToken: string | null,
  ): Promise<void> {
    await this.txHost.tx
      .update(calendars)
      .set({ syncToken })
      .where(eq(calendars.id, calendarId));
  }

  private mapDbRowToCalendar(row: CalendarRow): Calendar {
    return Calendar.create({
      id: row.id,
      userId: row.userId,
      source: row.source,
      name: row.name,
      color: row.color,
      externalId: row.externalId,
      integrationId: row.integrationId,
      syncEnabled: row.syncEnabled,
      syncToken: row.syncToken,
      providerState: row.providerState,
      createdAt: row.createdAt,
    });
  }
}
