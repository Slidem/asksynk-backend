import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import { events } from "@/migrations/schema/events";

export const eventExceptions = pgTable(
  "event_exceptions",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    originalStart: timestamp("original_start", {
      withTimezone: false,
    }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.originalStart] })],
);
