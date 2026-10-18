# Wave 5 — Rich aggregates (plan)

Roadmap: [07 §Wave 5](../07-roadmap.md#wave-5--rich-aggregates). Pattern:
[ADR 0008](../adr/0008-self-mutating-aggregates.md). Methods: [03 §7](../03-layering.md#7-rich-vs-not).

Goal: aggregates hold their rules and state; the application loads → calls methods →
`save` → jobs. `save` checks `version` and flushes recorded events to the outbox.
`Timer` is rebuilt first and is the reference the other aggregates copy.

## Decisions (agreed)

- Optimistic concurrency: `version` column, conflict → `core.concurrency_conflict` (409).
- Events flushed inside `repo.save`, same tx; no `EventsPublisher` in services for
  aggregate changes.
- Domain events ≠ wire events; one mapper per aggregate in `infrastructure/persistence/`.
- Job schedule/cancel stays in the application service (jobs join the tx, ADR 0007).
- No generic CRUD repository; typed records keep their repositories; append-only side
  tables (logs) get their own repository.
- Touched application methods take `Actor`.

## Done

5.0 base (`kernel/domain/aggregate-root.ts`, `core.concurrency_conflict`) and 5.1
`Timer`. Reference implementation to copy:

| Layer | File |
| --- | --- |
| Aggregate + domain event | `focus/domain/timer.ts`, `focus/domain/timer.events.ts` |
| Port | `focus/domain/ports/timers.repository.ts` (`ensure`, `getByUserId`, `save`) |
| `save` + mapper | `focus/infrastructure/persistence/drizzle-timers.repository.ts`, `timer-events.mapper.ts` |
| Application | `focus/application/timers.service.ts` (load → method → `save` → jobs; conflict reload on lazy `GET`) |
| Tests | `test/focus/timer.unit.test.ts`, `test/focus/timers.integration.test.ts` (stale version, rollback) |

## Next — remaining aggregates (5.2–5.7)

`TaskSuggestion` → `Invite` → `Task`/`TaskBatch` → `AttentionItem` → `CalendarEvent` →
`CalendarIntegration`. Each gets its own section here (methods, events + mapper,
`version` migration, service rewrite, tests) before it starts, written from the code
at that time.

## Verification (every step)

`pnpm run fix-imports` → `pnpm run lint` → `pnpm run test:all`. Migrations: drizzle-kit
generate runs here; `pnpm run migrate` and `test:integration:up` by the user.
