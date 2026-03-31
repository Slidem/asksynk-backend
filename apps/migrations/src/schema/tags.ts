import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { uuid } from "drizzle-orm/pg-core";

type AnswerMode =
  | { type: "immediately"; responseTimeMillis: number }
  | { type: "timeblock" };

export const tags = pgTable("tags", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: text("user_id").notNull(),
  name: text("name").unique().notNull(),
  description: text("description"),
  color: text("color").notNull(),
  answerMode: jsonb("answer_mode")
    .notNull()
    .$type<AnswerMode>()
    .default(sql`'{"type":"immediately","responseTimeMillis":0}'::jsonb`),
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
