import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "@/migrations/schema/users";

export const attentionItemType = pgEnum("attention_item_type", [
  "tagged_message",
  "incoming_email",
  "slack_message",
  "whatsapp_message",
  "suggested_timeblock",
  "suggested_task",
]);

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
    type: attentionItemType("type").notNull(),
    status: attentionItemStatus("status").notNull().default("created"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    note: text("note"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    sourceCalendarEventId: uuid("source_calendar_event_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_attention_items_user_status")
      .on(t.userId, t.status)
      .where(sql`deleted_at IS NULL`),
    index("idx_attention_items_user_due_date")
      .on(t.userId, t.dueDate)
      .where(sql`deleted_at IS NULL AND status != 'resolved'`),
    index("idx_attention_items_source_calendar_event")
      .on(t.sourceCalendarEventId)
      .where(
        sql`deleted_at IS NULL AND status != 'resolved' AND source_calendar_event_id IS NOT NULL`,
      ),
  ],
);
