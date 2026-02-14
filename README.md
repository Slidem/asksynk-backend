# Asksynk backend monorepo

SaaS backend for asynchronous communication: calendars, tags, questions, and channel-driven response preferences.

## Structure

- `apps/api`: NestJS API server
- `apps/background-worker`: Pub sub consumer
- `apps/cron`: Cron jobs
- `packages/shared`: shared utilities
- `infra`: containerized applications, will be using Railway for prod
- `scripts`: utility scripts
- `localdev`: local Docker

## Tooling

- Node 24
- pnpm 10.15.0
- TypeScript (moduleResolution bundler)

## Local dev (start)

1. Install deps: `pnpm install`
2. Run API: `pnpm dev:api`

## Local dev (email)

- Mailpit is used for local SMTP capture
- UI: http://localhost:8025
- SMTP: localhost:1025
- Keycloak uses Mailpit via realm import config
- Background worker sends via SMTP when `ENVIRONMENT=dev`
- Optional vars: `SMTP_HOST`, `SMTP_PORT`

## Notes

- Use absolute imports with `@/` (convex exception only)
- Avoid barrel exports
