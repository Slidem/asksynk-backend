import { spawnSync } from "child_process";
import * as dotenv from "dotenv";
import * as path from "path";

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
}
