import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { publicViewGuests, publicViews } from "@/migrations/schema/publicViews";
import { users } from "@/migrations/schema/users";

export const messageThreads = pgTable(
  "message_threads",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    publicViewId: uuid("public_view_id").references(() => publicViews.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_message_threads_public_view").on(t.publicViewId)],
);

export const threadParticipants = pgTable(
  "thread_participants",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => messageThreads.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    guestId: uuid("guest_id").references(() => publicViewGuests.id, {
      onDelete: "cascade",
    }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "chk_thread_participant_one_of",
      sql`(user_id IS NOT NULL) <> (guest_id IS NOT NULL)`,
    ),
    uniqueIndex("uq_thread_participants_user")
      .on(t.threadId, t.userId)
      .where(sql`user_id IS NOT NULL`),
    uniqueIndex("uq_thread_participants_guest_per_thread")
      .on(t.threadId, t.guestId)
      .where(sql`guest_id IS NOT NULL`),
    uniqueIndex("uq_thread_participants_guest_single_thread")
      .on(t.guestId)
      .where(sql`guest_id IS NOT NULL`),
    index("idx_thread_participants_user").on(t.userId),
    index("idx_thread_participants_guest").on(t.guestId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => messageThreads.id, { onDelete: "cascade" }),
    senderUserId: text("sender_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    senderGuestId: uuid("sender_guest_id").references(
      () => publicViewGuests.id,
      { onDelete: "set null" },
    ),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "chk_messages_sender_one_of",
      sql`(sender_user_id IS NOT NULL) <> (sender_guest_id IS NOT NULL)`,
    ),
    index("idx_messages_thread_created").on(t.threadId, t.createdAt),
  ],
);
