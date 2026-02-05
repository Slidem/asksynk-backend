import "dotenv/config";

import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://asksynk:asksynk@localhost:5432/asksynk";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  out: "./migrations",
  dbCredentials: {
    url: databaseUrl,
  },
});
