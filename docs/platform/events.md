# Events (as built)

Transactional outbox → pg-boss, with a durable leg (ordered per key, retried,
dead-lettered) and a realtime leg (best-effort fan-out to every node).
Decision record: [ADR 0006](../architecture/adr/0006-group-ordered-event-delivery.md).
Code: `apps/api/src/platform/events/`. Requires **pg-boss ≥ 12.34.0**.

## Publishing

```ts
await this.events.publish(TaskUpserted, payload); // EventsPublisher (abstract) → EventsPublisherImpl
```

`publish` is `@Transactional()`: it joins the caller's tx, `schema.parse`s the
payload and inserts into `events_outbox`. Nothing else — no notify, no enqueue.
**Fan out at the producer:** an event concerning N users is published N times (e.g.
`message.created` once per recipient with `sentToUserId` / `sentToGuestId`), so one
outbox row is at most one job per group.

## Defining events

`defineEvent({ name, schema, delivery })` (`registry/events.registration.ts`); names
are dotted lowercase. All 20 events live in `registry/events.registry.ts` (moves per
context in Wave 8.1).

| Delivery | Events                                                                                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dual     | `tag.updated`, `message.created`, `message.updated`, `message.status.changed`, `timer.lifecycle`                                                                                                             |
| Durable  | `tag.deleted`, `attention.message.synced`, `calendar.event.{created,updated,deleted}`, `task.{upserted,deleted}`, `task.batch.{upserted,deleted}`, `task.suggestion.{created,resolved,updated}` |
| Realtime | `attention.upserted`, `attention.removed`, `task.suggestion.broadcast`                                                                                                                                       |

## Handling events

```ts
// <ctx>/<ctx>.consumer-group.ts — owned by the consuming context
export const CalendarSyncConsumerGroup: ConsumerGroup<
  typeof CalendarEventCreated | typeof CalendarEventUpdated | typeof CalendarEventDeleted
> = { name: "calendar-sync", orderingKeyFn: (e) => e.userId };

@EventHandler(CalendarEventCreated, CalendarSyncConsumerGroup)   // durable
async onCreated(payload: EventOf<typeof CalendarEventCreated>, ctx: { eventId; attempt }) {}

@EventHandler(MessageCreated)                                    // no group → realtime
```

A group arg selects the leg: no group → realtime listener; group → durable runtime. A
group on a realtime-only event throws. Groups are discovered from handlers at
bootstrap (`EventHandlersRegistry`); there is no registration step.

### Consumer groups

| Group             | File                                                    | Ordering key                                                                                      | Handles                                                                 |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `attention-items` | `attention-items/attention-items.consumer-group.ts`     | `user:` + first of `sentToUserId`, `sentToGuestId`, `assigneeUserId`, `suggesteeUserId`, `userId`; else `user:unknown` (a bug if reached) | `task.*`, `task.batch.*`, `task.suggestion.*` (task-attention), `message.*` (message-attention), `calendar.event.*`, `tag.*` (tag-calendar-attention) — 15 events |
| `suggestion-sync` | `tasks/suggestion-sync.consumer-group.ts`               | `assignee:<assigneeUserId>`                                                                        | `task.upserted`, `task.batch.upserted` (task-suggestions.service)        |
| `calendar-sync`   | `calendar-integrations/calendar-sync.consumer-group.ts` | `<userId>`                                                                                         | `calendar.event.*` (calendar-sync.event-handler)                        |
| `messaging`       | `messaging/messaging.consumer-group.ts`                 | `<messageId>`                                                                                      | `attention.message.synced`                                              |
| `timer-event-log` | `timers/timer-event-log.consumer-group.ts`              | `user:<userId>`                                                                                    | `timer.lifecycle`                                                       |

Realtime handlers all live in `websockets/ws.gateway.ts` (7; moves per context in Wave 4).

### Rules when adding an event or handler

1. **The key function must be total.** A null key fails the INSERT for the whole
   dispatch batch. No natural key → use the event's own id.
2. Ordering exists only between events producing the same key **in the same group**.
3. Adding an event to a group is a queue-wide decision — the key contract is shared.
4. One `ConsumerGroup` const per group (two objects with one name throw at bootstrap);
   one handler per `(group, event)`.
5. **An event is drained only if this process has a durable handler for it.** Rows
   without one stay in the outbox. Whatever process runs the dispatcher must load
   every context with a durable handler (today: the single API process).
6. **Handlers must be idempotent** — retries, expiry overlap and replay all re-deliver.
7. Two groups are two queues: they neither block nor order against each other.
   Don't share a group between consumers that both need every event.

## Delivery internals

**Outbox** (`events_outbox`): `id` uuidv7, `event_type`, `delivery_mode`
(`realtime | durable | dual`), `payload`, `dispatched_at`, `failed_at`, `error`,
`created_at`. Partial index `idx_events_outbox_pending` matches the drain. Triggers:
`pg_notify('evt:<type>', id)` for realtime/dual; `pg_notify('outbox_new')` for
durable/dual.

**Dispatcher** (`dispatcher/events-dispatcher.ts`): wakes on `LISTEN outbox_new`, a
500 ms poll, and once at bootstrap. Each drain is one tx that takes
`pg_try_advisory_xact_lock(hashtext('events_outbox_dispatcher'))` (single writer;
others skip), selects pending durable/dual rows of handled types ordered by `id`,
`LIMIT 100 FOR UPDATE SKIP LOCKED`, and inserts one job per group with
`id = outbox id`, `singletonKey = orderingKeyFn(payload)`, data
`{ eventId, eventType, payload }` — via `insertJobs(jobs, fromDrizzleTx(tx))`, in the
same tx that sets `dispatched_at`. A throwing key fn marks the row `failed_at`.
`fromDrizzleTx` exists because pg-boss's `fromDrizzle` spreads array params.

**Queues**: one per group, `DURABLE_GROUP_QUEUE_OPTIONS`
(`consumer/durable-delivery.constants.ts`): `key_strict_fifo`, `retryLimit: 3`,
backoff 2 s → 30 s, `expireInSeconds: 120`. `ensureQueue` fails startup if an
existing queue has a different policy (policy is immutable).

Why `key_strict_fifo`: it is the only pg-boss policy backed by a unique index
(`(name, singleton_key)` over `active | retry | failed`), so Postgres enforces one
in-flight job per key across nodes and retries. `singleton`/`stately` drop inserts or
reorder retries; `group` + `groupConcurrency` is advisory. Before 12.34, one blocked
key stalled the whole queue.

**Durable runtime** (`consumer/durable-consumer-runtime.service.ts`): re-parses the
payload, calls the handler with `attempt = retryCount + 1`. Below attempt 3 it
rethrows (pg-boss retries; key stays blocked). On attempt 3 it writes a dead letter
and **completes** the job, unblocking the key. pg-boss gets one extra attempt that
only runs if the terminal attempt expired or the worker died; the runtime then
dead-letters without calling the handler. **Invariant: pg-boss never marks a group
job `failed`** — `failed` would block the key.

**Realtime leg** (`consumer/realtime-listener.service.ts`): `LISTEN "evt:<name>"`,
re-reads the row by id (notify carries only the id — 8 KB limit), fans out to local
handlers with `Promise.allSettled`. Best-effort, every node, errors only logged.

## Dead letters

`events_dead_letters`: `consumer_group`, `event_id` (no FK), `event_type`, `payload`,
`error`, `attempts`, `status` (`pending | replayed | discarded`), `replay_count`,
timestamps. Unique `(event_id, consumer_group)`; `record()` upserts back to
`pending`, so a replayed event that fails again reappears.

Admin API (`events/rest/event-dead-letters.admin.controller.ts`), `@AdminApi()`:
header `x-admin-api-key` must equal `ADMIN_API_KEY` (≥ 32 chars; unset → 401, fails
closed). Hidden from Swagger.

```
GET   /admin/events/dead-letters?status=pending&consumerGroup=&eventType=&from=&to=&cursor=&limit=
PATCH /admin/events/dead-letters/:id   { "status": "replayed" | "discarded" }            # 404 / 409 / 422
PATCH /admin/events/dead-letters       { "status": …, "ids": [...] }                      # ≤ 500
PATCH /admin/events/dead-letters       { "status": …, "filter": {…}, "limit": n }         # pending only, ≤ 500
```

```sh
curl -H "x-admin-api-key: $ADMIN_API_KEY" "$API/admin/events/dead-letters?consumerGroup=attention-items"
curl -X PATCH -H "x-admin-api-key: $ADMIN_API_KEY" -H 'content-type: application/json' \
  -d '{"status":"replayed","filter":{"consumerGroup":"attention-items"}}' "$API/admin/events/dead-letters"
```

Replay inserts a job with a **fresh id** (the original id still exists as
`completed`) into the row's group queue with a recomputed key, oldest first, and flips
the row to `replayed` in the same tx. Rows with an unknown group or a throwing key are
skipped (bulk) or 422 (single).

## Retention

`events.retention` `@CronJob` (`retention/events-retention.job-handler.ts`), daily
03:00 UTC, batches of 1000: deletes outbox rows older than 30 days that are realtime,
dispatched or failed (never undispatched durable rows), and `replayed` / `discarded`
dead letters 30 days after `updated_at`. `pending` dead letters are kept.

## Costs (accepted)

- Per-key throughput is one in-flight handler per group.
- A dead-lettered event is a gap in its key's order; replay re-orders it.
- Fan-out multiplies outbox rows and realtime deliveries by recipients.
- A failing event holds its key for the retry sequence (seconds; up to 2×120 s if
  attempts expire). Other keys keep flowing.
- An expired attempt isn't cancelled — a handler can overlap its own retry.

## Known gaps

| Gap                              | Notes                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| No consumer inbox / dedup        | `TODO` in the runtime; handlers must be idempotent on their own                           |
| Key prefixes inconsistent        | `calendar-sync`, `messaging` use bare ids. Harmless (keys only matter within a queue)     |
| Guest-recipient jobs             | `attention-items` enqueues `message.*` for guest recipients; the handler ignores them     |
| Thread-room duplicates           | Per-recipient publish → gateway emits to the thread room N times; none if sender is alone |
| `tag.updated` is Dual            | No realtime handler exists                                                                |
| Stale comment                    | `MessageBusService.insertJobs` claims it ensures queues; queues are ensured at bootstrap  |
