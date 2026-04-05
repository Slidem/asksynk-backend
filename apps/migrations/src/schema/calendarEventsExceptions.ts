import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import { calendarEvents } from "@/migrations/schema/calendarEvents";

export const calendarEventExceptions = pgTable(
  "calendar_event_exceptions",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    originalStart: timestamp("original_start", {
      withTimezone: false,
    }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.originalStart] })],
);
