import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { calendarEventExceptions } from "@/migrations/schema/calendarEventsExceptions";
import { calendarEventTags } from "@/migrations/schema/calendarEventTags";
import { calendarEvents } from "@/migrations/schema/calendarEvents";
import { calendars } from "@/migrations/schema/calendars";
import { tags } from "@/migrations/schema/tags";
import { users } from "@/migrations/schema/users";

export type DB = ReturnType<typeof getDbInstance>;

export const getDbInstance = (config: ConfigService) => {
  const dbUrl: string = config.getOrThrow("DATABASE_URL");

  const pool = new Pool({
    connectionString: dbUrl,
    min: config.get<number>("DB_POOL_MIN") ?? 2,
    max: config.get<number>("DB_POOL_MAX") ?? 10,
  });

  const isDev = config.get<string>("ENVIRONMENT") === "dev";

  return drizzle(pool, {
    schema: {
      tags,
      users,
      calendars,
      calendarEvents,
      calendarEventExceptions,
      calendarEventTags,
    },
    logger: isDev,
  });
};
