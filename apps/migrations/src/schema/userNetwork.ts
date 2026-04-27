import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "@/migrations/schema/users";

export const userInvites = pgTable(
  "user_invites",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    inviterUserId: text("inviter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteeEmail: text("invitee_email").notNull(),
    status: text("status", {
      enum: ["pending", "accepted", "rejected"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_user_invites_inviter_email_pending")
      .on(t.inviterUserId, t.inviteeEmail)
      .where(sql`status = 'pending'`),
    index("idx_user_invites_invitee_email").on(t.inviteeEmail),
  ],
);

export const userNetwork = pgTable(
  "user_network",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.connectionId] }),
    index("idx_user_network_connection").on(t.connectionId),
    index("idx_user_network_active")
      .on(t.userId)
      .where(sql`removed_at IS NULL`),
    check("chk_user_network_no_self", sql`user_id <> connection_id`),
  ],
);
