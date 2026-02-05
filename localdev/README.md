# Local dev

Local development environment using Docker Compose.

## Goals

- Local Postgres (pgvector extension enabled)

## Commands

- Start: `pnpm localdev:up`
- Stop: `pnpm localdev:down`
- Reset (drop volume): `pnpm localdev:reset`

## DB

- URL: `postgres://asksynk:asksynk@localhost:5432/asksynk`
