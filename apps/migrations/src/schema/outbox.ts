import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const outboxDeliveryMode = pgEnum("outbox_delivery_mode", [
  "realtime",
  "durable",
  "dual",
]);

export const eventsOutbox = pgTable(
  "events_outbox",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    eventType: text("event_type").notNull(),
    deliveryMode: outboxDeliveryMode("delivery_mode").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Matches the dispatcher drain. Realtime rows never get dispatched_at, so
    // the delivery_mode predicate keeps them out of the index.
    index("idx_events_outbox_pending")
      .on(t.id)
      .where(
        sql`dispatched_at IS NULL AND failed_at IS NULL AND delivery_mode IN ('durable', 'dual')`,
      ),
  ],
);
