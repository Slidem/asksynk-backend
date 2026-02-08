import { answerModeEnum, tags } from "@/migrations/schema/tags";

import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

export type DB = ReturnType<typeof getDbInstance>;

export const getDbInstance = (config: ConfigService) => {
  const dbUrl: string = config.getOrThrow("DATABASE_URL");
  const pool = new Pool({
    connectionString: dbUrl,
    min: config.get<number>("DB_POOL_MIN") ?? 2,
    max: config.get<number>("DB_POOL_MAX") ?? 10,
  });
  return drizzle(pool, { schema: { answerModeEnum, tags } });
};
