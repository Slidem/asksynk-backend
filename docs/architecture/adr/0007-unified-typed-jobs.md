# ADR 0007 — Unified typed jobs with caller-derived ids

**Status:** Accepted (not built)
**Date:** 2026-10-05
**Deciders:** Mihai Alexandru
**Detail:** [docs/jobs](../../jobs/README.md): the design, the pg-boss facts it
relies on, and the execution plan

---

## Context

Background work runs on pg-boss through three unrelated paths:

- `ScheduledJobService` (`platform/jobs/scheduled-job/`). `schedule()` returns
  the pg-boss job UUID. Timers store it in `user_timers.pending_completion_job_ref`
  so they can cancel later, which puts a queue internal in a domain table. A
  separate `process()` call binds the worker, and it is linked to the producer
  only by a queue string. The payload is untyped.
- `CalendarSyncScheduler` calls `MessageBusService` directly, with pg-boss
  options (`singletonKey`, `singletonSeconds`, retries) inline.
- `platform/jobs/cron/`, an unused decorator stub.

The timer's `jobId → singletonKey` was also inert: on a `standard` queue,
`singletonKey` only dedups together with `singletonSeconds`. Correctness came
from the same-tx cancel and the `transitionedAt` staleness check, not from the
key.

## Options considered

### A. Keep `ScheduledJobService`, add types

Generics on the existing port. Callers still store the returned ref to cancel,
so the domain table keeps the column, and cron stays a separate path.

### B. Store refs in a dedicated `jobs` table

A platform-owned table mapping domain keys to pg-boss ids. It moves the leak out
of domain tables but adds a write per schedule and a second source of truth that
can drift from pg-boss.

### C. Caller-derived deterministic ids, one module for every job kind _(chosen)_

The caller names each occurrence with an id derived from domain state. The
platform maps it to a UUID with uuidv5. Scheduling and cancelling both
recompute it, so nothing is stored. pg-boss's `(name, id)` primary key with
`ON CONFLICT DO NOTHING` makes a repeat schedule a no-op.

## Decision

1. **One jobs module** (`platform/jobs/`). `defineJob<T>` for queued jobs
   (scheduled and async differ only by `runAt`), `defineCronJob` for crons,
   `@JobHandler(def)` for consumers, `JobScheduler` (abstract class port, per
   [ADR 0002](0002-repository-ports-as-abstract-classes.md)) for producers.
2. **The caller supplies a deterministic id per occurrence.** It is mapped to
   a pg-boss UUID with `uuidv5(id, JOBS_UUID_NAMESPACE)`. Cancel is
   `deleteJob`, which frees the id. No pg-boss ref is stored anywhere.
   `user_timers.pending_completion_job_ref` is dropped.
3. **An id is never reused.** A finished row blocks its id until it is swept.
   Domain-derived ids (`userId:transitionedAt`) are unique per occurrence.
   Time-bucketed ids (calendar sync, `calendarId:slot`) need
   `deleteAfterSeconds` ≥ the bucket.
4. **The payload type is TS-only**, a phantom type on the def. There is no
   runtime validation: producer and handler ship in one deploy.
5. **Defs live in the owning context.** Platform discovers handlers; it never
   imports a context ([ADR 0005](0005-kernel-and-platform-tiers.md)).
6. **A final failure is logged and left `failed`.** There is no DLQ: the
   current jobs recover on their own (lazy timer completion, the next
   calendar poll).
7. **Short retention.** Finished rows are deleted after `deleteAfterSeconds`,
   default 1h. pg-boss sweeps every 5 min (`maintenanceIntervalSeconds: 300`).
8. **Single process.** Producers, workers and the cron clock run in the API.
   `schedule` fails fast when a def has no registered handler.
9. **Crons are reconciled at bootstrap.** A pg-boss schedule with no cron def
   in code is unscheduled.

### Rejected

- **A central job registry file.** It couples platform to every context. Defs
  in the owning context plus discovery do the same job.
- **zod payload schemas.** Events need them because they cross contexts and
  outlive deploys in the outbox. Jobs are produced and consumed by one module.
- **pg-boss `cancel` instead of `deleteJob`.** `cancel` leaves a `cancelled`
  row that blocks the id for the retention window.
- **Exposing `singletonKey` / `singletonSeconds`.** Time-bucketed ids express
  the only dedup in use (calendar sync) without leaking pg-boss options.
- **An automatic tx around each handler.** Calendar sync deliberately does
  provider HTTP outside a tx. Handlers opt in with `@Transactional()`.

## Consequences

### Positive

- No queue internals in domain tables. Cancel needs only domain state.
- A wrong payload or a mismatched handler is a compile error.
- Scheduled, async and cron jobs share one API, options model and runtime.
- Job tables stay small (about 15 finished rows per calendar instead of about 2.5k).

### Negative

- Reusing an id within the retention window silently drops the schedule. The
  rule is documented on the port, but nothing enforces it.
- A failed job leaves only a log line and a row that lives 1h.
- A payload shape change must stay compatible with jobs already queued, or be
  paired with deploy SQL.
- Cron reconcile assumes one process registers every cron. A second process
  with a partial module set would unschedule the other's crons.
- A final attempt that expires is marked `failed` by pg-boss without a log.

### Neutral

- Handlers re-check domain state before acting (at-least-once, and a handler
  can run after `cancel`). This was already required.
- Two syncs of one calendar can still overlap across a slot boundary, as today.

## Verification

- Type spec: `// @ts-expect-error` for a wrong payload, a mismatched handler,
  and a `Date` in a payload.
- `test/jobs/job-scheduler.integration.test.ts`: tx rollback leaves no job,
  repeat id is a no-op, cancel frees the id, `ctx.jobId` is the caller id,
  stale crons are unscheduled.
- `test/timers/timers.integration.test.ts` still passes, with completion via
  the job and no completion after a pause.

## References

- [docs/jobs/01-unified-jobs.md](../../jobs/01-unified-jobs.md)
- [docs/jobs/02-execution-plan.md](../../jobs/02-execution-plan.md)
- [ADR 0006](0006-group-ordered-event-delivery.md): the events side of pg-boss
- pg-boss 12.34.0 `dist/plans.js`: `insertJobs` (`ON CONFLICT DO NOTHING`),
  `deleteJobsById`, `deletion`; `dist/attorney.js`: `maintenanceIntervalSeconds`
