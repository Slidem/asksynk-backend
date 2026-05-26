import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { attentionItems } from "@/migrations/schema/attentionItems";
import { attentionItemTags } from "@/migrations/schema/attentionItemTags";
import { calendarEvents } from "@/migrations/schema/calendarEvents";
import { calendarEventExceptions } from "@/migrations/schema/calendarEventsExceptions";
import { calendarEventTags } from "@/migrations/schema/calendarEventTags";
import { calendars } from "@/migrations/schema/calendars";
import {
  messages,
  messageThreads,
  threadParticipants,
} from "@/migrations/schema/messaging";
import { eventsOutbox } from "@/migrations/schema/outbox";
import { publicViewGuests, publicViews } from "@/migrations/schema/publicViews";
import { tags } from "@/migrations/schema/tags";
import { userInvites, userNetwork } from "@/migrations/schema/userNetwork";
import { users } from "@/migrations/schema/users";

export type DB = ReturnType<typeof getDbInstance>;

export const getDbInstance = (config: ConfigService) => {
  const dbUrl: string = config.getOrThrow("DATABASE_URL");

  const pool = new Pool({
    connectionString: dbUrl,
    min: config.get<number>("DB_POOL_MIN") ?? 2,
    max: config.get<number>("DB_POOL_MAX") ?? 10,
  });

  return drizzle(pool, {
    schema: {
      attentionItems,
      attentionItemTags,
      tags,
      users,
      calendars,
      calendarEvents,
      calendarEventExceptions,
      calendarEventTags,
      userInvites,
      userNetwork,
      publicViews,
      publicViewGuests,
      messageThreads,
      threadParticipants,
      messages,
      eventsOutbox,
    },
    // logger: config.get<string>("ENVIRONMENT") === "dev",
  });
};
