import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";

import { tags } from "./tags";

export type RecurrenceType =
  | "daily"
  | "weekdays"
  | "weekly"
  | "bi-weekly"
  | "monthly";

export const recurrences = pgTable("recurrences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull().$type<RecurrenceType>(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  durationMs: integer("duration_ms").notNull(),
  until: timestamp("until", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    start: timestamp("start", { withTimezone: true }).notNull(),
    end: timestamp("end", { withTimezone: true }).notNull(),
    recurrenceId: text("recurrence_id").references(() => recurrences.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("events_user_date_range_idx").on(t.userId, t.start, t.end)],
);

export const eventTags = pgTable(
  "event_tags",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.tagId] })],
);
