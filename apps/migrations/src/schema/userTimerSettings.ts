import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "@/migrations/schema/users";

export const userTimerSettings = pgTable(
  "user_timer_settings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    focusDurationSeconds: integer("focus_duration_seconds")
      .notNull()
      .default(1500),
    shortBreakDurationSeconds: integer("short_break_duration_seconds")
      .notNull()
      .default(300),
    longBreakDurationSeconds: integer("long_break_duration_seconds")
      .notNull()
      .default(900),
    longBreakInterval: integer("long_break_interval").notNull().default(4),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uq_user_timer_settings_user").on(t.userId)],
);
