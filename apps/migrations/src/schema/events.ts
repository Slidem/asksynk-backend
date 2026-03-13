import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { calendars } from "@/migrations/schema/calendars";
import { sql } from "drizzle-orm";

export const events = pgTable(
  "events",
  {
    id: uuid("id")
      .primaryKey()
      .notNull()
      .default(sql`uuidv7()`),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    link: text("link"),
    start: timestamp("start", { withTimezone: false }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    allDay: boolean("all_day").default(false).notNull(),
    timezone: text("timezone").notNull(),
    rrule: text("rrule"),
    color: text("color"),
    originalEventId: text("original_event_id"),
    originalStart: timestamp("original_start", { withTimezone: false }),
    recurrenceEnd: timestamp("recurrence_end", { withTimezone: false }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_events_calendar_start").on(t.calendarId, t.start),
    index("idx_events_recurring")
      .on(t.calendarId)
      .where(sql`rrule IS NOT NULL`),
    index("idx_events_original")
      .on(t.originalEventId)
      .where(sql`original_event_id IS NOT NULL`),
  ],
);
