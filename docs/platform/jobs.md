# Jobs (as built)

One typed API for queued (async or delayed) and cron jobs over pg-boss. Producers,
workers and the cron clock all run in the API process.
Decision record: [ADR 0007](../architecture/adr/0007-unified-typed-jobs.md).
Code: `apps/api/src/platform/jobs/`.

## API

```ts
// <ctx>/…/<name>.job.ts — the def lives in the owning context
export const TimerCompletionJob = defineJob<{ userId: string; transitionedAt: string }>({
  name: "timer.completion",
  options: { /* Partial<JobOptions> */ },
});

// producer — inside the caller's tx (@Transactional, via fromDrizzleTx)
await this.jobs.schedule(TimerCompletionJob, payload, { id: `${userId}:${iso}`, runAt });
await this.jobs.cancel(TimerCompletionJob, `${userId}:${iso}`);

// consumer
@JobHandler(TimerCompletionJob)
async handle(payload, ctx: { jobId; attempt }) {}

// cron — no def, no producer
@CronJob({ name: "events.retention", cron: "0 3 * * *", options? })
async run() {}
```

- `JobScheduler` is an abstract-class port; `PgBossJobScheduler` implements it.
- **`id` is required and caller-derived**, deterministic per occurrence. It maps to a
  pg-boss uuid with `uuidv5(id, JOBS_UUID_NAMESPACE)` — never change that namespace.
  Scheduling the same id again is a silent no-op (`ON CONFLICT DO NOTHING`).
- **Cancel = delete** (`deleteJob`), any state, frees the id. Missing id is a no-op.
  Nothing is stored in domain tables.
- **Never reuse an id within `deleteAfterSeconds`** — a finished row blocks it. Derive
  ids from state that changes every occurrence, or time-bucket them (bucket ≤
  retention).
- Payload type is TS-only and JSON-only (`Date` fails to compile — use ISO strings).
  No runtime validation.
- `schedule` fails fast if the def has no registered handler (`assertRegistered`).

## Defaults (`job-options.constants.ts`)

`retryLimit 2`, `retryDelaySeconds 0`, `retryBackoff false`, `expireInSeconds 900`,
`deleteAfterSeconds 172800` (2 days), `pollingIntervalSeconds 2`, `concurrency 1`.
Queues use pg-boss's default (`standard`) policy. pg-boss's maintenance interval is
not configured, so finished rows can outlive `deleteAfterSeconds` by up to one sweep.

## Bootstrap (`JobHandlersRegistry`)

Discovers `@JobHandler` / `@CronJob` providers; duplicate or conflicting names throw.
Per job: `ensureQueue` with the options, `scheduleCron` for crons (syntax checked via
`previewSchedule`), then `work` with polling + `localConcurrency`. Then
**`reconcileCrons()` unschedules any pg-boss cron not declared in code** — disable
with `JOBS_RECONCILE_CRONS=false`. Failures log `warn` while retrying, `error` on the
final attempt, and rethrow; a final failure is left `failed` (no DLQ).

## Jobs in the app

| Name                 | Kind            | Where                                                    | Notes                                                                                   |
| -------------------- | --------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `timer.completion`   | queued, delayed | `timers/scheduling/timer-completion.job.ts`              | id `userId:transitionedAt`; scheduled on start/resume at `completesAt`, cancelled on start/pause/stop in the same tx |
| `calendar.sync`      | queued          | `calendar-integrations/sync/calendar-sync.jobs.ts`       | retry 3, 30 s backoff, concurrency 4; id `calendarId:floor(epochSec/240)` (4-min dedup bucket) |
| `calendar.sync.poll` | cron `*/1 * * * *` | `calendar-integrations/sync/calendar-sync.job-handlers.ts` | fans out one `calendar.sync` per sync-enabled calendar                                |
| `events.retention`   | cron `0 3 * * *` | `platform/events/retention/`                            | see [events](events.md#retention)                                                       |

## Handler contract

- At-least-once. Handlers must be idempotent and **re-check domain state** — a job can
  run after `cancel` (fetched before the delete committed), as the timer handler does
  with `transitionedAt`.
- May fire up to `pollingIntervalSeconds` late.
- No automatic tx: opt in with `@Transactional()` (calendar sync does HTTP outside a tx).
- Don't schedule from `onApplicationBootstrap` — handlers may not be registered yet.
- The payload is a contract across deploys; change it compatibly or clear queued jobs.
- A final attempt that exceeds `expireInSeconds` is marked `failed` by pg-boss
  without reaching the catch, so it isn't logged.
- To make **another** context act, publish an event — jobs are for a context's own work.

## Known gaps

- `calendar-sync.jobs.ts:16` comment says the default `deleteAfterSeconds` is 1h; it is
  2 days (the 4-min bucket is still well within it).
- Two syncs of one calendar can overlap when retries cross a bucket boundary.
