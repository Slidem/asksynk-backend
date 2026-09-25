# Ordering design

Originally verified against pg-boss **12.18.2** — `dist/plans.js` (fetch,
insert, fail, create_queue), `dist/manager.js` (fetch error handling, queue
cache), `dist/attorney.js`. Re-verified against **12.34.0** for the fetch path
(§3) and the fail/deletion path (§5 "Failures and dead letters").

## 1. Verdict

Ordering was **not** enforceable in the original pipeline, and the
`singletonKey` it passed was **inert**: on a `standard` policy queue with no
`singletonSeconds`, no index covers the column, so it bought neither uniqueness
nor dedupe.

Three structural breaks, two amplifiers. The fix needed no new infrastructure.

## 2. Where ordering breaks

### A — Outbox: timestamp is not commit order

`createdAt` uses `defaultNow()`, which in Postgres is **transaction start**
time. A publisher holding a long transaction inserts an early-stamped row that
only becomes visible after the dispatcher already drained and dispatched newer
rows.

Ordering the drain by `id` (uuidv7, stamped at statement time) narrows the
window but does not close it. Residual exposure is bounded by how long publisher
transactions run.

### B — Dispatch: concurrent drains commit out of order

Rows _are_ locked. `FOR UPDATE SKIP LOCKED` guarantees each node a disjoint set,
so this is **not** a double-read problem — it is a commit-order problem. Node A
takes rows 1–100, node B concurrently takes 101–200, and B can commit first,
landing its jobs in pg-boss ahead of A's.

### C — Enqueue: batch inserts collapse `created_on`

The sharpest one, and invisible without reading the SQL.

pg-boss's `insertJobs` never sets `created_on`; it falls through to the column
default `now()` — transaction time. **Every job the dispatcher inserts in one
transaction therefore carries an identical `created_on`.**

The fetch is `ORDER BY priority desc, created_on, id`. With `created_on` tied,
ordering collapses entirely onto `id`, which defaults to `gen_random_uuid()`.
Order within a batch is random. This exists even with a single-node dispatcher.

### Amplifier — no serialization key, and 5×N workers

The queue was `eventType.group` and `singletonKey` was `${outboxId}.${group}` —
unique per job, so it partitioned nothing. `localConcurrency: 5` across N nodes
ran up to 5N handlers interleaved on one queue.

Separately, queue-per-event-type meant no ordering at all between
`message.created` and `message.updated` for the same message — different queues.

### Amplifier — a retry lets its successor overtake it

A failed job re-enters `retry` with a later `start_after`. Under any policy that
does not block on the retry state, event N+1 processes while event N is still
waiting. Ordering survives retries only if the retry state itself blocks the key.

## 3. What pg-boss actually enforces

`singleton_key` is just a column. Its meaning comes entirely from which partial
unique index covers it, and that is decided by the queue policy set at creation.

| Mechanism                                       | Backing index                                                         | Effect on our events                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| policy `standard` _(what we ran)_               | none                                                                  | **Inert.** Stored and never read.                                                            |
| `singletonSeconds`                              | `job_i4 (name, singleton_on, key)`                                    | **Wrong tool.** A throttle — silently drops the second event in the window.                  |
| `short` / `singleton` / `stately` / `exclusive` | `job_i1/2/3/6`, filtered by state                                     | **Drops inserts.** `singleton` serializes but does not block on `retry`, so retries reorder. |
| `key_strict_fifo` _(what we run)_               | `job_i8 (name, singleton_key)` where state in `active, retry, failed` | **What we want.** Postgres-enforced. Never drops an insert; blocks the key across retries.   |
| `group` + `groupConcurrency`                    | none — unlocked count CTE                                             | **Advisory only.** Two concurrent fetches can both read zero active and both proceed.        |

**Groups are for fairness; keys are for correctness.** Only `key_strict_fifo` is
backed by a unique index, which is why it is the one mechanism that survives a
race between two nodes.

Two consequences of choosing it:

1. `failed` is in the index predicate, so a job pg-boss marks `failed` blocks its
   key until the row is removed. This is why terminal failures must never reach
   pg-boss — see §5.
2. **The fetch path depends on the pg-boss version.**

### 12.18.2: one blocked key stalls the whole queue

On 12.18.2 the strict-FIFO fetch does **not** skip blocked keys. It selects the
oldest eligible job, then `UPDATE … SET state = 'active'`. If that job's key
already has a row in `active`, `retry` or `failed`, the update hits the `job_i8`
unique violation; `manager.fetch()` swallows the error ("errors from fetchquery
should only be unique constraint violations") and returns an empty batch.

The head of the queue is then blocked, so **every** fetch returns nothing —
unrelated keys included. That happens for the whole backoff window of every
retry, and forever behind a `failed` row.

### 12.34.0: a blocked key blocks only itself

12.34.0 rewrote the fetch for `key_strict_fifo`: a `strict_fifo_heads` CTE picks
one head per key (`DISTINCT ON (singleton_key)`, retry jobs first), and a
`NOT EXISTS` clause skips any key that already has a row in `active`, `retry`
or `failed`. A blocked key is filtered out instead of aborting the statement.

**We require pg-boss ≥ 12.34.0.**

## 4. Decisions

|                          |                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **group**                | A consumer group is a typed const (`ConsumerGroup<E>`: `name` + `orderingKeyFn`) owned by its context and passed to `@EventHandler(Event, Group)`. The platform derives the group map from the discovered handlers. |
| **key**                  | The ordering key belongs to the **group**, not the handler. See [02-consumer-groups.md](02-consumer-groups.md) for the map.                                                                                         |
| **fan-out**              | At the **producer**. An event that concerns several users is published once per recipient, so one outbox row is one job per group.                                                                                 |
| **shape**                | One queue per group. `eventType.group` → `group`; event type moves into the job payload.                                                                                                                            |
| **scope**                | All durable events are ordered. Every group runs `key_strict_fifo`.                                                                                                                                                 |
| **retries**              | Owned by the runtime: `MAX_ATTEMPTS = 3`, exponential backoff 2s → 30s cap, 120s expiry.                                                                                                                            |
| **failure**              | On the terminal attempt the runtime writes our own dead-letter row and **completes** the job. Silent toward pg-boss, loud in logs. pg-boss's own `deadLetter` is not used.                                          |
| **replay**               | Deferred. The dead-letter row carries a `status` so replay can be added later.                                                                                                                                      |
| ~~**email group**~~      | Dropped entirely — it had no handler and never did.                                                                                                                                                                 |
| ~~**`groups` on events**~~ | Dropped from `defineEvent` and from the outbox. The producer no longer names its consumers.                                                                                                                       |

## 5. Design as built

|                |                                                                              |
| -------------- | ---------------------------------------------------------------------------- |
| queue name     | `${group.name}` — one per consumer group, ensured at bootstrap               |
| policy         | `key_strict_fifo` uniformly; only the key _value_ varies by group            |
| `singletonKey` | `group.orderingKeyFn(payload)` — see [02](02-consumer-groups.md)             |
| job id         | the outbox row id                                                            |
| job data       | `{ eventId, eventType, payload }` — the runtime dispatches on `eventType`    |
| queue options  | `DURABLE_GROUP_QUEUE_OPTIONS` in `platform/events/consumer/durable-delivery.constants.ts` |

### Consumer groups and handler discovery

```ts
// calendar-integrations/calendar-sync.consumer-group.ts
export const CalendarSyncConsumerGroup: ConsumerGroup<
  typeof CalendarEventCreated | typeof CalendarEventUpdated | typeof CalendarEventDeleted
> = {
  name: "calendar-sync",
  orderingKeyFn: (event) => event.userId,
};

// calendar-integrations/sync/calendar-sync.event-handler.ts
@EventHandler(CalendarEventCreated, CalendarSyncConsumerGroup)
async onCreated(payload: EventOf<typeof CalendarEventCreated>) { … }
```

`ConsumerGroup<E>` is typed over the union of events it consumes, so
`orderingKeyFn` is written against their payloads.

[`EventHandlersRegistry`](../../apps/api/src/platform/events/decorators/event-handlers.registry.ts)
(`platform/events/decorators/`) scans providers with Nest's `DiscoveryService`
at `onApplicationBootstrap` and exposes:

- `getHandlers()` — every decorated handler, realtime and durable
- `getConsumerGroups(eventName)` — the distinct groups that handle an event
- `getAllConsumerGroupHandledEvents()` — the event types this process can
  consume durably
- `getAllConsumerGroups()` — throws if two handlers use different objects with
  the same group name; a group is identified by its **const instance**

It then ensures one queue per group with `DURABLE_GROUP_QUEUE_OPTIONS`.
`MessageBusService.ensureQueue` applies the non-policy options to an existing
queue via `updateQueue` (`createQueue` is a no-op when the queue exists), then
reads the policy back and **fails startup on a mismatch** — policy is immutable,
so a queue created before the change would otherwise keep `standard` forever
and enforce nothing.

#### Why decorator discovery is acceptable after all

An earlier draft rejected deriving groups from decorators: Nest discovery only
sees what its own process loaded, so a dispatcher using that map would resolve
zero groups for some rows, mark them dispatched, and lose them.

The implementation closes that hole at the drain instead. The dispatcher only
selects rows whose `event_type` is in `getAllConsumerGroupHandledEvents()`:

```ts
inArray(eventsOutbox.eventType, handledEventTypes)
```

A row with no durable handler in this process is **left** in the outbox, not
dropped. The cost moves from silent loss to a visible backlog.

This buys two things over a platform registry bean: no registration step or
init-order rules (every read happens in `onApplicationBootstrap`, after all
providers exist), and no statement of the subscription in two places.

#### `@EventHandler`'s group argument is the lane discriminator

A `Dual` event has handlers on both legs — `ws.gateway.ts` takes
`message.created` for the realtime push while `message-attention.handler.ts`
takes it for `attention-items`. The only thing telling them apart is whether the
decorator passes a group:

```ts
if ((delivery === Realtime || delivery === Dual) && group === undefined) → realtime
if ((delivery === Durable  || delivery === Dual) && group !== undefined) → durable
```

The decorator rejects a group on a realtime event.

#### The completeness constraint

The dispatcher can only create jobs for groups its own process has handlers
for. That is fine today — one API process loads every context module.

If a worker app ever hosts some handlers, split groups break: an event consumed
by one group in the API and another in the worker is marked dispatched by
whichever node drains it first, with jobs for **that node's groups only**.
**Whatever process runs the dispatcher must load every context module that has
a durable handler.**

### Job ids

Because `created_on` ties across a batch (break C), `id` **is** the sort key.

With fan-out at the producer, one outbox row produces at most one job per group
queue, so `id: <outbox row id>` is enough: uuidv7 gives the row order, and the
`(name, id)` primary key gives dedupe. A second insert of the same row into the
same queue hits `ON CONFLICT DO NOTHING`.

Do not reach for `orderByCreatedOn: false` instead. It worked in 12.18.2 but is
deprecated and ignored from 12.30.0.

### Exactly-once dispatch

The insert joins the drain's drizzle transaction:

```ts
await this.bus.insertJobs(jobs, fromDrizzleTx(tx));
```

so the jobs and the `dispatched_at` update commit together.

[`fromDrizzleTx`](../../apps/api/src/platform/jobs/scheduled-job/pgboss-drizzle-db.ts)
replaces pg-boss's own `fromDrizzle`: that one interpolates raw values into
drizzle's `sql` tag, and drizzle spreads a JS array into `(a, b, …)`. pg-boss
passes id arrays for casts like `UNNEST($2::uuid[])`, so the cast receives a
scalar and Postgres throws `22P02`, aborting the caller's transaction. Wrapping
each value in `sql.param()` binds an array as one value.

Queue creation happens at bootstrap: `createQueue` wraps itself in its own
`BEGIN/COMMIT` and cannot join the caller's transaction.

### Single-writer drain

The drain takes `pg_try_advisory_xact_lock(hashtext('events_outbox_dispatcher'))`;
a node that fails to acquire skips the tick. The lock releases on commit, so any
node can take the next batch — whoever holds it always takes the oldest
undispatched rows, so order holds regardless of which node wins. The drain is
ordered by `id`.

The outbox `NOTIFY` trigger only fires for `durable` / `dual` rows
(migration `0005_narrow_outbox_notify.sql`); realtime rows have their own
channel.

### Failures and dead letters

**Why not pg-boss's dead-letter queue.** A queue-level `deadLetter` _copies_ the
job into another queue and leaves the original row in `failed` in the source
queue. `failed` is in the `job_i8` predicate and in 12.34's fetch blocker, so
the key stays blocked until the row is deleted.

**Why not `deleteAfterSeconds`.** It is documented as "how long a job should be
retained … after it's completed". In the 12.34 code a terminal fail does set
`completed_on` and the deletion sweep only checks `completed_on`, so failed rows
_would_ be removed too — but that is undocumented, the sweep is throttled by
`maintenanceIntervalSeconds`, and the key would stay blocked for minutes. We do
not rely on it.

**So pg-boss never sees a terminal failure.** The runtime
([`durable-consumer-runtime.service.ts`](../../apps/api/src/platform/events/consumer/durable-consumer-runtime.service.ts))
owns the attempt count:

```ts
// retryLimit = MAX_ATTEMPTS → pg-boss allows MAX_ATTEMPTS + 1 attempts
if (job.retryCount >= MAX_ATTEMPTS) {       // sentinel attempt, see below
  await deadLetter("attempt abandoned: expired or worker died");
  return;                                   // completes → key unblocks
}
try {
  lookup handler; schema.parse(payload); await handler(payload, ctx);
} catch (error) {
  if (attempt < MAX_ATTEMPTS) throw error;  // pg-boss retries, key stays blocked
  await deadLetter(error);
  return;                                   // completes → key unblocks now
}
```

Everything — the handler lookup, payload validation, the handler — sits inside
the `try`. Deterministic errors (invalid payload, no handler for the type) are
not special-cased: they use up their attempts like any other error and then
dead-letter.

The `throw` branch matters as much as the other one. Swallowing the _first_
error would drop an event on any transient blip; only the terminal attempt
dead-letters.

**Failures outside the catch.** Two cases never reach the `catch`:

1. **Expiry** — a handler that runs past `expireInSeconds` (120s) is failed by
   pg-boss's supervisor. The handler's promise is still pending.
2. **Worker death** — a deploy kill or OOM leaves the job `active` until it
   expires, which is case 1.

If either hits the terminal attempt, pg-boss would mark the job `failed`. To
prevent that, the queue's `retryLimit` is `MAX_ATTEMPTS`, one more pg-boss
attempt than the runtime uses. That extra attempt only runs when the terminal
attempt died outside the catch; the runtime sees
`job.retryCount >= MAX_ATTEMPTS`, dead-letters without invoking the handler, and
completes. The same attempt covers a dead-letter insert that itself threw.

**The table.** `events_dead_letters` (`apps/migrations/src/schema/eventsDeadLetters.ts`),
one table for every group:

| column           |                                                          |
| ---------------- | -------------------------------------------------------- |
| `id`             | uuidv7                                                   |
| `consumer_group` | the group / queue name                                   |
| `event_id`       | outbox row id — no FK, the outbox will be pruned         |
| `event_type`     |                                                          |
| `payload`        | jsonb                                                    |
| `error`          | stack or message of the last failure                     |
| `attempts`       |                                                          |
| `status`         | `pending` \| `replayed` \| `discarded`, default `pending` |
| `created_at`     |                                                          |

Unique on `(event_id, consumer_group)`; the write is `ON CONFLICT DO NOTHING`.
The row is written _before_ the job completes, so a crash in between re-runs
the sentinel attempt and the index absorbs the duplicate.

The write goes through `EventsDeadLettersRepository`
(`platform/events/dead-letters/`), outside the handler's transaction — the
handler's `@Transactional()` has already rolled back by the time the catch runs.

**Silent toward pg-boss, loud in logs.** The job never reaches `failed`, so
`getBlockedKeys` stays empty and pg-boss raises nothing. Non-terminal failures
log at `warn`; dead-lettering logs at `error`. The table is the record.

### Replay

Deferred. When it lands, replay **must allocate a fresh job id**: the original
job carried the outbox row id and is now `completed`, so re-inserting under that
id hits `ON CONFLICT DO NOTHING` on `(name, id)` and silently does nothing.

The dead-letter `status` makes replay a state transition rather than an action
endpoint, per the project's no-verb-endpoints rule:

```
PATCH /event-dead-letters/:id  { "status": "replayed" }
```

It needs an authorization model first — there is no admin role today.

## 6. What this costs

**Per-key serialization caps per-key throughput.** A user's events in a group
process one at a time cluster-wide. The ceiling is 1 ÷ handler latency _per
user_, not globally — parallelism across users is unaffected.

**Fan-out multiplies outbox rows.** A message in a thread with N other
participants becomes N outbox rows, and N jobs in `attention-items`. Threads are
small, so this is a constant factor, but it is a real one. It also multiplies the
realtime leg: the gateway receives one `message.created` per recipient.

**A terminal failure skips an event.** Auto-unblock is availability chosen over
strict FIFO: subsequent events for that key proceed past a gap. The dead-letter
row is the only record the gap exists, and replaying it re-orders it by
definition.

**Retries block their key, and only their key.** A failing event holds its key
for the whole retry sequence — roughly 2–4 s then 4–8 s of backoff between the
three attempts, plus handler time, or up to 2 × 120 s if attempts expire — before
dead-lettering. Other keys in the queue keep flowing (pg-boss ≥ 12.34).

**An expired attempt is not cancelled.** pg-boss expiry does not abort the
running handler, so it can overlap with the retry. Handlers must stay
idempotent, which the outbox already requires.
