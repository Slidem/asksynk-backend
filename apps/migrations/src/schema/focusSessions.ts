import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "@/migrations/schema/users";

export const focusSessionEndReason = pgEnum("focus_session_end_reason", [
  "manual_reset",
  "inactivity",
  "settings_changed",
]);

/** Timer settings a session ran with; block durations are read from it. */
export type FocusSessionSettings = {
  focusDurationSeconds: number;
  shortBreakDurationSeconds: number;
  longBreakDurationSeconds: number;
  longBreakInterval: number;
};

export const focusSessions = pgTable(
  "focus_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    endReason: focusSessionEndReason("end_reason"),
    completedFocusBlocks: integer("completed_focus_blocks")
      .notNull()
      .default(0),
    shortBreaks: integer("short_breaks").notNull().default(0),
    longBreaks: integer("long_breaks").notNull().default(0),
    settings: jsonb("settings").$type<FocusSessionSettings>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_focus_sessions_user_started").on(t.userId, t.startedAt)],
);
