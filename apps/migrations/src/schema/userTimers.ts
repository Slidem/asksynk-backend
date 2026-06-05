import { sql } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "@/migrations/schema/users";

export const timerStatus = pgEnum("timer_status", [
  "idle",
  "running",
  "paused",
  "completed",
  "stopped",
]);

export const timerSessionType = pgEnum("timer_session_type", [
  "focus",
  "short_break",
  "long_break",
]);

export const userTimers = pgTable(
  "user_timers",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: timerStatus("status").notNull().default("idle"),
    sessionType: timerSessionType("session_type"),
    sessionDurationSeconds: integer("session_duration_seconds"),
    transitionedAt: timestamp("transitioned_at", { withTimezone: true }),
    remainingAtTransition: integer("remaining_at_transition"),
    pendingCompletionJobRef: text("pending_completion_job_ref"),
    completedFocusSessions: integer("completed_focus_sessions")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uq_user_timers_user").on(t.userId)],
);
