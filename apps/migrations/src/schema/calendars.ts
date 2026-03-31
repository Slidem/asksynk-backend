import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "@/migrations/schema/users";

export const calendars = pgTable(
  "calendars",
  {
    id: uuid("id")
      .primaryKey()
      .notNull()
      .default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    color: text("color"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("calendars_user_asksynk_unique")
      .on(t.userId)
      .where(sql`source = 'asksynk'`),
    index("idx_calendars_user").on(t.userId),
  ],
);
