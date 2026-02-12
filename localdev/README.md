# Local dev

Local development environment using Docker Compose.

## Goals

- Local Postgres (pgvector extension enabled)
- Local Keycloak (realm import, test users)

## Commands

- Start: `pnpm localdev:up`
- Stop: `pnpm localdev:down`
- Reset (drop volume): `pnpm localdev:reset`

## DB

- URL: `postgres://asksynk:asksynk@localhost:5432/asksynk`

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
