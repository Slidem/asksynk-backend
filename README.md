# Asksynk backend monorepo

SaaS backend for asynchronous communication: calendars, tags, questions, and channel-driven response preferences.

## Structure

- `apps/api`: NestJS API server
- `packages/shared`: shared utilities
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

## Notes

- Use absolute imports with `@/` (convex exception only)
- Avoid barrel exports
