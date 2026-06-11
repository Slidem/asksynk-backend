import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { calendarIntegrations } from "@/migrations/schema/calendarIntegrations";
import { users } from "@/migrations/schema/users";

export interface CalendarProviderState {
  // provider calendar's default IANA timezone — fallback for imported events
  // whose own start/end carry no timezone (e.g. Google single timed events)
  timezone?: string;
  // the account's primary calendar — outbound mirror target for native events
  isPrimary?: boolean;
  // webhook watch channel state (populated only once webhooks land)
  watchChannelId?: string;
  watchResourceId?: string;
  watchExpiresAt?: number;
}

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
    // provider calendar display name (null for the native asksynk calendar)
    name: text("name"),
    color: text("color"),
    externalId: text("external_id"),
    // null for the native asksynk calendar; set for provider-backed calendars
    integrationId: uuid("integration_id").references(
      () => calendarIntegrations.id,
      { onDelete: "cascade" },
    ),
    syncEnabled: boolean("sync_enabled").notNull().default(false),
    // per-calendar incremental sync cursor (provider sync token)
    syncToken: text("sync_token"),
    providerState: jsonb("provider_state")
      .$type<CalendarProviderState>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("calendars_user_asksynk_unique")
      .on(t.userId)
      .where(sql`source = 'asksynk'`),
    uniqueIndex("uq_calendars_integration_external")
      .on(t.integrationId, t.externalId)
      .where(sql`integration_id IS NOT NULL`),
    index("idx_calendars_user").on(t.userId),
    index("idx_calendars_integration").on(t.integrationId),
  ],
);
