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
- `Timer` records one domain event, `TimerTransitioned` (1:1 with `timer.lifecycle`).
- "Event" means outbox/domain event only: the timer history table is a **log**
  (`user_timer_log`, `TimerLogRepository`), its kind column is `transition`.
- `start()` from running records `completed` then `started`.
- Lazy completion on `GET` catches `concurrency_conflict` and reloads.
- No generic CRUD repository; typed records keep their repositories.
- The timer log gets its own `TimerLogRepository` (not part of the aggregate).
- Timer methods take `Actor`; guests → `timers.guest_not_allowed` (403).
- Renaming the consumer group drops undelivered rows in the old queue (accepted).

## Step 5.0 — Base

| File                                      | What                                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kernel/domain/aggregate-root.ts`         | `AggregateRoot<E>`: `version` (getter), `protected record(e)`, `pullEvents(): E[]`, `markSaved()` (`version += 1`)                                      |
| `kernel/errors/kernel.errors.ts`          | `concurrency_conflict` (`CONFLICT`, exposable, "Resource was modified concurrently, retry") + `concurrencyConflictError()` + `isConcurrencyConflict(e)` |
| `test/kernel/aggregate-root.unit.test.ts` | record / pull clears / `markSaved` bumps                                                                                                                |

`AggregateRoot` takes the loaded `version` in its constructor. No platform helper: each
`save` calls `EventsPublisher.publish` per mapped event (one loop, not worth a layer).

## Step 5.1 — `Timer` as reference

### Domain

`focus/domain/timer.events.ts`:

```ts
export type TimerTransitioned = {
  transition: TimerTransition; // started | paused | resumed | stopped | completed
  userId: string;
  sessionType: TimerSessionType;
  sessionDurationSeconds: number;
  remainingSeconds: number;
  occurredAt: Date;
};
```

`focus/domain/timer.ts` — `class Timer extends AggregateRoot<TimerTransitioned>`:

- State in a private `props: TimerProps` (+ `version` via base); public getters keep
  today's names, so `timers.mapper.ts` / `getSuggestion` don't change.
- `static rehydrate(props, version)` replaces `create`. No in-memory `create` (rows come
  from `ensure`).
- Every mutation sets `transitionedAt` (except `complete`) and `updatedAt = now`, then
  records one `TimerTransitioned`.

| Method                | Guard (error)                      | Mutation                                                                                                                                  | Records                  |
| --------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `start(session, now)` | none                               | if running → `complete(now)` first; `long_break` → counter = 0; `running`, session fields, `remaining = duration`, `transitionedAt = now` | (`completed`), `started` |
| `pause(now)`          | running (`timer_not_running`)      | remaining ≤ 0 → `complete(now)` instead; else `paused`, `remaining = remainingSeconds(now)`, `transitionedAt = now`                       | `paused` or `completed`  |
| `resume(now)`         | paused (`timer_not_paused`)        | `running`, `transitionedAt = now`                                                                                                         | `resumed`                |
| `stop(now)`           | running/paused (`no_active_timer`) | `stopped`, `remaining = remainingSeconds(now) ?? 0`, `transitionedAt = now`                                                               | `stopped`                |
| `complete(now)`       | running (`timer_not_running`)      | `completed`, `remaining = 0`, focus → counter + 1; `transitionedAt` unchanged                                                             | `completed`              |

Kept: `completesAt()`, `remainingSeconds(now)`, `isDue(now)`, `assertValidTransitionInput`.
New: `isRunSpan(transitionedAt: Date): boolean` — running and same `transitionedAt`
(the job's staleness guard, moved out of the service).
Deleted: the decider types (`TimerTransition` union, `TimerStarted`, …).
`timer.model.ts`: `TimerEventType` → `TimerTransition` (same values; name freed by the
deletion above).

### Persistence

One migration, generated by the user (`pnpm run generate-migrations`; answer **rename**
at drizzle-kit's prompts so no data is dropped):

- `userTimers.ts`: `version: integer("version").notNull().default(1)`.
- `userTimerEvents.ts` → `userTimerLog.ts`: table `user_timer_events` → `user_timer_log`,
  const `userTimerEvents` → `userTimerLog`, column `event_type` → `transition`, enum
  `timer_event_type` → `timer_transition` (const `timerTransition`), index →
  `idx_user_timer_log_user_occurred`.

`focus/domain/ports/timers.repository.ts`:

```ts
export abstract class TimersRepository {
  abstract ensure(userId: string): Promise<Timer>;
  abstract getByUserId(userId: string): Promise<Timer | null>;
  abstract save(timer: Timer): Promise<void>;
}
```

Deleted: `start`, `pause`, `resume`, `stop`, `completeIfRunning`, `StartInput`,
`appendEvent`, `AppendEventInput`.

The log is not part of the aggregate → own port + adapter:

```ts
// focus/domain/ports/timer-log.repository.ts
export interface TimerLogEntry {
  userId: string;
  transition: TimerTransition;
  sessionType: TimerSessionType;
  sessionDurationSeconds: number;
  remainingSeconds: number;
  occurredAt: Date;
}
export abstract class TimerLogRepository {
  abstract append(entry: TimerLogEntry): Promise<void>;
}
// focus/infrastructure/persistence/drizzle-timer-log.repository.ts
```

`focus.module.ts`: `{ provide: TimerLogRepository, useClass: DrizzleTimerLogRepository }`.

`DrizzleTimersRepository.save` (injects `EventsPublisher`):

1. `UPDATE user_timers SET <all mutable fields>, version = version + 1 WHERE id = ? AND version = ? RETURNING id`.
   No insert branch (rows only come from `ensure`).
2. No row → `concurrencyConflictError()`.
3. `timer.markSaved()`.
4. `for (const e of timer.pullEvents()) await publisher.publish(TimerLifecycle, toTimerLifecyclePayload(e))`.

`focus/infrastructure/persistence/timer-events.mapper.ts`: `toTimerLifecyclePayload(e)`
(`transition` → wire `eventType`, `occurredAt.toISOString()`). The `timer.lifecycle`
payload keeps `eventType`: it reaches the frontend via the `timer.completed` WS push.

### Application

`TimersService` (methods take `Actor`; private `ownUserId(actor)` throws new
`timers.guest_not_allowed` (`FORBIDDEN`) for guests, else `actor.userId`):

```ts
@Transactional()
async applyTransition(actor: Actor, input: TransitionTimerInput): Promise<Timer> {
  assertValidTransitionInput(input);
  const now = this.clock.now();
  const timer = await this.timersRepo.ensure(this.ownUserId(actor));
  const pendingJobId = this.pendingCompletionJobId(timer);
  // switch: start / resume / pause / stop on `timer`
  await this.timersRepo.save(timer);
  if (pendingJobId) await this.jobs.cancel(TimerCompletionJob, pendingJobId);
  await this.scheduleCompletion(timer); // no-op unless running
  return timer;
}
```

- Every transition changes `transitionedAt`, so "cancel the old job, schedule if
  running" covers all of start / resume / pause (incl. complete-when-due) / stop.
- `getCurrent(actor)`: `isDue` → `complete(now)` → `save`; on `concurrency_conflict`
  return `getByUserId` (reload). No job change (the job no-ops via `isRunSpan`).
- `handleScheduledCompletion(payload)`: load; `!timer?.isRunSpan(t)` → return;
  `complete(now)`; `save`. Conflict throws → pg-boss retries → `isRunSpan` false → no-op.
- Deleted: `persistStart/Resume/Pause/Stop`, `startSession/…`, `PersistResult`,
  `publishLifecycle`, private `complete`. `EventsPublisher` leaves the service.
- `getSettings` / `updateSettings` / `getSuggestion` → `Actor` too (touched file).

`TimersController`: `@RequestActor() actor: Actor` instead of `@AuthUser()`.

Log writer (presentation/events), renamed:

| From                                                                                       | To                                                                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `timers.event-log.handler.ts` / `TimersEventLogHandler`                                    | `timer-log.handler.ts` / `TimerLogHandler` (uses `TimerLogRepository`)    |
| `timer-event-log.consumer-group.ts` / `TimerEventLogConsumerGroup`, name `timer-event-log` | `timer-log.consumer-group.ts` / `TimerLogConsumerGroup`, name `timer-log` |

Renaming the group creates a new queue; the old `timer-event-log` queue is abandoned
(undelivered rows in it are lost; accepted).

Unchanged: broadcaster, job def/handler, responses.

### Tests

- `test/focus/timer.unit.test.ts` rewritten: per method — guard error, resulting
  state, recorded events (incl. start-from-running → `[completed, started]`,
  pause-when-due → `[completed]`, long-break reset, break completion doesn't bump
  counter), `pullEvents` empties, `isRunSpan`.
- `test/focus/timers.integration.test.ts`: existing HTTP cases unchanged, plus:
  - two loads of the same timer, save both → second throws `concurrency_conflict`;
  - save inside a tx that rolls back → no outbox row, no state change;
  - `eventCount` helper reads `userTimerLog.transition`.

  Both run through `TransactionHost.withTransaction` on the repo; HTTP 409 mapping is
  already covered by the errors platform.

- `test/kernel/aggregate-root.unit.test.ts` (5.0).

### Docs on finish

`01-current-state.md` §3.3 (Timer owns + applies its transitions); 03 §7 Timer row →
`done: focus/domain/timer.ts`; `user_timer_events` → `user_timer_log` in
02-context-map, 05-persistence; consumer-group row in `docs/platform/events.md`.

## Steps 5.2–5.7 — remaining aggregates

`TaskSuggestion` → `Invite` → `Task`/`TaskBatch` → `AttentionItem` → `CalendarEvent` →
`CalendarIntegration`. Each gets its own section here (methods, events + mapper,
`version` migration, service rewrite, tests) before it starts, written from the code
at that time.

## Verification (every step)

`pnpm run fix-imports` → `pnpm run lint` → `pnpm run test:all`. Migrations: drizzle-kit
generate runs here; `pnpm run migrate` and `test:integration:up` by the user.
