import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, eq } from "drizzle-orm";

import { CalendarEventLink } from "@/api/calendar-integrations/entities/calendar-event-link.entity";
import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { calendarEventLinks } from "@/migrations/schema/calendarEventLinks";

type LinkRow = typeof calendarEventLinks.$inferSelect;

@Injectable()
export class CalendarEventLinkRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async add(link: CalendarEventLink): Promise<CalendarEventLink> {
    const [created] = await this.txHost.tx
      .insert(calendarEventLinks)
      .values({
        id: link.id,
        asksynkEventId: link.asksynkEventId,
        integrationId: link.integrationId,
        externalCalendarId: link.externalCalendarId,
        externalEventId: link.externalEventId,
        etag: link.etag,
        origin: link.origin,
        degraded: link.degraded,
      })
      .returning();

    return this.mapRow(created);
  }

  async getByExternal(
    integrationId: string,
    externalEventId: string,
  ): Promise<CalendarEventLink | null> {
    const row = await this.txHost.tx
      .select()
      .from(calendarEventLinks)
      .where(
        and(
          eq(calendarEventLinks.integrationId, integrationId),
          eq(calendarEventLinks.externalEventId, externalEventId),
        ),
      )
      .then((rows) => rows[0]);

    return row ? this.mapRow(row) : null;
  }

  async getByEventAndIntegration(
    asksynkEventId: string,
    integrationId: string,
  ): Promise<CalendarEventLink | null> {
    const row = await this.txHost.tx
      .select()
      .from(calendarEventLinks)
      .where(
        and(
          eq(calendarEventLinks.asksynkEventId, asksynkEventId),
          eq(calendarEventLinks.integrationId, integrationId),
        ),
      )
      .then((rows) => rows[0]);

    return row ? this.mapRow(row) : null;
  }

  async listByEvent(asksynkEventId: string): Promise<CalendarEventLink[]> {
    const rows = await this.txHost.tx
      .select()
      .from(calendarEventLinks)
      .where(eq(calendarEventLinks.asksynkEventId, asksynkEventId));

    return rows.map((row) => this.mapRow(row));
  }

  async updateEtag(id: string, etag: string | null): Promise<void> {
    await this.txHost.tx
      .update(calendarEventLinks)
      .set({ etag, updatedAt: new Date() })
      .where(eq(calendarEventLinks.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.txHost.tx
      .delete(calendarEventLinks)
      .where(eq(calendarEventLinks.id, id));
  }

  /** Drops a provider calendar's `imported` links; leaves `mirrored` ones intact. */
  async deleteImportedByCalendar(
    integrationId: string,
    externalCalendarId: string,
  ): Promise<void> {
    await this.txHost.tx
      .delete(calendarEventLinks)
      .where(
        and(
          eq(calendarEventLinks.integrationId, integrationId),
          eq(calendarEventLinks.externalCalendarId, externalCalendarId),
          eq(calendarEventLinks.origin, "imported"),
        ),
      );
  }

  private mapRow(row: LinkRow): CalendarEventLink {
    return CalendarEventLink.create({
      id: row.id,
      asksynkEventId: row.asksynkEventId,
      integrationId: row.integrationId,
      externalCalendarId: row.externalCalendarId,
      externalEventId: row.externalEventId,
      etag: row.etag,
      origin: row.origin,
      degraded: row.degraded,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
