# Execution plan — unified jobs

Implements [01-unified-jobs.md](01-unified-jobs.md)
([ADR 0007](../architecture/adr/0007-unified-typed-jobs.md)).

**Status:** built (deploy SQL in phase 6 still to run).

## Ground rules

- Five commits, one per phase. Every commit compiles and passes tests, because
  the old and new APIs coexist until phase 5.
- **Checkpoints are run by the user.** Claude never runs build, test, dev or
  migrate commands. Claude may run `drizzle-kit generate`.
- Paths are relative to `apps/api/src/` unless they start with `apps/` or `test/`
  (`test/` = `apps/api/test/`). Use `@/api/...` aliases. No barrels.
- Don't fix lint or import ordering.

## Phase 1 — `platform/jobs` core (additive)

Nothing uses it yet. The old `scheduled-job/`, `cron/` and
`CalendarSyncScheduler` keep working.

### 1.1 Move `pgboss-drizzle-db.ts`

- `platform/jobs/scheduled-job/pgboss-drizzle-db.ts` →
  `platform/jobs/message-bus/pgboss-drizzle-db.ts` (git mv, content unchanged).
- Update imports in `platform/events/dispatcher/events-dispatcher.ts` and
  `platform/jobs/scheduled-job/pgboss-scheduled-job.service.ts`.

### 1.2 `MessageBusService` (additive part)

`platform/jobs/message-bus/message-bus.service.ts`:

- `new PgBoss({ connectionString, schema: "pgboss", maintenanceIntervalSeconds: 300 })`,
  with a comment that the deletion sweep must run often for the 1h
  `deleteAfterSeconds` on job queues to mean anything.
- Add:

  ```ts
  /** Deletes jobs in any state, freeing their ids. Missing ids are a no-op. */
  async deleteJob(queue: string, jobId: string, opts: DeleteJobOptions = {}): Promise<void> {
    await this.requireBoss().deleteJob(queue, jobId, opts);
  }

  async getSchedules(): Promise<Schedule[]> {
    return this.requireBoss().getSchedules();
  }
  ```

- `message-bus.types.ts`: add `export type DeleteJobOptions = { db?: Db };`.
- Leave `cancel` and the implicit `ensureQueue` in `enqueue` alone; phase 5
  removes them.

### 1.3 Types — `platform/jobs/job.types.ts`

As in 01 §Types (`Json`, `JobPayload`, `EmptyPayload`, `JobOptions` incl.
`deleteAfterSeconds`, `QueuedJobDef`, `CronJobDef`, `JobDef`, `JobContext`,
`JobHandlerFn`), plus the internals the scheduler and registry share:

```ts
/** Stored pg-boss data for queued jobs. */
export type JobEnvelope<T extends JobPayload = JobPayload> = {
  id: string;
  payload: T;
};
```

### 1.4 Constants — `platform/jobs/job-options.constants.ts`

```ts
export const DEFAULT_JOB_OPTIONS: JobOptions = {
  retryLimit: 2,
  retryDelaySeconds: 0,
  retryBackoff: false,
  expireInSeconds: 900,
  deleteAfterSeconds: 3600,
  pollingIntervalSeconds: 2,
  concurrency: 1,
};

/** uuidv5 namespace for job ids. Never change it: it would orphan every pending job. */
export const JOBS_UUID_NAMESPACE = "c645c81b-20b2-40cd-a613-048fed0ecef1";

export const JOB_NAME_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
```

### 1.5 `platform/jobs/job-uuid.ts`

```ts
import { createHash } from "node:crypto";

/** RFC 9562 uuidv5 of the caller id. Same id → same pg-boss row. */
export function toJobUuid(id: string): string {
  const ns = Buffer.from(JOBS_UUID_NAMESPACE.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(ns).update(id, "utf8").digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
```

For the test vector, export an internal `uuidv5(name, namespace)` and have
`toJobUuid` call it with `JOBS_UUID_NAMESPACE`.

### 1.6 `platform/jobs/define-job.ts`

- `defineJob<T>({ name, options })` → `Object.freeze({ kind: "queued", name, options: { ...DEFAULT_JOB_OPTIONS, ...options } })`.
- `defineCronJob({ name, cron, options })` → same, with `kind: "cron"` and `cron`.
- Both throw `Invalid job name "<name>". Must be dotted lowercase, e.g. "timer.completion".`
  when the name fails `JOB_NAME_PATTERN`.
- Cron syntax is **not** checked here. `scheduleCron` → `assertValidCron` checks it at bootstrap.

### 1.7 Decorator

- `platform/jobs/job-handler.constants.ts`: `export const JOB_HANDLER_METADATA = Symbol("job-handler-metadata");`
- `platform/jobs/job-handler.decorator.ts`: the signature from 01 §Consumer.
  The body mirrors `EventHandler`: it appends `{ propertyKey, job }` to the
  list in `Reflect.getOwnMetadata(JOB_HANDLER_METADATA, target.constructor)`.
- Put `JobHandlerMeta = { propertyKey: string; job: JobDef }` in `job.types.ts`.

### 1.8 `platform/jobs/job-handlers.registry.ts`

`@Injectable() JobHandlersRegistry implements OnApplicationBootstrap`.
Constructor: `DiscoveryService`, `MetadataScanner`, `MessageBusService`.

```ts
private readonly handlers = new Map<string, { def: JobDef; fn: JobHandlerFn<JobPayload> }>();

async onApplicationBootstrap() {
  this.discover();               // fills `handlers`; throws on duplicates / def mismatch
  for (const { def, fn } of this.handlers.values()) {
    await this.bus.ensureQueue(def.name, toQueueOptions(def.options));
    if (def.kind === "cron") await this.bus.scheduleCron(def.name, def.cron);
    await this.bus.work(def.name, (data, job) => this.run(def, fn, data, job), {
      pollingIntervalSeconds: def.options.pollingIntervalSeconds,
      localConcurrency: def.options.concurrency,
    });
  }
  await this.reconcileCrons();
}

/** Public for the integration test. */
async reconcileCrons() {
  const crons = new Set([...this.handlers.values()].filter(h => h.def.kind === "cron").map(h => h.def.name));
  for (const s of await this.bus.getSchedules()) {
    if (!crons.has(s.name)) {
      await this.bus.unscheduleCron(s.name);
      this.logger.warn("unscheduled cron with no def in code", { name: s.name });
    }
  }
}

assertRegistered(def: JobDef) { /* throws `No handler registered for job "<name>"` */ }
```

- `discover()` copies `EventHandlersRegistry.discoverHandlers`: method exists,
  is a function, bind to the instance. Errors:
  - same name twice → `Multiple handlers for job "<name>"`;
  - same name, different def instance → `Conflicting definitions for job "<name>"`.
    (A second handler is an error either way, so this only makes the message
    clearer.)
- `toQueueOptions(o)` (module-private) →
  `{ retryLimit, retryDelay: o.retryDelaySeconds, retryBackoff, expireInSeconds, deleteAfterSeconds }`.
- `run()` follows 01 §run. It logs with `{ job: def.name, jobId, attempt }`,
  plus `error` on failure. `warn` while retries remain, `error` on the final
  attempt, then rethrow.
- `assertRegistered` checks the name **and** the instance
  (`handlers.get(name)?.def === def`).

### 1.9 Port and adapter

- `platform/jobs/job-scheduler.ts`: the abstract class from 01 §Producer port.
- `platform/jobs/pgboss-job-scheduler.ts`: `PgBossJobScheduler extends JobScheduler`.
  Constructor: `MessageBusService`, `JobHandlersRegistry`, `TransactionHost<TxAdapter>`.

  ```ts
  @Transactional()
  async schedule(job, payload, { id, runAt }) {
    this.registry.assertRegistered(job);
    const data: JobEnvelope = { id, payload };
    await this.bus.enqueue(job.name, data, {
      id: toJobUuid(id),
      startAfter: runAt,
      db: fromDrizzleTx(this.txHost.tx),
    });
  }

  @Transactional()
  async cancel(job, id) {
    await this.bus.deleteJob(job.name, toJobUuid(id), { db: fromDrizzleTx(this.txHost.tx) });
  }
  ```

  `SendOptions` gets `id?: string`. pg-boss `send` already accepts it.
  `cancel` has no try/catch: `deleteJob` on a missing id doesn't throw. If the
  integration test shows it does, add a catch.

### 1.10 `platform/jobs/jobs.module.ts`

```ts
@Module({
  imports: [DiscoveryModule, MessageBusModule],
  providers: [
    JobHandlersRegistry,
    { provide: JobScheduler, useClass: PgBossJobScheduler },
  ],
  exports: [JobScheduler],
})
export class JobsModule {}
```

Discovery is app-wide, so a handler is found even if its module doesn't
import `JobsModule`. Only producers need the import.

**Checkpoint 1 (user):** `pnpm --filter @asksynk/api build`, then
`pnpm --filter @asksynk/api test:all`. Expect no change in behaviour. Commit:
`jobs: typed jobs core (defineJob, @JobHandler, JobScheduler)`.

## Phase 2 — tests for the core

### 2.1 `test/jobs/job-types.unit.test.ts` (compile-time spec)

ts-jest type-checks, so an unused `@ts-expect-error` fails the file. Put the
cases in a function that never runs, plus one trivial `it`:

```ts
type P = { a: string };
const Def = defineJob<P>({ name: "test.types" });
declare const s: JobScheduler;

function spec() {
  s.schedule(Def, { a: "x" }, { id: "1" });
  // @ts-expect-error wrong payload field
  s.schedule(Def, { b: "x" }, { id: "1" });
  // @ts-expect-error missing id
  s.schedule(Def, { a: "x" }, {});
  // @ts-expect-error Date is not JSON
  defineJob<{ at: Date }>({ name: "test.date" });
  // @ts-expect-error cron defs can't be scheduled
  s.schedule(
    defineCronJob({ name: "test.cron", cron: "* * * * *" }),
    {},
    { id: "1" },
  );

  class H {
    @JobHandler(Def) ok(p: P) {
      return Promise.resolve();
    }
    // @ts-expect-error handler payload mismatch
    @JobHandler(Def) bad(p: { z: number }) {
      return Promise.resolve();
    }
  }
}
```

Watch out: `defineJob` runs at import time, so the names must be valid.
Decorator `@ts-expect-error` placement may need adjusting to whichever line
tsc reports the error on.

### 2.2 `test/jobs/define-job.unit.test.ts`

- Valid names pass: `timer.completion`, `calendar.sync.poll`.
- Invalid names throw: `timer`, `Timer.x`, `timer-completion`, `timer.`.
- Options merge over defaults. A partial override keeps the other defaults.
- The result is frozen.
- `uuidv5("python.org", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")` equals
  `886313e1-3b8a-5372-9b90-0c9aee199e5d`.
- `toJobUuid` is deterministic, and different ids give different uuids.

### 2.3 `test/jobs/job-handlers.registry.unit.test.ts`

`Test.createTestingModule({ imports: [DiscoveryModule], providers: [JobHandlersRegistry, <handler classes>, { provide: MessageBusService, useValue: fakeBus }] })`.
`fakeBus` records calls, and its `getSchedules` returns a configurable list.

- Two classes handling the same def → `init()` rejects with `Multiple handlers`.
- Two defs with the same name → rejects.
- Queued def: `ensureQueue` gets mapped options (`retryDelay`,
  `deleteAfterSeconds`), `work` gets `pollingIntervalSeconds` /
  `localConcurrency`, and `scheduleCron` isn't called.
- Cron def: `scheduleCron(name, cron)` is called.
- Reconcile: schedules `[registered cron, "stale.cron"]` → only `stale.cron`
  is unscheduled.
- `assertRegistered` throws for an unknown def, and for a different instance
  with the same name.
- `run` (through the handler `work` received): passes `payload` / `jobId` /
  `attempt` from the envelope; a cron passes `{}` and the pg-boss id; it
  rethrows on failure.

### 2.4 `test/jobs/job-scheduler.integration.test.ts`

Module: `ConfigModule` (`.env.test`), `DbModule`, `TxModule`, `JobsModule`,
plus a test provider:

```ts
const RecordJob = defineJob<{ n: number }>({
  name: "test.jobs.record",
  options: { pollingIntervalSeconds: 0.5 },
});
const FlakyJob = defineJob<{ n: number }>({
  name: "test.jobs.flaky",
  options: { pollingIntervalSeconds: 0.5 },
});
const IdleCron = defineCronJob({
  name: "test.jobs.idle_cron",
  cron: "0 0 1 1 *",
}); // never fires during the test
const Unhandled = defineJob<{ n: number }>({ name: "test.jobs.unhandled" });
```

Helper: `jobRow(name, id)` runs
`select state from pgboss.job where name = $1 and id = $2::uuid` with
`toJobUuid(id)`.

| Case                       | Assert                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| schedule now               | handler gets `{ n: 1 }`, `ctx.jobId === "rec-1"`, `attempt === 1` (`pollUntil`)                                                                             |
| repeat id                  | schedule `rec-2` twice with `runAt` +1h → one row, state `created`                                                                                          |
| cancel frees id            | schedule `rec-3` (+1h), cancel → no row; schedule again → row `created`                                                                                     |
| rollback discards schedule | `txHost.withTransaction(async () => { await schedule(rec-4); throw })` → no row                                                                             |
| cancel joins tx            | schedule `rec-5` (+1h); `withTransaction(async () => { await cancel(rec-5); throw })` → row still there                                                     |
| unregistered def           | `schedule(Unhandled, …)` rejects with `No handler registered`                                                                                               |
| retry                      | `FlakyJob` throws on attempt 1 → attempts seen `[1, 2]`                                                                                                     |
| cron reconcile             | `bus.scheduleCron("test.jobs.stale", "0 0 1 1 *")`, then `registry.reconcileCrons()` → `getSchedules()` has `test.jobs.idle_cron` but not `test.jobs.stale` |

`globalSetup` drops the `pgboss` schema each run, so no cleanup is needed
between runs. Use fresh ids per case.

**Checkpoint 2 (user):** `test:unit` and `test:integration`. Commit:
`jobs: type spec, unit and scheduler integration tests`.

## Phase 3 — timers

### 3.1 `timers/scheduling/timer-completion.job.ts`

The def, `TimerCompletionPayload` (a `type` alias) and `timerCompletionJobId`,
as in 01 §Migration: timers.

### 3.2 `timers/scheduling/timer-completion.job-handler.ts`

```ts
@Injectable()
export class TimerCompletionJobHandler {
  constructor(private readonly timersService: TimersService) {}

  @JobHandler(TimerCompletionJob)
  async handle(payload: TimerCompletionPayload): Promise<void> {
    await this.timersService.handleScheduledCompletion(payload);
  }
}
```

### 3.3 `timers/timers.service.ts`

- Inject `JobScheduler` (as `jobs`) instead of `ScheduledJobService`.
- Add a private helper:

  ```ts
  /** Id of the completion job pending for `timer`, if any. Only a running timer has one. */
  private pendingCompletionJobId(timer: UserTimer): string | null {
    return timer.status === "running" && timer.transitionedAt
      ? timerCompletionJobId(timer.userId, timer.transitionedAt)
      : null;
  }
  ```

- `persistStart`, `persistPause`, `persistStop`: replace
  `current.pendingCompletionJobRef` with `this.pendingCompletionJobId(current)`.
  Compute it from `current` **before** `complete()` or the repo write. Rename
  `jobIdToCancel` → `jobToCancel`.
- `startSession` / `pauseSession` / `stopSession`:
  `await this.jobs.cancel(TimerCompletionJob, jobToCancel)`. Delete the wrong
  "singleton key is free" comment.
- `scheduleCompletion`:

  ```ts
  await this.jobs.schedule(
    TimerCompletionJob,
    {
      userId: timer.userId,
      transitionedAt: timer.transitionedAt.toISOString(),
    },
    { id: timerCompletionJobId(timer.userId, timer.transitionedAt), runAt },
  );
  ```

- Delete `attachJobRef`. `handleScheduledCompletion(payload: TimerCompletionPayload)`.
- Update the `applyTransition` doc comment: it no longer mentions a job-ref write.

### 3.4 Remove `pendingCompletionJobRef`

- `timers/entities/user-timer.entity.ts`: the prop and the field.
- `timers/timers.repository.ts`: the five `pendingCompletionJobRef: null` sets,
  `setPendingJobRef`, and the `mapRow` line.
- `apps/migrations/src/schema/userTimers.ts`: the column.
- Run `drizzle-kit generate` in `apps/migrations` (Claude may) →
  `migrations/0007_*.sql` with `ALTER TABLE ... DROP COLUMN "pending_completion_job_ref"`.
  Check the SQL contains nothing else.

### 3.5 Delete and rewire

- Delete `timers/timers.worker.ts` and `timers/scheduling/timer-jobs.constants.ts`.
- Delete `TimerCompletionJob` from `timers/models/timer.model.ts`.
- `timers/timers.module.ts`: `imports: [JobsModule, EventsPublisherModule]`;
  providers: `TimersWorker` → `TimerCompletionJobHandler`.

**Checkpoint 3 (user):** `pnpm --filter @asksynk/migrations db:migrate`
(local), then `test:integration`. Watch these in `test/timers/timers.integration.test.ts`:

- "completes a running timer via the scheduled job"
- "keeps a paused timer paused past its original completion time"
- the direct-switch cases

Commit: `timers: use typed jobs; drop pending_completion_job_ref`.

## Phase 4 — calendar sync

### 4.1 `calendar-integrations/sync/calendar-sync.jobs.ts`

The defs from 01 §Migration: calendar sync, plus:

```ts
/** Dedup bucket. Must stay ≤ CalendarSyncJob's deleteAfterSeconds (default 1h). */
const CALENDAR_SYNC_SLOT_SECONDS = 240;

export const calendarSyncJobId = (calendarId: string, now: Date) =>
  `${calendarId}:${Math.floor(now.getTime() / 1000 / CALENDAR_SYNC_SLOT_SECONDS)}`;
```

### 4.2 `calendar-integrations/sync/calendar-sync.job-handlers.ts`

```ts
@Injectable()
export class CalendarSyncJobHandlers {
  constructor(
    jobs: JobScheduler,
    calendarRepository: CalendarRepository,
    syncService: CalendarSyncService,
    clock: Clock,
  ) {}

  @JobHandler(CalendarSyncPollJob)
  async poll(): Promise<void> {
    const now = this.clock.now();
    const calendarIds = await this.listDueCalendarIds();
    for (const calendarId of calendarIds) {
      await this.jobs.schedule(
        CalendarSyncJob,
        { calendarId },
        { id: calendarSyncJobId(calendarId, now) },
      );
    }
  }

  @JobHandler(CalendarSyncJob)
  async sync(payload: CalendarSyncPayload): Promise<void> {
    await this.syncService.syncCalendar(payload.calendarId);
  }

  @Transactional()
  private async listDueCalendarIds(): Promise<string[]> {
    /* unchanged */
  }
}
```

Keep the class doc comment from `CalendarSyncScheduler`, updated for slot ids.
`Clock` is global (`ClockModule`).

### 4.3 Delete and rewire

- Delete `calendar-integrations/sync/calendar-sync.scheduler.ts` and
  `calendar-sync.constants.ts` (the scheduler is its only importer; every
  constant moves to the defs).
- `calendar-integrations/calendar-integrations.module.ts`:
  `MessageBusModule` → `JobsModule`; `CalendarSyncScheduler` →
  `CalendarSyncJobHandlers`.

**Checkpoint 4 (user):** `build`, then `pnpm dev` with a connected Google
calendar. Expect the poll log every minute, and a sync job per calendar at
most once per 4-min slot. `test:all`. Commit:
`calendar-sync: use typed jobs`.

## Phase 5 — cleanup

- Delete `platform/jobs/scheduled-job/` (only the service, impl and module are
  left after 1.1) and `platform/jobs/cron/`.
- `MessageBusService`:
  - remove `cancel` and `CancelOptions`;
  - `enqueue` drops its `ensureQueue` call; update its doc comment ("queue
    must exist; `JobHandlersRegistry` creates it at bootstrap");
  - `work` keeps its `ensureQueue` (the events runtime relies on it).
- Leftover sweep. This grep must return nothing under `apps/`:
  `ScheduledJob|scheduled-job|TIMER_COMPLETION_QUEUE|CALENDAR_SYNC_(POLL_)?QUEUE|pendingCompletionJobRef|CRON_JOB_METADATA`.
- Docs:
  - `docs/jobs/README.md`, `01-unified-jobs.md`, this file: status → built;
  - ADR 0007 status → `Accepted`, dropping "(not built)";
  - `docs/architecture/01-current-state.md`: "being replaced" → "replaced".
- Update the `unified-jobs` memory: built.

**Checkpoint 5 (user):** `build`, `test:all`. Commit: `jobs: remove ScheduledJobService and cron stub`.

## Phase 6 — deploy

1. Deploy. Migration `0007` drops `pending_completion_job_ref`.
2. Then clear jobs that use the old raw payload format:

   ```sql
   delete from pgboss.job
   where name in ('timer.completion', 'calendar.sync') and state < 'active';
   ```

3. Expected afterwards:
   - running timers complete lazily on the next `GET /timers`;
   - calendar sync refills on the next tick;
   - `calendar.sync.poll` re-registers in place;
   - existing queues pick up the new options (`deleteAfterSeconds: 3600`, etc.)
     through `ensureQueue` → `updateQueue`.

## Risks to watch during implementation

| Risk                                                                       | Where | Mitigation                                                              |
| -------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| `@ts-expect-error` on decorators lands on a different line than expected   | 2.1   | Move the directive to the line tsc reports; keep the case               |
| `deleteJob` throws on a missing id                                         | 1.9   | The integration "cancel frees id" case covers it; add a catch if needed |
| `fromDrizzleTx` + `deleteJob` array params                                 | 1.9   | The "cancel joins tx" case; `fromDrizzleTx` already handles `uuid[]`    |
| A provider schedules from `onApplicationBootstrap` before the registry ran | any   | Contract says don't; `assertRegistered` fails loudly                    |
| Timer cancel id computed after the repo write                              | 3.3   | Always derive from `current` (the pre-transition row)                   |
