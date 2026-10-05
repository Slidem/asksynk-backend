# Unified jobs

One typed jobs API for scheduled, async and cron jobs. It replaces
`ScheduledJobService`, the unused `platform/jobs/cron` stub, and callers using
`MessageBusService` directly for jobs.

**Status:** design agreed, not built. Decision record:
[ADR 0007](../architecture/adr/0007-unified-typed-jobs.md). Execution plan:
[02-execution-plan.md](02-execution-plan.md).

## Why

The current `ScheduledJobService` leaks pg-boss details into callers:

- `schedule()` returns a pg-boss UUID. Timers store it in
  `user_timers.pending_completion_job_ref` just so they can cancel later, which
  means a domain table holds queue internals.
- Callers pass a queue string plus an untyped payload, and a separate
  `process()` call binds the worker (`TimersWorker`). The two are only linked
  by the string.
- `jobId → singletonKey` doesn't dedup. The queue uses the `standard` policy,
  where `singletonKey` only has an effect together with `singletonSeconds`
  (index `job_i4`). The "singleton key is free" comment in
  `TimersService.startSession` is wrong. Correctness today comes from the
  cancel in the same tx plus the `transitionedAt` check in the handler.
- `CalendarSyncScheduler` calls `MessageBusService` directly, with pg-boss
  options (`singletonKey`, `singletonSeconds`, retries) inline.

## Decisions

| #   | Decision                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | One jobs module. Scheduled and async jobs differ only by `runAt`. A cron job is a def with a `cron` expression and no producer.               |
| 2   | `id` is required, supplied by the caller, and deterministic per occurrence. Cancel recomputes it from domain state, so no pg-boss ref is ever stored. |
| 3   | Drop `user_timers.pending_completion_job_ref`.                                                                                                |
| 4   | Payload type is TS-only (phantom type on the def). No runtime validation.                                                                     |
| 5   | Job defs live in the owning module, not in a central registry.                                                                                |
| 6   | Final failure: log an error and leave the job in pg-boss `failed` state until the retention sweep removes it. No DLQ. Logs are the record.    |
| 7   | Handler signature is `(payload, { jobId, attempt })`.                                                                                         |
| 8   | Single process: producers and workers run in the API. No separate worker process is planned.                                                 |
| 9   | Crons are reconciled at bootstrap: a schedule in pg-boss with no cron def in code is unscheduled.                                             |
| 10  | Short retention: finished jobs (completed, failed, cancelled) are deleted after `deleteAfterSeconds`, default 1h. pg-boss sweeps every 5 min. |

Dropped during review: a "`runAt` beyond retention" check. pg-boss computes
`keep_until = start_after + retentionSeconds`, so retention counts from
`runAt`, and a job far in the future is not pruned before it runs.

## pg-boss facts the design relies on

Verified against pg-boss 12.34 `plans.js` / `manager.js`:

- Job PK is `(name, id)`, `id uuid`. Insert is `ON CONFLICT DO NOTHING`, so
  sending an existing id is a silent no-op (`send` returns `null`).
- `cancel` sets `state = cancelled` for `state < completed`, which **includes
  `active`**. The row stays around for `deleteAfterSeconds`, so the id is
  blocked for that long.
- `deleteJob(name, ids)` deletes the rows in any state, which frees the id.
- `keep_until = start_after + retentionSeconds` (default 14d).
- The deletion sweep (`plans.deletion`) removes rows where
  `completed_on + deletion_seconds < now`. `completed_on` is set on complete,
  fail and cancel, so `deleteAfterSeconds` covers every finished state, not
  just `completed`. Default 7d.
- The sweep runs once per queue every `maintenanceIntervalSeconds` (constructor
  option, default 24h). A short `deleteAfterSeconds` does nothing without a
  shorter interval: rows would still live up to a day.
- Queue options (`retryLimit`, `retryDelay`, `retryBackoff`, `expireInSeconds`)
  are set via `createQueue`/`updateQueue`. Worker options
  (`pollingIntervalSeconds`, default 2s, and `localConcurrency`) are set per
  `work()`.

## Public API

### Types — `platform/jobs/job.types.ts`

```ts
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json | undefined };

/** JSON-safe payload. `Date` is rejected at compile time: use ISO strings. */
export type JobPayload = { [key: string]: Json | undefined };
export type EmptyPayload = Record<string, never>;

export interface JobOptions {
  retryLimit: number;
  retryDelaySeconds: number;
  retryBackoff: boolean;
  expireInSeconds: number;
  /** How long a finished job row (and so its id) is kept. */
  deleteAfterSeconds: number;
  pollingIntervalSeconds: number;
  concurrency: number;
}

interface BaseJobDef<T extends JobPayload> {
  readonly name: string;
  readonly options: JobOptions;
  /** Phantom: carries the payload type, never set at runtime. */
  readonly _payload?: T;
}

export interface QueuedJobDef<T extends JobPayload> extends BaseJobDef<T> {
  readonly kind: "queued";
}

export interface CronJobDef extends BaseJobDef<EmptyPayload> {
  readonly kind: "cron";
  readonly cron: string;
}

export type JobDef<T extends JobPayload = JobPayload> =
  | QueuedJobDef<T>
  | CronJobDef;

export interface JobContext {
  /** Caller-supplied id for queued jobs; pg-boss job id for cron runs. */
  jobId: string;
  /** 1-based. */
  attempt: number;
}

export type JobHandlerFn<T extends JobPayload> = (
  payload: T,
  ctx: JobContext,
) => Promise<void>;
```

Notes:

- The phantom `_payload` field is required. Without it, `QueuedJobDef<A>` and
  `QueuedJobDef<B>` are structurally identical and the type safety disappears.
- Payloads have to be `type` aliases, not `interface`s. Interfaces don't
  satisfy an index signature.

### Definitions — `platform/jobs/define-job.ts`

```ts
export function defineJob<T extends JobPayload>(input: {
  name: string;
  options?: Partial<JobOptions>;
}): QueuedJobDef<T>;

export function defineCronJob(input: {
  name: string;
  cron: string;
  options?: Partial<JobOptions>;
}): CronJobDef;
```

- Merges `DEFAULT_JOB_OPTIONS` and freezes the result, the same way `defineEvent` does.
- Validates the name with the event regex, dotted lowercase
  (`^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`). Consumer-group queues are kebab
  with no dots (`timer-event-log`, `calendar-sync`), so job and group queue
  names can't collide in the shared pg-boss namespace. Existing names
  (`timer.completion`, `calendar.sync`, `calendar.sync.poll`) already pass.
- The cron expression is validated at bootstrap by the existing
  `MessageBusService.assertValidCron`.

### Producer port — `platform/jobs/job-scheduler.ts`

```ts
export abstract class JobScheduler {
  /**
   * Schedule `job` to run at `runAt` (default: now). Idempotent per
   * (job, id): a repeat is a no-op. Joins the caller's tx if active.
   */
  abstract schedule<T extends JobPayload>(
    job: QueuedJobDef<T>,
    payload: NoInfer<T>,
    opts: { id: string; runAt?: Date },
  ): Promise<void>;

  /** Best-effort; missing/finished ids are a no-op. Joins the caller's tx. */
  abstract cancel<T extends JobPayload>(
    job: QueuedJobDef<T>,
    id: string,
  ): Promise<void>;
}
```

- `NoInfer` makes the def the only source of `T`, so a wrong payload is a compile
  error rather than widening `T`.
- The id is scoped to the def. Two defs can use the same id.
- **An id identifies one occurrence and must never be reused.** After a job
  completes, its row keeps the id for `deleteAfterSeconds`, and scheduling the
  same id again during that time does nothing, silently. Derive ids from domain
  state that changes on every occurrence, e.g. `transitionedAt`.

### Consumer — `platform/jobs/job-handler.decorator.ts`

```ts
export function JobHandler<T extends JobPayload>(
  job: JobDef<T>,
): <M extends JobHandlerFn<T>>(
  target: object,
  key: string | symbol,
  descriptor: TypedPropertyDescriptor<M>,
) => void;
```

The `M extends JobHandlerFn<T>` constraint makes a handler whose payload type
doesn't match fail to compile. `M` is generic because
`TypedPropertyDescriptor<T>` is invariant: a fixed `JobHandlerFn<T>` would
reject handlers that take fewer args than `(payload, ctx)`. Cron handlers may
take no args.

## Internals

### `PgBossJobScheduler` (implements `JobScheduler`)

- `schedule`: `@Transactional()`, then `registry.assertRegistered(job)`, then
  `messageBus.enqueue(job.name, { id, payload }, { id: toJobUuid(id), startAfter: runAt, db: fromDrizzleTx(tx) })`.
- `cancel`: `@Transactional()`, then
  `messageBus.deleteJob(job.name, toJobUuid(id), { db: fromDrizzleTx(tx) })`.
  Delete rather than cancel, which frees the id and leaves no stale rows.
- `toJobUuid(id) = uuidv5(id, JOBS_UUID_NAMESPACE)`. pg-boss needs a UUID;
  callers pass a readable string. Deterministic, so `schedule` and `cancel`
  map the same caller id to the same row. Implemented with `node:crypto`
  SHA-1 in about 10 lines (RFC 9562 §5.5). The `uuid` package isn't a direct
  dep, and from v12 it's ESM-only, which clashes with the CommonJS build and
  ts-jest. A unit test pins it to a known vector:
  `uuid5(NAMESPACE_DNS, "python.org") = 886313e1-3b8a-5372-9b90-0c9aee199e5d`.
- The stored data is the envelope `{ id, payload }`, which lets the runtime hand
  the caller id back through `ctx.jobId`.

### `JobHandlersRegistry` (`OnApplicationBootstrap`)

Uses the same discovery approach as `EventHandlersRegistry`
(`DiscoveryService` + `MetadataScanner`).

1. Discover `@JobHandler` methods and bind them to their instances.
2. Validate: exactly one handler per job name, and all handlers for a name use
   the same def instance. Otherwise startup fails.
3. For each handler:
   - `ensureQueue(name, toQueueOptions(def.options))`, which also updates
     options on existing queues.
   - Cron defs: `scheduleCron(name, cron)`, which is idempotent.
   - `work(name, run, { pollingIntervalSeconds, localConcurrency: concurrency })`,
     giving one worker per registered job.
4. Reconcile crons (`reconcileCrons()`, a public method so the integration
   test can call it): `getSchedules()`, then `unscheduleCron(name)` for every
   schedule whose name isn't a registered cron def. Otherwise a cron removed
   or renamed in code keeps enqueuing workerless jobs every tick. Safe because
   cron defs are the only writer of `pgboss.schedule`, and because of decision
   8: the one process registers every cron def. A second process with a
   partial module set would unschedule the other's crons.
5. `assertRegistered(def)`: throws `No handler registered for job "<name>"`.
   This is a clearer fail-fast than letting pg-boss say the queue is missing,
   and it's valid because producers and workers share one process.

`run(data, job)`:

```ts
const attempt = job.retryCount + 1;
const jobId = def.kind === "cron" ? job.id : data.id;
const payload = def.kind === "cron" ? {} : data.payload;
try {
  await handler(payload, { jobId, attempt });
} catch (error) {
  const final = job.retryCount >= def.options.retryLimit;
  // final → logger.error("job failed permanently"), else logger.warn("job failed, retrying")
  throw error; // pg-boss retries, or marks `failed` on the final attempt
}
```

Handlers aren't wrapped in a tx automatically. They add `@Transactional()`
themselves, as event handlers do.

### `MessageBusService` changes

- `enqueue`: drop the implicit `ensureQueue`, since queues are created at
  bootstrap.
- Replace `cancel` with `deleteJob(queue, id, { db })`.
- Add `getSchedules()`, a thin wrapper used by the cron reconcile.
- Construct `PgBoss` with `maintenanceIntervalSeconds: 300`, so the deletion
  sweep honours a 1h `deleteAfterSeconds` (see pg-boss facts). This is
  instance-wide. Event group queues keep their 7d `deleteAfterSeconds`; they
  are just swept more often.
- Move `pgboss-drizzle-db.ts` into `message-bus/`. The events dispatcher uses it
  too.

### Layout

```
platform/jobs/
  message-bus/            pg-boss wrapper (unchanged role)
  job.types.ts
  define-job.ts
  job-options.constants.ts   DEFAULT_JOB_OPTIONS, JOBS_UUID_NAMESPACE (a fixed random UUID; never change it)
  job-uuid.ts                toJobUuid (uuidv5 via node:crypto)
  job-scheduler.ts           abstract port
  pgboss-job-scheduler.ts
  job-handler.constants.ts   JOB_HANDLER_METADATA
  job-handler.decorator.ts
  job-handlers.registry.ts
  jobs.module.ts             DiscoveryModule, MessageBusModule; provides JobScheduler → PgBossJobScheduler, JobHandlersRegistry
```

Delete `platform/jobs/scheduled-job/` and `platform/jobs/cron/`.

`DEFAULT_JOB_OPTIONS` uses pg-boss's defaults, spelled out so the runtime's
`final` check matches what's on the queue: `retryLimit: 2`,
`retryDelaySeconds: 0`, `retryBackoff: false`, `expireInSeconds: 900`,
`pollingIntervalSeconds: 2`, `concurrency: 1`. The one exception is
`deleteAfterSeconds: 3600` (pg-boss: 7d). Every option is spelled out because
`updateQueue` keeps the old value for any option left unset.

`toQueueOptions(options)` maps `JobOptions` to pg-boss queue options:
`retryLimit`, `retryDelay`, `retryBackoff`, `expireInSeconds`,
`deleteAfterSeconds`. `pollingIntervalSeconds` and `concurrency` go to
`work()` instead.

**Retention vs dedup:** a finished row is what makes a repeat `schedule` a
no-op. Once it's swept, the same id schedules again. Domain-derived ids that
are never reused (timers) don't care. A time-bucketed id (calendar sync) needs
`deleteAfterSeconds` ≥ its bucket length.

## Migration: timers (phase 1)

`timers/scheduling/timer-completion.job.ts`:

```ts
export type TimerCompletionPayload = { userId: string; transitionedAt: string };

export const TimerCompletionJob = defineJob<TimerCompletionPayload>({
  name: "timer.completion",
});

export const timerCompletionJobId = (userId: string, transitionedAt: Date) =>
  `${userId}:${transitionedAt.toISOString()}`;
```

- `TimerCompletionJobHandler` (new, replaces `TimersWorker`):
  `@JobHandler(TimerCompletionJob)` delegates to
  `TimersService.handleScheduledCompletion(payload)`. The staleness guard stays.
- `TimersService`:
  - inject `JobScheduler`;
  - the `jobIdToCancel` ref is replaced by an id derived from the
    pre-transition timer, but only when `current.status === "running"`. A paused
    timer has no pending job, since pause already cancelled it.
  - `scheduleCompletion` becomes
    `schedule(TimerCompletionJob, payload, { id: timerCompletionJobId(userId, transitionedAt), runAt })`;
  - delete `attachJobRef`.
- Remove `pendingCompletionJobRef` from the entity, repository (incl.
  `setPendingJobRef`), and `apps/migrations/src/schema/userTimers.ts`, then run
  drizzle-kit generate to drop the column.
- Delete `timers/scheduling/timer-jobs.constants.ts`, `timers.worker.ts`, and
  `TimerCompletionJob` from `timer.model.ts`.
- `TimersModule` imports `JobsModule` instead of `ScheduledJobModule`.

Why ids never collide here: every transition sets a new `transitionedAt`, so
each running span gets its own id. A direct switch (start while running)
cancels the old id and schedules a new one in the same tx.

## Migration: calendar sync (phase 2)

`calendar-integrations/sync/calendar-sync.jobs.ts`:

```ts
export const CalendarSyncPollJob = defineCronJob({
  name: "calendar.sync.poll",
  cron: "*/1 * * * *",
});

export type CalendarSyncPayload = { calendarId: string };

export const CalendarSyncJob = defineJob<CalendarSyncPayload>({
  name: "calendar.sync",
  options: { retryLimit: 3, retryDelaySeconds: 30, retryBackoff: true, concurrency: 4 },
});
```

- The fan-out uses `id: `${calendarId}:${slot}``, where
  `slot = floor(now / 240s)`. That reproduces the old `singletonKey` +
  `singletonSeconds: 240` dedup window using only the id, so no singleton
  options need to be exposed. It holds while `deleteAfterSeconds` (1h) ≥ 240s.
- Volume at 1h retention is about 15 finished rows per calendar, versus about
  2.5k at pg-boss's 7d default.
- `CalendarSyncJobHandlers` has two `@JobHandler` methods: poll → fan-out, and
  sync → `syncService.syncCalendar`. It replaces `CalendarSyncScheduler`.
- Trim `calendar-sync.constants.ts`: the queues, cron, singleton seconds and the
  `CalendarSyncJob` interface all move to the defs.

## Deploy

Queued jobs from before the deploy have raw payloads with no `{ id, payload }`
envelope, so they would fail. Delete them first:

```sql
delete from pgboss.job
where name in ('timer.completion', 'calendar.sync') and state < 'active';
```

- Running timers are still completed lazily on the next `GET /timers`
  (`getCurrent`). The `completed` lifecycle event is delayed until that
  request.
- Calendar sync repopulates on the next poll tick.
- `calendar.sync.poll` keeps its name, so the cron schedule re-registers in place.

## Handler contract

- At-least-once delivery. Handlers must be idempotent.
- A handler can run after `cancel`: it may have been fetched before the cancel
  committed, and deleting an `active` row doesn't stop a handler that's already
  running. Handlers re-check domain state before acting, as the timer handler
  does with `transitionedAt`.
- It can fire up to `pollingIntervalSeconds` late.
- Don't schedule from an `onApplicationBootstrap` hook. The registry may not be
  populated yet, so `assertRegistered` throws.
- The payload shape is a contract across deploys: a queued job can outlive the
  code that produced it. Change it backward-compatibly, or clear pending jobs
  with deploy SQL.
- A final attempt that exceeds `expireInSeconds` is marked `failed` by pg-boss
  without reaching the runtime's catch, so it isn't logged.

## Out of scope (YAGNI)

- Runtime payload validation.
- DLQ.
- Dedup keys / singleton options.
- Automatic handler tx: some handlers (calendar sync) deliberately do network
  IO outside a tx.
- Per-calendar sync exclusivity: two syncs of one calendar can overlap when
  retries cross a slot boundary. Same as today; pg-boss `stately` +
  `singletonKey` would fix it.

## Implementation steps

Detailed, file-by-file: [02-execution-plan.md](02-execution-plan.md).

1. `platform/jobs` core plus the `MessageBusService` changes.
2. Tests: type spec, unit, scheduler integration.
3. Timers migration, including the column drop.
4. Calendar sync migration.
5. Delete `scheduled-job/` and `cron/`, then flip the doc statuses.
6. Deploy SQL.
