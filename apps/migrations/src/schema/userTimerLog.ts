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

export const timerTransition = pgEnum("timer_transition", [
  "started",
  "paused",
  "resumed",
  "stopped",
  "completed",
]);

export const userTimerLog = pgTable(
  "user_timer_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    transition: timerTransition("transition").notNull(),
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
  (t) => [index("idx_user_timer_log_user_occurred").on(t.userId, t.occurredAt)],
);
