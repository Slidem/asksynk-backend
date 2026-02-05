import { answerModeEnum, tags } from "@/migrations/schema/tags";

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://asksynk:asksynk@localhost:5432/asksynk";

const pool = new Pool({ connectionString: databaseUrl });

export const db = drizzle(pool, { schema: { answerModeEnum, tags } });
