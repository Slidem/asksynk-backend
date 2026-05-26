- In all interactions and commit messages, be extremely concise, and sacrifice grammar for the sake of concision.
- Don't overengineer (YAGNI)
- Keep best coding practices, and keep things simple

## Plan

- At the end of each plan, give me a list of unresolved questions to answer, if any. Make the questions extremely concise, sacrifice grammar for the sake of concision.
- Don't implement things we are not using (use the YAGNI principle)
- Don't design for backwards compatibility, as this project is in MVP state

## Project overview

Asksynk is a productivity app, that's aimed to give user's full control over their attention, their schedule, and how / when they decided to respond to incoming messages from various communication channels.
By leveraging tags as a barrier between incoming communication channels and a user's schedule, users choose how tagged information will be answered. Incoming communication channels: in app message threads, integration with gmail, slack, whatsapp. Calendar integration: two way sync with different calendars (gcal), in app custom calendar. Asksynk will also provide public links for readonly views of a user's schedule (with possibility of directly addressing an issue on a user's timeblock) and also provides the ability to create "networks" of users, that have more access to someones calendar in their network (suggest timeblocks, suggest tasks etc).

## Development Notes

- **Keep components focused and testable**
- **Follow the established patterns for consistency**
- **DON'T USE BARREL EXPORTS**
- **Never fix linting issue** Skip linting issues, I'll fix any linting issue myself
- **Never fix import ordering, or unused imports** I'll fix those myself
- **User import aliases** Avoid relative imports, use import aliases as defined in tsconfig
- **Always prompt me for testing commands** Never run any commands to test implementation like "pnpm run dev:api" or running migrations yourself; prompt me so i can do it manually; and then continue after i done so
- Local dev uses `localdev/` docker compose for Postgres + pgvector; Drizzle migrations live in `apps/migrations`

## Project Notes

- Monorepo via pnpm workspaces: `apps/*`, `packages/*`, `scripts`
- Node `24.13.0`, pnpm `10.15.0` (root package.json engines)
- Root scripts: `dev`, `dev:migrate`, `localdev:{up,down,reset}`, `secret:better-auth`
- Env examples: `apps/api/.env.example`, `apps/background-worker/.env.example`, `apps/migrations/.env.example`
- Tech: TypeScript, NestJS (api/worker), Drizzle ORM + drizzle-kit, Postgres + pgvector, pg-boss, better-auth
- Tooling: pnpm, ESLint, Prettier, Jest, ts-jest, tsx
- Structure: `apps/api`, `apps/migrations`, `packages/shared`, `scripts`
