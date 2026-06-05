import { spawnSync } from "child_process";
import * as dotenv from "dotenv";
import * as path from "path";
import { Client } from "pg";

export default async function globalSetup() {
  dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });
  const migrationsDir = path.resolve(__dirname, "../../../migrations");
  const drizzleKit = path.join(migrationsDir, "node_modules/.bin/drizzle-kit");
  const result = spawnSync(drizzleKit, ["push", "--force"], {
    cwd: migrationsDir,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL!,
    },
    stdio: "pipe",
    encoding: "utf-8",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    throw new Error(`db:push failed with exit code ${result.status}`);
  }

  // drizzle-kit push only syncs schema; rows + pg-boss jobs survive across runs.
  // Orphaned durable events (whose user was later deleted) would be re-dispatched
  // every run and fail the user FK forever. Start from a clean slate instead.
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    if (rows.length > 0) {
      const tables = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
      await client.query(`TRUNCATE ${tables} CASCADE`);
    }
    // pg-boss recreates its schema on start, so dropping it clears stale jobs.
    await client.query(`DROP SCHEMA IF EXISTS pgboss CASCADE`);
  } finally {
    await client.end();
  }
}
