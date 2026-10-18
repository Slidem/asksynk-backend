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

import { focusSessions } from "@/migrations/schema/focusSessions";
import { users } from "@/migrations/schema/users";

export const timerStatus = pgEnum("timer_status", [
  "idle",
  "running",
  "paused",
  "completed",
]);

export const timerMode = pgEnum("timer_mode", [
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
    mode: timerMode("mode"),
    transitionedAt: timestamp("transitioned_at", { withTimezone: true }),
    remainingAtTransition: integer("remaining_at_transition"),
    currentSessionId: uuid("current_session_id").references(
      () => focusSessions.id,
      { onDelete: "set null" },
    ),
    focusBlocksUntilLongBreak: integer("focus_blocks_until_long_break"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uq_user_timers_user").on(t.userId)],
);
