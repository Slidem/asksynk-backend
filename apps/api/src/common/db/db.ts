import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { calendars } from "@/migrations/schema/calendars";
import { eventExceptions } from "@/migrations/schema/event_exceptions";
import { eventTags } from "@/migrations/schema/event_tags";
import { events } from "@/migrations/schema/events";
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
  return drizzle(pool, { schema: { tags, users, calendars, events, eventExceptions, eventTags } });
};
