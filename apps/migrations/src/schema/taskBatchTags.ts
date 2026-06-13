import { index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { tags } from "@/migrations/schema/tags";
import { taskBatches } from "@/migrations/schema/taskBatches";

export const taskBatchTags = pgTable(
  "task_batch_tags",
  {
    batchId: uuid("batch_id")
      .notNull()
      .references(() => taskBatches.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.batchId, t.tagId] }),
    index("idx_task_batch_tags_tag").on(t.tagId),
  ],
);
