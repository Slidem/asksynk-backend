import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "@/migrations/schema/users";

export const attachmentPlacement = pgEnum("attachment_placement", [
  "public",
  "message",
]);

export const attachmentStatus = pgEnum("attachment_status", [
  "pending",
  "active",
]);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    placement: attachmentPlacement("placement").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes"),
    fileName: text("file_name"),
    status: attachmentStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_attachments_storage_key").on(t.storageKey),
    index("idx_attachments_owner_status").on(t.ownerUserId, t.status),
  ],
);
