import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { taskBatches } from "@/migrations/schema/taskBatches";
import { users } from "@/migrations/schema/users";

export const taskStatus = pgEnum("task_status", [
  "todo",
  "in_progress",
  "completed",
]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    batchId: uuid("batch_id").references(() => taskBatches.id, {
      onDelete: "cascade",
    }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assigneeUserId: text("assignee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatus("status").notNull().default("todo"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_tasks_created_by_status")
      .on(t.createdBy, t.status)
      .where(sql`deleted_at IS NULL`),
    index("idx_tasks_assignee_status")
      .on(t.assigneeUserId, t.status)
      .where(sql`deleted_at IS NULL`),
    index("idx_tasks_batch")
      .on(t.batchId)
      .where(sql`deleted_at IS NULL`),
  ],
);
