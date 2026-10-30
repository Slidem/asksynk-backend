import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "@/migrations/schema/users";

export const attentionItemStatus = pgEnum("attention_item_status", [
  "created",
  "in_progress",
  "resolved",
]);

export const attentionItems = pgTable(
  "attention_items",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 'conversations' | 'tasks' | 'channels.gmail' | …; text so a channel needs no migration.
    sourceContext: text("source_context").notNull(),
    // 'message' | 'task' | 'task_batch' | 'task_suggestion'
    sourceKind: text("source_kind").notNull(),
    // Opaque to attention.
    sourceId: text("source_id").notNull(),
    // Display only; never queried.
    preview: jsonb("preview").$type<Record<string, unknown>>().notNull(),
    status: attentionItemStatus("status").notNull().default("created"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    dueDatePinned: boolean("due_date_pinned").notNull().default(false),
    // Soft ref into scheduling.
    dueSourceEventId: uuid("due_source_event_id"),
    // User tombstone; sticky.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Covers tombstones — that is what makes a user delete sticky.
    uniqueIndex("uq_attention_items_source").on(
      t.userId,
      t.sourceContext,
      t.sourceKind,
      t.sourceId,
    ),
    index("idx_attention_items_user_status")
      .on(t.userId, t.status)
      .where(sql`deleted_at IS NULL`),
    index("idx_attention_items_user_due_date")
      .on(t.userId, t.dueDate)
      .where(sql`deleted_at IS NULL AND status != 'resolved'`),
    index("idx_attention_items_due_source_event")
      .on(t.dueSourceEventId)
      .where(
        sql`deleted_at IS NULL AND status != 'resolved' AND due_source_event_id IS NOT NULL`,
      ),
  ],
);
