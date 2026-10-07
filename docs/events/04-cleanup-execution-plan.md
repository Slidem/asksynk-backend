# Execution plan — jobs & events cleanup

Three follow-ups to the unified jobs ([docs/jobs](../jobs/README.md),
[ADR 0007](../architecture/adr/0007-unified-typed-jobs.md)) and event delivery
([01-ordering-design.md](01-ordering-design.md),
[ADR 0006](../architecture/adr/0006-group-ordered-event-delivery.md)) work:

1. `@CronJob` — crons are declared inline in the decorator.
2. Outbox indexes + an events retention cron (outbox and dead letters).
3. Dead-letter admin API: list, replay and discard (single and bulk), guarded
   by an admin API key.

**Status:** built (phases 1–3). Deploy steps below still to run.

## Ground rules

- Phases run in order; phase 2 uses phase 1's `@CronJob`. One commit per phase.
  Every commit compiles and passes tests.
- Commit the current jobs WIP (migration `0007`) first, so phase 2 and 3 get
  `0008` and `0009`.
- **Checkpoints are run by the user.** Claude never runs build, test, dev or
  migrate commands. Claude may run `drizzle-kit generate`.
- Paths are relative to `apps/api/src/` unless they start with `apps/`, `docs/`
  or `test/` (`test/` = `apps/api/test/`). Use `@/api/...` aliases. No barrels.
- Don't fix lint or import ordering.

## Decisions

| #   | Decision                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Crons are declared in `@CronJob({ name, cron, options? })`. `defineCronJob` stops being public API.                                                                                              |
| D2  | Queued jobs keep `defineJob` + `@JobHandler(Def)`: the def is the producer's typed handle for `JobScheduler.schedule`, and `assertRegistered` checks it by identity.                             |
| D3  | Outbox retention: 30 days. Deletes realtime rows, dispatched rows **and** rows the dispatcher failed to build (`failed_at`). Undispatched durable rows are never deleted.                         |
| D4  | Dead-letter retention: 30 days after the last transition, for `replayed` / `discarded` rows only. `pending` rows are never deleted.                                                              |
| D5  | One cron, `events.retention`, daily at 03:00 UTC, runs both prunes.                                                                                                                              |
| D6  | Admin auth: `x-admin-api-key` header checked against `ADMIN_API_KEY`. Unset or shorter than 32 chars → every admin request is rejected (fails closed).                                           |
| D7  | Admin controllers are hidden from Swagger.                                                                                                                                                      |
| D8  | Replay and discard are status transitions (no verb routes): single `PATCH /:id`, bulk `PATCH /` by `ids` **or** by `filter`.                                                                    |
| D9  | Replay enqueues into the dead letter's own consumer-group queue with a **fresh** job id, in the same transaction as the status flip.                                                            |
| D10 | `record()` becomes an upsert: a replayed event that fails again goes back to `pending` instead of being silently dropped.                                                                       |

---

## Phase 1 — `@CronJob` decorator

### 1.1 `platform/jobs/define-job.ts`

- Rename `defineCronJob` → `buildCronJobDef`, with a doc comment: _internal,
  used by `@CronJob`; don't call from feature code_. Body unchanged (name check,
  default options, frozen def).
- `defineJob` unchanged.

### 1.2 New `platform/jobs/cron-job.decorator.ts`

```ts
/** Declares a pg-boss cron and binds the method as its handler. Takes no payload. */
export function CronJob(input: {
  name: string;
  cron: string;
  options?: Partial<JobOptions>;
}): <M extends JobHandlerFn<EmptyPayload>>(
  target: object,
  key: string | symbol,
  descriptor: TypedPropertyDescriptor<M>,
) => void;
```

- Calls `buildCronJobDef(input)` **at decoration time**, so a bad name throws
  on import, like `defineJob` today.
- Pushes `{ propertyKey, job: def }` into the same `JOB_HANDLER_METADATA` list
  `@JobHandler` uses. Same metadata → `JobHandlersRegistry` needs no change: it
  already branches on `def.kind`, schedules crons and reconciles them.
- Two `@CronJob`s with the same name produce two def objects → the registry's
  existing `Conflicting definitions for job "<name>"` error. Good enough.

### 1.3 `platform/jobs/job-handler.decorator.ts`

- Narrow the parameter from `JobDef<T>` to `QueuedJobDef<T>`, so a cron can no
  longer be bound through `@JobHandler`. Update the doc comment (drop "Cron
  handlers may take no args").

### 1.4 Migrate `calendar-integrations/sync/`

- `calendar-sync.jobs.ts`: delete `CalendarSyncPollJob` and the
  `defineCronJob` import.
- `calendar-sync.job-handlers.ts`:

  ```ts
  @CronJob({ name: "calendar.sync.poll", cron: "*/1 * * * *" })
  async poll(): Promise<void> { … }
  ```

  Move the "fans out one sync job per calendar" comment from the deleted def
  onto the method. The name is unchanged, so the existing pg-boss schedule and
  queue are reused; reconcile doesn't touch them.

### 1.5 Tests

| File                                       | Change                                                                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/jobs/define-job.unit.test.ts`        | `defineCronJob` cases → `buildCronJobDef`                                                                                                                                                      |
| `test/jobs/job-types.unit.test.ts`         | Drop the cron-def-through-`@JobHandler` case; add `@ts-expect-error` for `@JobHandler(cronDef)` and for a `@CronJob` method that requires a typed payload                                      |
| `test/jobs/job-handlers.registry.unit.test.ts` | Cron fixture becomes a class with a `@CronJob` method                                                                                                                                      |
| `test/jobs/job-scheduler.integration.test.ts`  | `IdleCron` becomes a `@CronJob` method on a test provider                                                                                                                                  |
| new `test/jobs/cron-job.decorator.unit.test.ts` | Metadata shape (`kind: "cron"`, `cron`, default options merged), invalid name throws at decoration                                                                                         |

### 1.6 Docs

- `docs/jobs/01-unified-jobs.md`: public API section — crons via `@CronJob`,
  calendar example updated.
- `docs/architecture/adr/0007-unified-typed-jobs.md`: amendment note — crons
  declared inline (D1), queued jobs unchanged (D2).
- `docs/architecture/04-layering.md`, `docs/architecture/08-roadmap.md` (0.6b,
  7.5): `defineCronJob` → `@CronJob`.

**Checkpoint 1 (user):** `pnpm --filter @asksynk/api build`, `test:unit`,
`test:integration`; boot the API and check `calendar.sync.poll` still fires.
Commit: `jobs: @CronJob decorator, crons declared inline`.

---

## Phase 2 — outbox indexes + events retention

### 2.1 Schema — `apps/migrations/src/schema/outbox.ts`

- Drop `idx_events_outbox_event_type`: no query filters on it alone, and it
  costs every insert.
- Add a partial index matching the dispatcher's drain exactly:

  ```ts
  index("idx_events_outbox_pending")
    .on(t.id)
    .where(
      sql`dispatched_at IS NULL AND failed_at IS NULL AND delivery_mode IN ('durable', 'dual')`,
    ),
  ```

  The `delivery_mode` predicate matters: realtime rows never get
  `dispatched_at`, so without it they'd sit in the index until retention. The
  drain's `WHERE` contains the same three clauses, so the planner can use it.
- No index for retention: ids are uuidv7 (time-ordered), so the age cut is a PK
  range — see 2.2.
- `drizzle-kit generate` → `0008_*.sql`. Check the generated SQL has the
  `WHERE` clause.

### 2.2 Dead-letter schema (prerequisite for D4)

Retention on dead letters needs `updated_at`, which phase 3 also needs. Add it
here so the migration lands once:

- `apps/migrations/src/schema/eventsDeadLetters.ts`:
  `updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()`.
- Same `0008` migration.

### 2.3 New `platform/events/outbox/events-outbox.repository.ts`

```ts
/** Deletes up to `batchSize` terminal rows older than `olderThan`. Returns the count. */
async deleteTerminal(olderThan: string /* PG interval, e.g. "30 days" */, batchSize: number): Promise<number>;
```

SQL shape (runs outside a transaction; `txHost.tx` falls back to the plain db):

```sql
DELETE FROM events_outbox
WHERE id IN (
  SELECT id FROM events_outbox
  WHERE id < uuidv7(-$olderThan::interval)
    AND (delivery_mode = 'realtime'
         OR dispatched_at IS NOT NULL
         OR failed_at IS NOT NULL)
  ORDER BY id
  LIMIT $batchSize
)
```

- `uuidv7(shift interval)` (Postgres 18, already required by the `uuidv7()`
  column defaults) builds the boundary id; `id <` it is an index range on the PK.
- The realtime listener reads rows by id within milliseconds of the NOTIFY;
  30 days is far outside that window. Dead letters keep their own payload copy
  and have no FK to the outbox (schema comment already says so).

### 2.4 `platform/events/dead-letters/events-dead-letters.repository.ts`

```ts
/** Deletes up to `batchSize` replayed/discarded rows last updated before `olderThan`. */
async deleteResolved(olderThan: string, batchSize: number): Promise<number>;
```

```sql
DELETE FROM events_dead_letters
WHERE id IN (
  SELECT id FROM events_dead_letters
  WHERE status IN ('replayed', 'discarded')
    AND updated_at < now() - $olderThan::interval
  LIMIT $batchSize
)
```

The table is small; the `(status, created_at)` index prefix is enough.

### 2.5 New `platform/events/retention/events-retention.job-handler.ts`

```ts
const RETENTION = "30 days";
const BATCH_SIZE = 1000;

@Injectable()
export class EventsRetentionJobHandler {
  @CronJob({ name: "events.retention", cron: "0 3 * * *" })
  async prune(): Promise<void> {
    // loop deleteTerminal until it returns < BATCH_SIZE, same for deleteResolved
    // log one info line with both totals
  }
}
```

- Batches keep each DELETE short; the first production run may delete a lot.
- Constants in code, not env (YAGNI).
- Wiring: a new `platform/events/retention/events-retention.module.ts`
  providing the handler + `EventsOutboxRepository` + `EventsDeadLettersRepository`,
  imported by `src/events/events.module.ts`. Job discovery is app-wide, so no
  `JobsModule` import is needed (the handler doesn't schedule anything).

### 2.6 Tests

- New `test/events/events-retention.integration.test.ts`. Seed rows with ids
  built via `uuidv7(-interval '31 days')` / `'1 day'` in SQL:
  - outbox: old realtime, old dispatched durable, old failed, old
    **undispatched durable**, recent dispatched → only the first three deleted.
  - dead letters: old replayed, old discarded, old pending, recent replayed →
    only the first two deleted.
  - batching: seed `BATCH_SIZE + 1` deletable rows (pass a small batch size to
    the repository) → all gone after `prune()`.
- Call `prune()` directly; don't wait for the cron.

### 2.7 Docs

- `docs/events/03-implementation-plan.md`: move "Outbox drain partial index" and
  "Outbox retention job" to Done.
- `docs/architecture/06-persistence.md` (line ~278): mark resolved.
- `docs/architecture/08-roadmap.md` 0.6b: done; note it covers all terminal rows,
  not only realtime.

**Checkpoint 2 (user):** migrate local (`pnpm dev:migrate`),
`test:integration`. Optionally `EXPLAIN` the drain query to confirm
`idx_events_outbox_pending`. Commit: `events: outbox partial index, events retention cron`.

---

## Phase 3 — dead-letter admin API

### 3.1 Schema — `eventsDeadLetters.ts`

- Add `replayCount: integer("replay_count").notNull().default(0)`.
- `drizzle-kit generate` → `0009_*.sql`.

### 3.2 `EventsDeadLettersRepository.record()` → upsert (D10)

```ts
.onConflictDoUpdate({
  target: [eventsDeadLetters.eventId, eventsDeadLetters.consumerGroup],
  set: {
    status: "pending",
    error: sql`excluded.error`,
    attempts: sql`excluded.attempts`,
    updatedAt: sql`now()`,
  },
})
```

- Keeps the crash-rerun idempotency (same values written twice).
- `replay_count` and `created_at` are preserved, so a poison event shows up as
  `pending` with `replay_count > 0`.
- Update the doc comment.

### 3.3 Repository additions

```ts
list(q: {
  status?: DeadLetterStatus;          // default "pending"
  consumerGroup?: string;
  eventType?: string;
  from?: Date; to?: Date;             // on created_at
  cursor?: string;                    // id; returns rows with id < cursor
  limit: number;
}): Promise<DeadLetterRow[]>;         // ORDER BY id DESC

/** Locks pending rows by id. Missing / non-pending ids are simply absent. */
lockPendingByIds(ids: string[]): Promise<DeadLetterRow[]>;              // FOR UPDATE, ORDER BY id

/** Locks up to `limit` pending rows matching the filter, oldest first. */
lockPendingMatching(f: DeadLetterFilter, limit: number): Promise<DeadLetterRow[]>; // FOR UPDATE SKIP LOCKED, ORDER BY id

markReplayed(ids: string[]): Promise<void>;   // status='replayed', replay_count+1, updated_at=now()
markDiscarded(ids: string[]): Promise<void>;  // status='discarded', updated_at=now()
```

- Ordering by id (uuidv7 ≈ insert order) means a bulk replay re-enqueues a key's
  dead letters in their original relative order.
- DLQ volume is small; `ORDER BY id DESC` with the `(status, created_at)` index
  is fine. Revisit only if the table grows.

### 3.4 `EventHandlersRegistry.getConsumerGroup(name)`

`platform/events/decorators/event-handlers.registry.ts`:
`getConsumerGroup(name: string): ConsumerGroup<EventDef> | undefined`, built on
`getAllConsumerGroups()`.

### 3.5 New `platform/events/dead-letters/events-dead-letters.service.ts`

```ts
type TransitionStatus = "replayed" | "discarded";
type TransitionResult = { updated: string[]; skipped: { id: string; reason: string }[] };

list(q): Promise<DeadLetterRow[]>;
transitionByIds(ids: string[], status: TransitionStatus): Promise<TransitionResult>;
transitionMatching(filter: DeadLetterFilter, status: TransitionStatus, limit: number): Promise<TransitionResult>;
```

Both transitions are `@Transactional()` and share one private
`apply(rows, status)`:

- **discarded:** `markDiscarded(rowIds)`.
- **replayed**, per row:
  1. `group = registry.getConsumerGroup(row.consumerGroup)`; missing → skip,
     reason `unknown consumer group` (renamed/removed in code).
  2. `singletonKey = group.orderingKeyFn(row.payload)`; throws → skip, reason
     `ordering key failed: <message>` (payload no longer matches).
  3. Build `QueuedJobInsert`: `name = group.name`, `id = generateId()` (fresh —
     the original job id is still held by the completed pg-boss row and would
     no-op), `data = { eventId, eventType, payload }` (same shape the dispatcher
     sends), `singletonKey`.
  4. `bus.insertJobs(jobs, fromDrizzleTx(txHost.tx))` — joins the transaction,
     so enqueue and status flip commit together.
  5. `markReplayed(replayedIds)`.
- `transitionByIds`: ids not returned by `lockPendingByIds` → skipped, reason
  `not found or not pending`.
- The replayed job starts with fresh attempts (`MAX_ATTEMPTS`) and joins the back
  of its key's FIFO — documented in 01 §"Replay".
- Payload schema isn't re-validated here; the runtime parses it and a failure
  dead-letters again (→ `pending` via 3.2).

### 3.6 New `platform/events/dead-letters/events-dead-letters.module.ts`

- Imports `EventHandlersModule`, `MessageBusModule`.
- Provides + exports `EventsDeadLettersRepository`, `EventsDeadLettersService`.
- `EventConsumerModule` imports it and drops its own `EventsDeadLettersRepository`
  provider. Phase 2's retention module imports it too instead of re-providing
  the repository.

### 3.7 Admin auth

- `apps/api/.env.example`, `.env.test`: `ADMIN_API_KEY=` with a comment
  (≥ 32 chars, e.g. `openssl rand -hex 32`; empty disables the admin API).
- New `auth/admin-api-key.guard.ts`:
  - reads `x-admin-api-key`;
  - expected = `config.get("ADMIN_API_KEY")`; missing or `< 32` chars → `401`;
  - compares `sha256(provided)` vs `sha256(expected)` with
    `crypto.timingSafeEqual` (equal-length buffers);
  - mismatch → `UnauthorizedException("Authentication failed")`, nothing else
    leaked.
- New `auth/admin-api.decorator.ts`:

  ```ts
  /** Admin-only controller: skips user auth, requires the admin API key, hidden from Swagger. */
  export const AdminApi = () =>
    applyDecorators(Public(), UseGuards(AdminApiKeyGuard), ApiExcludeController());
  ```

  Bundling `Public()` with the key guard means the user-auth bypass can't be
  applied without the key check.

### 3.8 Controller — `events/rest/event-dead-letters.admin.controller.ts`

`@AdminApi() @Controller("admin/events/dead-letters")`

| Route        | Body / query                            | Returns                     |
| ------------ | --------------------------------------- | --------------------------- |
| `GET /`      | `ListDeadLettersQueryDto`               | `DeadLetterResponse[]`      |
| `PATCH /:id` | `PatchDeadLetterRequestDto`             | `DeadLetterTransitionResponse` |
| `PATCH /`    | `PatchDeadLettersRequestDto` (bulk)     | `DeadLetterTransitionResponse` |

DTOs (`events/rest/dto/`, class-validator like `tasks/rest/dto`):

- `ListDeadLettersQueryDto`: `status?` (`pending|replayed|discarded`, default
  `pending`), `consumerGroup?`, `eventType?`, `from?` / `to?` (ISO date strings),
  `cursor?` (uuidv7), `limit?` (default 50, max 200).
- `PatchDeadLetterRequestDto`: `status: "replayed" | "discarded"`.
- `PatchDeadLettersRequestDto`:
  - `status: "replayed" | "discarded"`;
  - `ids?: string[]` — 1..500, uuidv7;
  - `filter?: DeadLetterFilterDto` — `consumerGroup?`, `eventType?`, `from?`,
    `to?`; **at least one field required** (no accidental "replay everything");
  - `limit?` — filter mode only, default and max 500;
  - exactly one of `ids` / `filter`, else `400`.
  - Filter mode only matches `pending` rows. Rows left beyond `limit` stay
    `pending`; calling again continues where it stopped.

Responses (`events/rest/responses/`):

- `DeadLetterResponse`: `id, consumerGroup, eventId, eventType, payload, error,
  attempts, status, replayCount, createdAt, updatedAt`.
- `DeadLetterTransitionResponse`: `{ updated: string[]; skipped: { id, reason }[] }`.
  Single `PATCH /:id` returns `404` when the id doesn't exist, `409` when it
  isn't `pending`, `422` for the per-row replay failures in 3.5; otherwise the
  same shape.

Mapper in `events/rest/mappers/dead-letter.mapper.ts`. Register the controller in
`src/events/events.module.ts` (imports `EventsDeadLettersModule`).

### 3.9 Tests

- New `test/auth/admin-api-key.guard.unit.test.ts`: key unset, `< 32` chars,
  header missing, wrong, correct.
- Extend `test/events/dead-letters.integration.test.ts` (or a new
  `dead-letters-replay.integration.test.ts`), using the existing poison
  handler:
  - replay by id → a job lands in the group queue with a new id, the handler
    runs, row is `replayed`, `replay_count = 1`;
  - replayed poison fails again → row back to `pending`, `replay_count = 1`,
    `error` / `updated_at` refreshed (upsert);
  - bulk by `ids` with one non-pending id → it's in `skipped`;
  - bulk by `filter` (`consumerGroup`) with `limit` smaller than matches →
    `limit` updated, rest still `pending`;
  - discard → `discarded`, no job enqueued;
  - replay of a row whose `consumer_group` isn't registered → skipped,
    `unknown consumer group`.
- New `test/events/dead-letters.admin.e2e`-style test (Supertest against the
  controller) for: `401` without/with wrong key, list filters + cursor, `400`
  when both / neither of `ids` and `filter` are sent.

### 3.10 Docs

- `docs/events/01-ordering-design.md` §Replay: "Deferred" → built; routes,
  fresh job id, same-tx enqueue, upsert back to `pending`, bulk ordering by id.
- `docs/events/03-implementation-plan.md`: dead-letter replay → Done.
- `docs/architecture/08-roadmap.md` 8.6: done; auth is the admin API key, not a
  role.
- Admin API usage (curl examples) in `docs/events/README.md` or a short new
  section in 01.

**Checkpoint 3 (user):** migrate local, `test:unit`, `test:integration`; set
`ADMIN_API_KEY` locally and curl `GET /admin/events/dead-letters`. Commit:
`events: dead-letter admin api (list, replay, discard)`.

---

## Deploy

1. Run migrations `0008`, `0009` (Railway predeploy). `0008` builds
   `idx_events_outbox_pending` without `CONCURRENTLY`; it only covers pending
   rows, so the build is quick, but it does lock writes to `events_outbox` while
   it runs.
2. Set `ADMIN_API_KEY` on the API service.
3. After deploy: `events.retention` appears in `pgboss.schedule`;
   `calendar.sync.poll` is unchanged.
4. The first retention run (03:00 UTC) may delete a large backlog; it's batched,
   watch the log line for totals.

## Out of scope

- Consumer idempotency / inbox (still the runtime `TODO`).
- Replaying `discarded` rows (discard is terminal).
- Re-validating payloads against the current event schema at replay time.
