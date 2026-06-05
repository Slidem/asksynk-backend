import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "@/migrations/schema/users";
import { timerSessionType } from "@/migrations/schema/userTimers";

export const timerEventType = pgEnum("timer_event_type", [
  "started",
  "paused",
  "resumed",
  "stopped",
  "completed",
]);

export const userTimerEvents = pgTable(
  "user_timer_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: timerEventType("event_type").notNull(),
    sessionType: timerSessionType("session_type").notNull(),
    sessionDurationSeconds: integer("session_duration_seconds").notNull(),
    remainingSeconds: integer("remaining_seconds").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_user_timer_events_user_occurred").on(t.userId, t.occurredAt),
  ],
);
