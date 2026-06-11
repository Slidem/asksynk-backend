import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { calendarIntegrations } from "@/migrations/schema/calendarIntegrations";

export const calendarLinkOrigin = pgEnum("calendar_link_origin", [
  "imported",
  "mirrored",
]);

// Maps an asksynk calendar event to its counterpart in an external provider.
// `imported`: external event pulled into asksynk (read-only). `mirrored`: native
// asksynk event pushed out to the provider. One native event can mirror to N
// integrations, hence a junction table rather than columns on calendar_events.
//
// `asksynkEventId` deliberately has NO FK cascade: a `mirrored` link must outlive
// the native event's deletion so the async outbound handler can still delete the
// external counterpart. Cleanup is explicit (sync service for imports; the
// outbound handler for mirrors) and `integrationId`'s cascade covers disconnects.
export const calendarEventLinks = pgTable(
  "calendar_event_links",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    asksynkEventId: uuid("asksynk_event_id").notNull(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => calendarIntegrations.id, { onDelete: "cascade" }),
    externalCalendarId: text("external_calendar_id").notNull(),
    externalEventId: text("external_event_id").notNull(),
    etag: text("etag"),
    origin: calendarLinkOrigin("origin").notNull(),
    // recurrence fidelity was lost on import (multi-RRULE/RDATE/EXRULE dropped)
    degraded: boolean("degraded").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_calendar_event_links_external").on(
      t.integrationId,
      t.externalEventId,
    ),
    uniqueIndex("uq_calendar_event_links_event_integration").on(
      t.asksynkEventId,
      t.integrationId,
    ),
    index("idx_calendar_event_links_event").on(t.asksynkEventId),
  ],
);
