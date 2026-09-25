import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const eventsDeadLetterStatus = pgEnum("events_dead_letter_status", [
  "pending",
  "replayed",
  "discarded",
]);

export const eventsDeadLetters = pgTable(
  "events_dead_letters",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    consumerGroup: text("consumer_group").notNull(),
    // Outbox row id; no FK, the outbox gets pruned.
    eventId: uuid("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    error: text("error").notNull(),
    attempts: integer("attempts").notNull(),
    status: eventsDeadLetterStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_events_dead_letters_event_group").on(
      t.eventId,
      t.consumerGroup,
    ),
    index("idx_events_dead_letters_status_created").on(t.status, t.createdAt),
  ],
);
