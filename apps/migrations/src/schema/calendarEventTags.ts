import { pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { calendarEvents } from "@/migrations/schema/calendarEvents";
import { tags } from "@/migrations/schema/tags";

export const calendarEventTags = pgTable(
  "calendar_event_tags",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.tagId] })],
);
