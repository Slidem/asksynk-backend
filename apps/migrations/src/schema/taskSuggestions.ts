import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "@/migrations/schema/users";

export const taskSuggestions = pgTable(
  "task_suggestions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    suggesterUserId: text("suggester_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    suggesteeUserId: text("suggestee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "accepted", "rejected"],
    })
      .notNull()
      .default("pending"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_task_suggestions_suggestee_status").on(
      t.suggesteeUserId,
      t.status,
    ),
    index("idx_task_suggestions_suggester").on(t.suggesterUserId),
  ],
);
