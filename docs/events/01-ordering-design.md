# Ordering design

Verified against pg-boss **12.18.2** — `dist/plans.js` (fetch, insert, fail,
create_queue), `dist/manager.js` (fetch error handling, queue cache),
`dist/attorney.js`.

## 1. Verdict

Ordering is **not** enforceable in the current pipeline, and the `singletonKey`
we pass today is **inert**: on a `standard` policy queue with no
`singletonSeconds`, no index covers the column, so it buys neither uniqueness
nor dedupe.

Three structural breaks, two amplifiers. The fix needs no new infrastructure.

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

The queue is `eventType.group` and `singletonKey` is `${outboxId}.${group}` —
unique per job, so it partitions nothing. `localConcurrency: 5` across N nodes
runs up to 5N handlers interleaved on one queue.

Separately, queue-per-event-type means there is no ordering at all between
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
| policy `standard` _(what we run)_               | none                                                                  | **Inert.** Stored and never read.                                                            |
| `singletonSeconds`                              | `job_i4 (name, singleton_on, key)`                                    | **Wrong tool.** A throttle — silently drops the second event in the window.                  |
| `short` / `singleton` / `stately` / `exclusive` | `job_i1/2/3/6`, filtered by state                                     | **Drops inserts.** `singleton` serializes but does not block on `retry`, so retries reorder. |
| `key_strict_fifo`                               | `job_i8 (name, singleton_key)` where state in `active, retry, failed` | **What we want.** Postgres-enforced. Never drops an insert; blocks the key across retries.   |
| `group` + `groupConcurrency`                    | none — unlocked count CTE                                             | **Advisory only.** Two concurrent fetches can both read zero active and both proceed.        |

**Groups are for fairness; keys are for correctness.** Only `key_strict_fifo` is
backed by a unique index, which is why it is the one mechanism that survives a
race between two nodes.

Two consequences of choosing it:

1. Enforcement is a constraint violation, not a queue-side skip. `manager.fetch()`
   swallows the resulting error and returns an empty batch, so a contended poll
   fetches nothing at all.
2. `failed` is in the index predicate, so a poison event blocks its key until the
   row is removed.

## 4. Decisions

|                                |                                                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **registry**                   | Consumer groups are declared, not inferred. A static registry owns each group's name, the events it consumes, and the strategy that orders them — separate from the event definitions, so every module declares its own group. |
| **key**                        | The ordering key belongs to the **group**, not the handler. See [02-consumer-groups.md](02-consumer-groups.md) for the map.                                                                                                    |
| **fan-out**                    | A group's key may resolve to _several_ keys for one event, producing one job per key. `attention-items` uses this for the three message events.                                                                                |
| **shape**                      | One queue per group. `eventType.group` → `group`; event type moves into the job payload.                                                                                                                                       |
| **scope**                      | All durable events are ordered. Every group runs `key_strict_fifo`.                                                                                                                                                            |
| **failure**                    | Explicit `retryLimit`; on the terminal attempt the runtime writes our own dead-letter row and **completes** the job. Silent toward pg-boss, loud in logs.                                                                      |
| **replay**                     | Dead-letter replay ships in this pass.                                                                                                                                                                                         |
| ~~**email group**~~            | Dropped entirely — it has no handler and never did.                                                                                                                                                                            |
| ~~**outbox `groups` column**~~ | Dropped. The dispatcher resolves event → groups from the registry at drain time, so a newly added group also picks up the backlog.                                                                                             |

## 5. Target design

|                |                                                                             |
| -------------- | --------------------------------------------------------------------------- |
| queue name     | `${group}` — one per consumer group, created at bootstrap from the registry |
| policy         | `key_strict_fifo` uniformly; only the key _value_ varies by group           |
| `singletonKey` | from the group's ordering strategy — see [02](02-consumer-groups.md)        |
| `retryLimit`   | set explicitly at queue creation, not left to the pg-boss default of 2      |
| job data       | `{ eventId, eventType, payload }` — the runtime dispatches on `eventType`   |

### The group registry owns the ordering key

```ts
defineConsumerGroup({
  name: "calendar-sync",
  events: [CalendarEventCreated, CalendarEventUpdated, CalendarEventDeleted],
  ordering: (event, payload) => `user:${payload.userId}`,
});
```

Three constraints, and each is why this sits on the group rather than on
`@EventHandler`:

**It must be total.** `key_strict_fifo` carries a CHECK that `singleton_key` is
never null, and a single null fails the batch insert for the _entire_ group —
not just the offending event.

**It must be declarative, not decorator-scanned.** Nest discovery only sees what
its own process loaded, so a dispatcher deriving groups from decorators gets a
partial map and events silently never dispatch.

**It is a queue-wide contract.** The key is written once per job by the
dispatcher, and the index is `(name, singleton_key)` where `name` is the group —
so two handlers in one group cannot disagree about what orders it. Cross-type
ordering (`message.created` before `message.updated` on the same message) only
works when both event types emit the same key.

### Registration and wiring

`defineConsumerGroup` registers nothing by itself. Like `defineEvent`, it is a
factory plus validator that returns a frozen object, evaluated when its module is
first imported — not by Nest, not by DI.

That is fine for events today because nothing needs a lookup: consumers import
the const directly (`@EventHandler(MessageCreated, …)`), and the dispatcher never
resolves an event at all — it reads `event_type` and `groups` as plain strings
off the outbox row. Dropping the `groups` column introduces the first real
lookup in the system, `eventName → groups`, so the group definitions now have to
be reachable from somewhere.

**A platform-managed registry bean, with each context registering into it.**
This mirrors the seam already in the codebase and praised in
[01-current-state.md](../architecture/01-current-state.md):
[`attachment-access.service.ts`](../../apps/api/src/storage/attachment-access.service.ts)
exposes `register(resolver)`, and
[`message-attachment.resolver.ts`](../../apps/api/src/messaging/attachments/message-attachment.resolver.ts)
self-registers in `onModuleInit`.

```
platform/events/registry/consumer-group.registry.ts   the injectable — register(), groupsForEvent(), all(), byName()
<ctx>/contract/<ctx>.consumer-group.ts                defineConsumerGroup(...) — the definition
<ctx>/<ctx>.consumer-group.registration.ts            injects the registry, registers in onModuleInit
```

No central array to edit: a context that owns a group owns its registration, and
platform never imports a context. `register()` throws on a duplicate group name
or a duplicate event within a group.

Two alternatives were rejected. A **module-level map** that
`defineConsumerGroup` pushes into is populated only if the defining module
happens to be in the import graph, and nothing forces that — same failure class
as the decorator-scanning rejected above. An **explicit array inside
`platform/`** forces a bad choice: either the definitions live in their contexts
and platform imports them, inverting the tier boundary from
[ADR 0005](../architecture/adr/0005-kernel-and-platform-tiers.md), or they live
in platform and grow the central catalogue that
[04-layering.md](../architecture/04-layering.md) §240 wants dissolved.

#### Init order is the sharp edge

Nest orders `onModuleInit` bottom-up through the **import** graph. Sibling
feature modules have no guaranteed order relative to `EventsModule`, so anything
that _reads_ the registry must not run in `onModuleInit`.

The dispatcher currently does exactly that, and drains immediately:

```ts
async onModuleInit(): Promise<void> {
  await this.connectListen();
  this.startPollLoop();
  await this.tick();          // drains before registrations may have run
}
```

With a half-populated registry that resolves zero groups for real rows and marks
them dispatched. Silent loss on every boot race, and it would not reproduce
reliably. So:

| Runs in                  | What                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| `onModuleInit`           | each context's `register()` call — writes only                    |
| `onApplicationBootstrap` | dispatcher start, queue bootstrap, handler discovery — reads only |

Nest runs `onApplicationBootstrap` only after every module's `onModuleInit` has
resolved.
[`event-consumer.discovery.ts`](../../apps/api/src/platform/events/consumer/event-consumer.discovery.ts)
already uses it for this exact reason; the dispatcher and the queue bootstrap
must move to it.

#### Seal the registry

Once bootstrap has read it, `register()` throws. A late registration is a bug —
its groups would already have been skipped by queue creation and by any drain
that has run.
[`realtime-listener.service.ts`](../../apps/api/src/platform/events/consumer/realtime-listener.service.ts)
already does this: `subscribe()` throws when called after `start()`.

Log the resolved registry at boot — group, event count, key strategy. A static
array could be grepped in one file; a bean cannot, and one log line buys that
back.

#### `@EventHandler`'s `group` option stays — it is the lane discriminator

Two different things are called "groups", and only one of them is dropped.

|                                  | Dropped? | What it does                                  |
| -------------------------------- | -------- | --------------------------------------------- |
| `groups: [...]` on `defineEvent` | **yes**  | the producer naming its consumers             |
| `{ group }` on `@EventHandler`   | **no**   | which lane, and which group's handler this is |

A `Dual` event legitimately has handlers on both legs — `ws.gateway.ts` takes
`message.created` for the realtime push while `message-attention.handler.ts`
takes it for `attention-items`. The only thing telling them apart is whether the
decorator declares a group:

```ts
if ((delivery === Realtime || delivery === Dual) && options?.group === undefined) → realtime
if ((delivery === Durable  || delivery === Dual) && options?.group !== undefined) → durable
```

Remove the option and every `Dual` handler falls into the first branch, leaving
the durable branch unreachable — the durable leg of `message.created`,
`message.updated`, `message.status.changed`, `timer.lifecycle` and `tag.updated`
disappears with no error.

The option is not redundant with the registry. The registry answers _which
groups consume event E_; the decorator answers _which class implements group G's
handler for E_, which the registry cannot express. Nor can it be inferred:
`task.upserted` is consumed by both `attention-items` and `suggestion-sync`, so
a bare `@EventHandler(TaskUpserted)` would be ambiguous. It is also what makes
the reverse boot check below possible at all.

The decorator keeps one check, since it needs only `event.delivery`: a realtime
event must not declare a group. The "is this group declared on this event" check
is the one that moves to discovery.

> Considered and deferred: making the lane explicit with a class-level
> `@DurableConsumer("<group>")` plus a bare `@EventHandler(E)` on methods. Every
> handler class today is already single-lane and single-group, so it would map
> cleanly — but it touches every handler site for a readability win, and
> "absent means realtime" is survivable once written down.

#### Validation replaces the event's `groups` field

The event definitions **lose** `groups` rather than keeping it as a cross-check.
Keeping it would state the same fact in three places:

1. event def — `groups: ["attention-items"]`
2. registry — `events: [MessageCreated, …]`
3. handler — `@EventHandler(MessageCreated, AttentionItemsConsumerGroup)`

Only (1) goes. (3) stays — see above; it is the lane discriminator, and it names
the implementing class rather than restating the subscription.

(1) and (2) are the same information in opposite directions, and (1) re-couples
producer to consumer, which is the coupling this change exists to remove. It is
also the shape that produced the `email` defect in the first place: an event
named a group nobody consumed, so the dispatcher built a queue and filled it
with jobs nothing works.

Both useful checks run off (2) and (3) alone, at `onApplicationBootstrap`:

- every group named by an `@EventHandler` is registered — catches typos and
  missing registrations
- every registered `(group, event)` has a handler — catches the `email` case
  directly, at boot instead of by inspection

#### The completeness constraint

The dispatcher's map is only as complete as the set of context modules loaded in
its process. That is fine today — `apps/` holds `api` and `migrations` only, and
one process loads everything.

If a worker app ever appears and hosts some handlers, the API's dispatcher will
stop creating jobs for those groups, silently, because its registry will not
contain them. **Whatever process runs the dispatcher must load every context
module.** CLAUDE.md already references an `apps/background-worker` that does not
exist yet, so this is worth stating rather than assuming.

> **Knock-on.** [05-integration.md](../architecture/05-integration.md) §4
> justifies splitting the event catalogue per context on the grounds that
> "neither runtime component needs the central file: the dispatcher works off
> database rows". That stops being true the moment `groups` is dropped — the
> dispatcher now works off the registry. The catalogue can still split per
> context; what the dispatcher needs is the _consumer-group_ map, assembled at
> runtime from each context's registration. The sentence needs amending, not
> deleting.

### Job ids are load-bearing

Because `created_on` ties across a batch (break C), `id` **is** the sort key.

Without fan-out, `id: <outbox row id>` would be enough — free ordering plus
dedupe on the `(name, id)` primary key. **Fan-out makes that insufficient:** one
outbox row produces N jobs in one queue, and reusing the row id collides on the
primary key, where `ON CONFLICT DO NOTHING` swallows it silently.

So the drain allocates ids from Postgres in row order:

```sql
SELECT uuidv7() FROM generate_series(1, $n)
```

Only _cross-row_ order matters — jobs from the same outbox row always carry
different keys, so their relative order is irrelevant by construction.

Do not reach for `orderByCreatedOn: false` instead. It works in 12.18.2 but is
deprecated and ignored from 12.30.0.

### Exactly-once dispatch

Today `insertJobs` runs on pg-boss's own pool, outside the drizzle transaction —
a crash between the insert and the `dispatchedAt` update duplicates events.
`insert()` accepts a `db` option and pg-boss ships a drizzle adapter:

```ts
await this.bus.insertJobs(jobs, { db: fromDrizzle(tx, sql) });
```

Queue creation moves to bootstrap: `createQueue` wraps itself in its own
`BEGIN/COMMIT` and cannot join the caller's transaction.

Bootstrap must also **verify** the policy, not merely call `createQueue`. The
call is a silent no-op when the queue already exists, and policy is immutable —
so a queue created before this change keeps `standard` forever and enforces
nothing, with no error raised anywhere. Read the policy back and fail startup on
a mismatch.

### Single-writer drain

Wrap the drain in `pg_try_advisory_xact_lock`; a node that fails to acquire
skips the tick. The lock releases on commit, so any node can take the next batch
— whoever holds it always takes the oldest undispatched rows, so order holds
regardless of which node wins. Order the drain by `id`, and add a partial index
for it.

### Auto-unblock without pg-boss's dead-letter queue

pg-boss's DLQ _copies_ the payload into the dead-letter queue and **leaves the
original row in `failed` state** in the source queue. Since `failed` is in the
`job_i8` predicate, the key stays blocked; the row is only removed by the
deletion sweep, whose default `deletion_seconds` is **seven days**.

So skip it:

```ts
catch (error) {
  if (job.retryCount >= job.retryLimit) {
    await this.deadLetters.record({ group, eventType, eventId, payload, error });
    return;                 // completes the job → key unblocks now
  }
  throw error;              // let pg-boss retry, key stays blocked
}
```

The `throw` branch matters as much as the other one. Swallowing the _first_
error would drop an event on any transient blip; only the terminal attempt
dead-letters.

**Silent toward pg-boss, loud in logs.** The row never reaches `failed`, so it
never blocks the key — but that also means no `failed` rows, no pg-boss error
event, and an empty `getBlockedKeys`. Every health signal reads clean while
events are being dropped. Log at error and count it.

One table serves every group. Store the outbox row id beside the payload so a
gap can be located in the outbox afterwards, and put a unique index on
`(event_id, group)`: write the dead-letter row _before_ returning, so a crash in
between yields a duplicate row rather than a lost event, and the index absorbs it.

### Replay

Replay **must allocate a fresh job id.** The original job carried the outbox row
id and is now `completed`; re-inserting under that id hits `ON CONFLICT DO
NOTHING` on `(name, id)` and silently does nothing.

The dead-letter row carries a `status` (`pending` | `replayed` | `discarded`),
so replay is a state transition rather than an action endpoint, per the
project's no-verb-endpoints rule:

```
PATCH /event-dead-letters/:id  { "status": "replayed" }
```

## 6. What this costs

**Per-key serialization caps per-key throughput.** A user's events in a group
process one at a time cluster-wide. The ceiling is 1 ÷ handler latency _per
user_, not globally — parallelism across users is unaffected.

**Fan-out multiplies job volume.** A message in a thread with N user
participants becomes N jobs in `attention-items`. Threads are small, so this is
a constant factor, but it is a real one.

**A terminal failure skips an event.** Auto-unblock is availability chosen over
strict FIFO: subsequent events for that user proceed past a gap. The dead-letter
row is the only record the gap exists, and replaying it re-orders it by
definition.

**Contended polls fetch nothing.** When a key is already active, the node that
loses hits the unique violation and gets an empty batch — including the
unrelated keys in that batch. Keep `batchSize: 1`.

**Retries block their key.** With an explicit `retryLimit`, a failing event
holds its user's stream for the full retry sequence before dead-lettering.
