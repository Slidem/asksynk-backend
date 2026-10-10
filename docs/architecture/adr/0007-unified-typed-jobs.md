# ADR 0007 — Unified typed jobs with caller-derived ids

**Status:** Accepted (2026-10-05) · built
**Reference:** [platform/jobs](../../platform/jobs.md)

## Context

Background work ran through three unrelated paths: `ScheduledJobService` (returned a
pg-boss uuid that timers stored in `user_timers.pending_completion_job_ref` to cancel
later; untyped payload; worker bound by a queue string), `CalendarSyncScheduler`
calling `MessageBusService` with inline pg-boss options, and an unused cron stub.

## Options

- **A. Add types to `ScheduledJobService`.** Callers still store refs; cron stays apart.
- **B. A `jobs` table mapping domain keys → pg-boss ids.** Extra write and a second
  source of truth.
- **C. Caller-derived deterministic ids, one module for every job kind _(chosen)_.**

## Decision

1. One module (`platform/jobs/`): `defineJob<T>` for queued jobs (async vs delayed
   differ only by `runAt`), `@CronJob({ name, cron })` for crons (no def object — no
   producer references it), `@JobHandler(def)` for consumers, `JobScheduler`
   (abstract-class port) for producers.
2. The caller supplies a deterministic id per occurrence; platform maps it with
   `uuidv5`. Schedule and cancel both recompute it — nothing stored.
   `pending_completion_job_ref` dropped.
3. An id is never reused within the retention window (a finished row blocks it).
4. Payload type is TS-only (phantom type). Producer and handler ship together.
5. Defs live in the owning context; platform discovers handlers.
6. Final failure: logged, left `failed`. No DLQ — current jobs self-heal (lazy timer
   completion, next calendar poll).
7. Finished rows deleted after `deleteAfterSeconds` (default 2 days).
8. Single process: producers, workers, cron clock in the API. `schedule` fails fast
   without a registered handler.
9. Crons reconciled at bootstrap: a pg-boss schedule with no `@CronJob` in code is
   unscheduled.

Rejected: a central job registry (couples platform to contexts); zod payloads (jobs
don't cross contexts or outlive deploys like events do); pg-boss `cancel` (leaves a
`cancelled` row blocking the id); exposing `singletonKey`/`singletonSeconds`
(time-bucketed ids cover the one dedup need); an automatic tx per handler (calendar
sync does HTTP outside a tx).

## Consequences

- **+** No queue internals in domain tables; cancel needs only domain state.
- **+** Wrong payload / mismatched handler is a compile error.
- **+** One API, options model and runtime for every job kind.
- **−** Reusing an id inside retention silently drops the schedule (documented on the
  port, not enforced).
- **−** A failed job leaves only a log line and a short-lived row.
- **−** Payload changes must stay compatible with queued jobs.
- **−** Cron reconcile assumes one process registers every cron.

## Verification

`test/jobs/*.unit.test.ts` (types incl. `@ts-expect-error` cases, `defineJob`,
`@CronJob`, registry); `test/jobs/job-scheduler.integration.test.ts` (tx rollback
leaves no job, repeat id no-op, cancel frees id, stale crons unscheduled);
`test/timers/timers.integration.test.ts`.
