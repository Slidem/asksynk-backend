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

import {
  focusSessionEndReason,
  focusSessions,
} from "@/migrations/schema/focusSessions";
import { users } from "@/migrations/schema/users";
import { timerMode } from "@/migrations/schema/userTimers";

export const timerTransition = pgEnum("timer_transition", [
  "started",
  "paused",
  "resumed",
  "stopped",
  "completed",
  "skipped",
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
    sessionId: uuid("session_id")
      .notNull()
      .references(() => focusSessions.id, { onDelete: "cascade" }),
    transition: timerTransition("transition").notNull(),
    mode: timerMode("mode").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    remainingSeconds: integer("remaining_seconds").notNull(),
    // Set when a reset abandoned the block; null = the user's own action.
    reason: focusSessionEndReason("reason"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_user_timer_log_user_occurred").on(t.userId, t.occurredAt)],
);
