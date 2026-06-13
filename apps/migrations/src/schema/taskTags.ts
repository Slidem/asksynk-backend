import { index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { tags } from "@/migrations/schema/tags";
import { tasks } from "@/migrations/schema/tasks";

export const taskTags = pgTable(
  "task_tags",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.tagId] }),
    index("idx_task_tags_tag").on(t.tagId),
  ],
);
