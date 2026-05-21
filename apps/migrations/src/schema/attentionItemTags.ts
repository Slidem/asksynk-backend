import { index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { attentionItems } from "@/migrations/schema/attentionItems";
import { tags } from "@/migrations/schema/tags";

export const attentionItemTags = pgTable(
  "attention_item_tags",
  {
    attentionItemId: uuid("attention_item_id")
      .notNull()
      .references(() => attentionItems.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.attentionItemId, t.tagId] }),
    index("idx_attention_item_tags_tag").on(t.tagId),
  ],
);
