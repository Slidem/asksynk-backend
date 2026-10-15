# ADR 0008 — Self-mutating aggregates; `save` checks version and flushes events

**Status:** Accepted (2026-10-15) · not built (Wave 5)
**Reference:** [03 §7](../03-layering.md#7-rich-vs-not), [05 §5](../05-persistence.md#5-repositories-vs-queries)

## Context

`Timer` is a decider: its methods check a transition and return a description of it
(`TimerStarted`, `TimerPaused`, …) without changing state. The change happens in
`DrizzleTimersRepository`, one conditional `UPDATE` per transition. Rules are split
three ways:

- domain decides `resetFocusCounter`; SQL applies it;
- "focus sessions increment the counter" is a `CASE WHEN` in `completeIfRunning`;
- the service rebuilds the `timer.lifecycle` payload from the returned row.

The conditional `WHERE status = …` clauses double as the concurrency guard (job vs
`PATCH` vs lazy completion on `GET`). Copying this shape to six more aggregates
multiplies per-transition SQL and leaves no single place that holds a rule.

## Options

- **A. Decider (current).** Pure decisions, repository applies them. Rules split
  across domain, SQL and service.
- **B. Generic CRUD base repository** (`create` / `update` / `delete` for every
  entity). Forces one shape on typed records; insert vs update is a persistence
  detail callers shouldn't pick.
- **C. Self-mutating aggregate; per-aggregate `save` with an optimistic version
  check that also flushes recorded events _(chosen)_.**

## Decision

1. **`AggregateRoot<E>`** in `kernel/domain/aggregate-root.ts` (pure): `version`,
   `protected record(event)`, `pullEvents()`, and `markSaved()` (bumps `version`;
   called only by repositories). Only the aggregates in 03 §7 extend it.
2. **Aggregates mutate themselves.** A method guards (throws its context's
   `DomainError`), changes fields, and records an event. Time comes in as `now: Date`;
   no `Clock` in the domain. `create(...)` builds a new one (may record a created
   event); `rehydrate(props)` loads one (records nothing).
3. **Domain events** are plain discriminated unions in
   `<ctx>/domain/<aggregate>.events.ts`, past tense, no platform import. They are
   not the wire contract.
4. **Repository port per aggregate:** whatever loaders the use cases need
   (`getById`, `ensure`, …) plus `save(aggregate)`; `delete` only where needed. No
   generic `Repository<T>`. Typed records keep their current repositories.
   Append-only side tables (e.g. a history log) aren't part of the aggregate and get
   their own repository.
5. **`save` (infrastructure), inside the caller's transaction:**
   1. writes the full state: `INSERT` when `version = 0` (never saved), else
      `UPDATE … SET …, version = version + 1 WHERE id = ? AND version = ?`;
   2. 0 rows updated → `core.concurrency_conflict` (`CONFLICT` → 409);
   3. `markSaved()`;
   4. `pullEvents()` → `<ctx>/infrastructure/persistence/<aggregate>-events.mapper.ts`
      → `EventsPublisher.publish(def, payload)` for each mapped event. A domain event
      may map to zero or several outbox events.
6. **Application** (`@Transactional()`): load → call aggregate methods → `save` →
   side effects that aren't events (`JobScheduler` schedule/cancel, which joins the
   tx per ADR 0007) → return the aggregate. Services don't call `EventsPublisher`
   for aggregate changes; typed-record contexts still publish directly.
7. **Conflicts:** HTTP returns 409; a job handler throws and pg-boss retries against
   fresh state. Where losing a race is harmless (lazy completion on `GET`), the
   caller catches `concurrency_conflict` and reloads.
8. Each aggregate table gets `version integer not null default 1` as its aggregate
   converts (a stored row is never version 0, so rows created outside `save`, like
   `TimersRepository.ensure`, load as saved). `Timer` converts first and is the reference implementation.

Rejected: pessimistic `SELECT … FOR UPDATE` (every loader must remember to lock,
read-only paths lock needlessly); publishing from the service (forgettable, and the
payload drifts from state); reusing outbox payloads as domain events (couples the
domain to the wire format and to `platform/`).

## Consequences

- **+** One place per rule; aggregates are unit-tested without a DB.
- **+** Events can't be forgotten and commit atomically with state.
- **+** One concurrency mechanism for every aggregate; no per-transition SQL.
- **−** Full-state writes; conflicts are detected, never merged.
- **−** Harmless races surface as conflicts; callers that don't care must catch.
- **−** One events mapper per aggregate; it is the only place domain and wire events
  can drift.
- **−** Repositories depend on `EventsPublisher` (infrastructure → platform, allowed).

## Verification

Per aggregate: `test/<ctx>/<aggregate>.unit.test.ts` (transitions, guards, recorded
events). `test/<ctx>/*.integration.test.ts`: stale `version` → `concurrency_conflict`;
`save` writes outbox rows in the same tx (rollback leaves none). Timer:
`test/focus/timers.integration.test.ts` (job vs `PATCH` vs lazy completion races).
