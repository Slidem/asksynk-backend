import { index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { messages } from "@/migrations/schema/messaging";
import { tags } from "@/migrations/schema/tags";

export const messageTags = pgTable(
  "message_tags",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.tagId] }),
    index("idx_message_tags_tag").on(t.tagId),
  ],
);
