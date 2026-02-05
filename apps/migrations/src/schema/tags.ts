import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

export const answerModeEnum = pgEnum("answer_mode", [
  "timeblock",
  "immediately",
]);

export const tags = pgTable("tags", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull(),
  answerMode: answerModeEnum("answer_mode").notNull(),
  responseTimeMillis: integer("responfications_settings_time_millis"),
  notificationsSettings: jsonb("notifications_settings")
    .notNull()
    .$type<{
      browserNotificationEnabled: boolean;
      soundNotificationEnabled: boolean;
    }>()
    .default(
      sql`'{"browserNotificationEnabled":true,"soundNotificationEnabled":true}'::jsonb`,
    ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
