import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { taskBatches } from "@/migrations/schema/taskBatches";
import { tasks } from "@/migrations/schema/tasks";
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
    // Set on accept: the suggestion materializes exactly one task XOR one batch.
    // Both null while pending/rejected. Drives materializedTasks + reverse lookup
    // for the suggestion.updated broadcast.
    materializedTaskId: uuid("materialized_task_id").references(
      () => tasks.id,
      {
        onDelete: "set null",
      },
    ),
    materializedBatchId: uuid("materialized_batch_id").references(
      () => taskBatches.id,
      { onDelete: "set null" },
    ),
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
    index("idx_task_suggestions_materialized_task")
      .on(t.materializedTaskId)
      .where(sql`materialized_task_id IS NOT NULL`),
    index("idx_task_suggestions_materialized_batch")
      .on(t.materializedBatchId)
      .where(sql`materialized_batch_id IS NOT NULL`),
    check(
      "chk_task_suggestions_materialized_one",
      sql`num_nonnulls(materialized_task_id, materialized_batch_id) <= 1`,
    ),
  ],
);
