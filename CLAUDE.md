## General rules

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

Spine: _input → tagging → attention → scheduling_. A tag is a policy (answer "within N min" or "in next timeblock for this tag"), not a label.

## Architecture & refactor (pragmatic DDD)

- **Source of truth:** `docs/architecture/` (README, `01-current-state` … `07-roadmap`, `adr/`). As-built platform refs: `docs/platform/{events,jobs,errors}.md`. Read `07-roadmap.md` before any structural work.
- **Target:** modular monolith, 10 bounded contexts under `apps/api/src/<context>/`, layers `contract / domain / application / infrastructure / presentation`, contexts talk only via `contract/`, Postgres schema per context (no cross-schema FKs except `users`). Rich aggregates only where a real state machine exists. Not doing: microservices, CQRS/event sourcing, VO per primitive, packages per context, rewrites.
- **Shared code:** `kernel/` (pure, domain may import) vs `platform/` (framework-aware: clock, db, events, jobs, errors, logger…; never imports a context).
- **Ports:** `abstract class` = contract + DI token (no `Symbol` tokens). Services never hit DB directly — always via repository.
- **Errors:** one `DomainError` + per-context catalogs; HTTP status decided at edge.
- **Events/jobs:** outbox events, one `key_strict_fifo` queue per consumer group + dead-letter table; one typed jobs API.
- **Status (2026-10-15):** Wave 0 ✅ (test split, kernel/platform, typed errors, events, jobs), Wave 1 ✅ (`Actor`, due-date policy, batch status, `Timer`, `RecurrenceRule`), Wave 2 ✅ (repository ports, `contract/` ports, auth↔sharing inversion), Wave 3 ✅ (all contexts layered + renamed: `files`, `focus`, `network`, `sharing`, `attention`, `conversations`; boundary lint as `error`), Wave 4 ✅ (Nest 11; `RealtimeBroadcaster` port in `platform/realtime/`, per-context broadcasters + WS gateways; messaging on `Actor`; `websockets` = pure transport, no boundary warnings).
- **Next: Wave 5** — rich aggregates. Then: 6 attention core redesign, 7 schema per context, 8 cleanup.
- **Placement:** `<ctx>/{contract,domain,application,infrastructure,presentation}/` + root `<ctx>.module.ts`, `<ctx>.errors.ts` (docs/architecture/03-layering.md §3). Job definitions in `application/jobs/`; event-payload views in `application/read/`. `pnpm lint` enforces layers (ESLint boundaries) + cross-context rules (`pnpm lint:boundaries`, dependency-cruiser).
- **Roadmap upkeep:** mark shipped steps ✅ (table + heading), don't delete them; keep `01-current-state.md` reflecting reality.
- New/touched application methods take `Actor`, not `userId: string`.

## Development Notes

- **Keep components focused and testable**
- **Follow the established patterns for consistency**
- **DON'T USE BARREL EXPORTS**
- **User import aliases** Avoid relative imports, use import aliases as defined in tsconfig
- **Always prompt me for dev/runtime commands** Never run things like `pnpm run dev`, migrations (`pnpm run migrate`), or docker (`localdev:*`, `test:integration:up`) yourself; prompt me so i can do it manually; and then continue after i done so. Exception: drizzle-kit commands may run without prompting
- **Verify changes yourself** After any bigger change (multi-file, refactor step) or any change that impacts functionality, run in order:
  1. `pnpm run fix-imports` (normalizes imports to tsconfig aliases, defaults to `apps/api`)
  2. `pnpm run lint` — if it fails, fix the errors (`pnpm run lint:fix` first for import order / unused imports, then fix the rest by hand) and re-run until clean
  3. `pnpm run test:all` (unit + integration; integration needs test DB — if it's down, prompt me to run `pnpm run test:integration:up`)
     Report failures with real output; don't guess causes from truncated logs.
- **Tests:** `apps/api/test/<module>/*.unit.test.ts` (no Postgres) and `*.integration.test.ts` (shared test DB, wiped each run). New domain logic ships with a unit test.
- Local dev uses `localdev/` docker compose for Postgres + pgvector; Drizzle migrations live in `apps/migrations`

## Project Notes

- Monorepo via pnpm workspaces: `apps/*`, `scripts`
- Node `24.13.0`, pnpm `10.15.0` (root package.json engines)
- Root scripts: `dev`, `migrate`, `generate-migrations`, `localdev:{up,down,reset}`, `test:integration:{up,down,reset}`, `test:{unit,integration,all}`, `lint`, `fix-imports`, `secret:better-auth`, `prepare-storage`
- Env examples: `apps/api/.env.example`, `apps/migrations/.env.example`
- Tech: TypeScript, NestJS 11 (api), Drizzle ORM + drizzle-kit, Postgres + pgvector, pg-boss, better-auth, Garage (S3 storage)
- Tooling: pnpm, ESLint, Prettier, Jest, ts-jest, tsx
- Structure: `apps/api`, `apps/migrations`, `scripts`
