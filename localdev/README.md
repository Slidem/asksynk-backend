# Local dev

Local development environment using Docker Compose.

## Goals

- Local Postgres (pgvector extension enabled)
- Local Keycloak (realm import, test users)

## Commands

- Start: `pnpm localdev:up`
- Stop: `pnpm localdev:down`
- Reset (drop volume): `pnpm localdev:reset`

## Integration test stack

Separate Postgres + Garage (`docker-compose.test.yml`), ports `5433` / `3910`.

- Start: `pnpm test:integration:up`
- Stop (drops volume): `pnpm test:integration:down`
- Reset: `pnpm test:integration:reset`

Migrations run automatically in jest `globalSetup`. Reset is only needed when an
already-applied migration was edited, deleted, or regenerated — `drizzle-kit
migrate` tracks a single high-water mark and never re-checks file contents, so
rewritten history either silently skips or collides.

## DB

- URL: `postgres://asksynk:asksynk@localhost:5432/asksynk`
- Test URL: `postgres://asksynk:asksynk@localhost:5433/asksynk_test`

## Keycloak

- URL: `http://localhost:8080`
- Admin: `admin` / `admin`
- Realm: `asksynk`
- Clients:
  - `asksynk-web` redirect `https://localhost:5137/*`
  - `asksynk-mobile` redirect `myapp://*`
- Test users (password `password`):
  - `test.user`
  - `dev.user`
