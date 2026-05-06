import { sql } from "drizzle-orm";
import {
  index,
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
    groups: text("groups").notNull(), // comma-separated list of groups
    payload: text("payload").notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_events_outbox_event_type").on(t.eventType)],
);
