# Migrations

Drizzle migrations for the API database.

## Local DB

- URL: `postgres://asksynk:asksynk@localhost:5432/asksynk`

## Commands

- Generate: `pnpm --filter @asksynk/migrations db:generate`
- Migrate: `pnpm --filter @asksynk/migrations db:migrate`
- Push (dev): `pnpm --filter @asksynk/migrations db:push`
