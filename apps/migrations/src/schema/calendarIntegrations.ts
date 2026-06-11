import { sql } from "drizzle-orm";
import {
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

export const calendarIntegrationStatus = pgEnum("calendar_integration_status", [
  "active",
  "error",
  "revoked",
]);

export const calendarSyncDirection = pgEnum("calendar_sync_direction", [
  "bidirectional",
  "readonly",
]);

export interface CalendarIntegrationCredentials {
  accessToken: string | null;
  refreshToken: string | null;
  // epoch millis at which the access token expires
  expiresAt: number | null;
  scope: string | null;
  tokenType: string | null;
}

export interface CalendarIntegrationProviderData {
  accountEmail: string | null;
}

export const calendarIntegrations = pgTable(
  "calendar_integrations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    status: calendarIntegrationStatus("status").notNull().default("active"),
    syncDirection: calendarSyncDirection("sync_direction")
      .notNull()
      .default("readonly"),
    credentials: jsonb("credentials")
      .$type<CalendarIntegrationCredentials>()
      .notNull(),
    providerData: jsonb("provider_data")
      .$type<CalendarIntegrationProviderData>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_calendar_integrations_account").on(
      t.userId,
      t.provider,
      t.externalAccountId,
    ),
    index("idx_calendar_integrations_user").on(t.userId),
  ],
);
