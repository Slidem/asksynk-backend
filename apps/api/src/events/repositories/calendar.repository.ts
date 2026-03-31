import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { eq } from "drizzle-orm";
import { ContextLogger } from "nestjs-context-logger";

import { Calendar } from "@/api/events/entities/calendar.entity";
import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { calendars } from "@/migrations/schema/calendars";

type CalendarRow = typeof calendars.$inferSelect;

@Injectable()
export class CalendarRepository {
  private readonly logger = new ContextLogger(CalendarRepository.name);

  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async ensureAsksynkCalendar(userId: string, id: string): Promise<Calendar> {
    this.logger.info("Ensuring asksynk calendar", { userId });

    await this.txHost.tx
      .insert(calendars)
      .values({ id, userId, source: "asksynk" })
      .onConflictDoNothing();

    const calendar = await this.txHost.tx
      .select()
      .from(calendars)
      .where(eq(calendars.userId, userId))
      .then((rows) => rows[0]);

    return this.mapDbRowToCalendar(calendar);
  }

  async getByUserId(userId: string): Promise<Calendar | null> {
    const calendar = await this.txHost.tx
      .select()
      .from(calendars)
      .where(eq(calendars.userId, userId))
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

  private mapDbRowToCalendar(row: CalendarRow): Calendar {
    return Calendar.create({
      id: row.id,
      userId: row.userId,
      source: row.source,
      color: row.color,
      externalId: row.externalId,
      createdAt: row.createdAt,
    });
  }
}
