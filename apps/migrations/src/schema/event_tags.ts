import { pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { events } from "@/migrations/schema/events";
import { tags } from "@/migrations/schema/tags";

export const eventTags = pgTable(
  "event_tags",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.tagId] })],
);
