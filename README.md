# Asksynk backend monorepo

SaaS backend for asynchronous communication: calendars, tags, questions, and channel-driven response preferences.

## Structure

- `apps/api`: NestJS API server
- `apps/sse`: SSE server
- `apps/background-worker`: Lambda worker for SQS tasks
- `apps/cron`: Lambda cron tasks
- `packages/shared`: shared utilities
- `infra`: CDK IaC
- `scripts`: utility scripts
- `localdev`: local Docker + Localstack setup

## Tooling

- Node 24
- pnpm 10.15.0
- TypeScript (moduleResolution bundler)

## Local dev (start)

1. Install deps: `pnpm install`
2. Run API: `pnpm dev:api`

## Notes

- Use absolute imports with `@/` (convex exception only)
- Avoid barrel exports
