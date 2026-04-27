import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "@/migrations/schema/users";

export const publicViews = pgTable(
  "public_views",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    name: text("name"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_public_views_owner").on(t.ownerUserId)],
);

export const publicViewGuests = pgTable(
  "public_view_guests",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    publicViewId: uuid("public_view_id")
      .notNull()
      .references(() => publicViews.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_public_view_guests_view").on(t.publicViewId)],
);
