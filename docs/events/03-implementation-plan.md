# Implementation status

Tracks the ordering work against [01-ordering-design.md](01-ordering-design.md).
The original phased plan assumed a platform consumer-group registry and
in-queue fan-out; neither was built — see 01 §5 and
[02-consumer-groups.md](02-consumer-groups.md#fan-out-happens-at-the-producer).

## Done — part 1 (`1c3f518`)

- **Queue per group.** `EventHandlersRegistry` (`platform/events/decorators/`)
  discovers `@EventHandler(Event, Group)` at `onApplicationBootstrap` and ensures
  one queue per group. Job data is `{ eventId, eventType, payload }`; the
  runtime dispatches on `eventType`.
- **Groups as context-owned consts.** Five `<ctx>/<ctx>.consumer-group.ts`
  files; `ConsumerGroup<E>` in `platform/events/registry/events.types.ts`.
- **`groups` dropped** from `defineEvent` and from `events_outbox`
  (migration `0004`). The orphan `email` group went with it.
- **Producer payloads** carry every field the keys need, and message events fan
  out per recipient at the producer. `task.batch.deleted` gained
  `assigneeUserId` after the commit.
- **Dispatcher** (`platform/events/dispatcher/events-dispatcher.ts`):
  - starts in `onApplicationBootstrap`
  - `pg_try_advisory_xact_lock` single-writer drain, ordered by `id`
  - drains only event types with a durable handler in this process
  - job id = outbox row id; `singletonKey` = `group.orderingKeyFn(payload)`
  - `insertJobs(jobs, fromDrizzleTx(tx))` — enqueue joins the drain tx
- **Outbox `NOTIFY`** narrowed to `durable` / `dual` rows (migration `0005`).
- **Queues are `key_strict_fifo`.**

## Done — part 2 (retries and dead letters)

- **pg-boss `^12.34.0`** — per-key blocking instead of a queue-wide stall
  (01 §3).
- **`DURABLE_GROUP_QUEUE_OPTIONS`**
  (`platform/events/consumer/durable-delivery.constants.ts`):
  `key_strict_fifo`, `retryLimit: MAX_ATTEMPTS` (3), backoff 2s → 30s cap,
  `expireInSeconds: 120`.
- **`MessageBusService.ensureQueue(queue, opts)`** — creates, applies the
  non-policy options to an existing queue via `updateQueue`, verifies the policy
  and fails startup on a mismatch.
- **`events_dead_letters`** table (migration `0006`) and
  `EventsDeadLettersRepository` (`platform/events/dead-letters/`).
- **Runtime** (`durable-consumer-runtime.service.ts`): lookup, parse and handler
  inside the `try`; rethrow before the terminal attempt; dead-letter and
  complete on it; a sentinel attempt dead-letters jobs whose terminal attempt
  expired or whose worker died.
- **Tests:** `test/events/durable-consumer-runtime.unit.test.ts`,
  `test/events/dead-letters.integration.test.ts`.

## Remaining

| Item                             | Notes                                                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outbox drain partial index       | On `id` where `dispatched_at is null and failed_at is null`. Only `idx_events_outbox_event_type` exists; the drain will seq-scan as the table grows. |
| Outbox retention job             | Realtime rows never get `dispatched_at`; prune by age.                                                                                               |
| Dead-letter replay               | `PATCH /event-dead-letters/:id { status }`, re-enqueue with a **fresh** job id. Needs an authorization model first.                                  |
| Consumer idempotency / inbox     | `TODO` in the runtime. Retries, expiry overlap and replay all re-deliver.                                                                            |
| Key prefix consistency           | `calendar-sync` and `messaging` use bare ids, `suggestion-sync` uses `assignee:`.                                                                    |
| Guest-recipient jobs             | `attention-items` enqueues jobs for guest recipients that its handler ignores.                                                                       |
| Realtime thread-room duplication | Per-recipient publish makes the gateway emit to the thread room N times per message, and not at all when the sender is alone.                        |

## Deploy

Queue names changed, and policy is immutable. `ensureQueue` fails startup if a
group queue exists with the wrong policy, so before the first deploy:

```sql
-- old `<eventType>.<group>` queues, and any group queue created as `standard`.
-- Do NOT match on '%.%': timer.completion, calendar.sync and calendar.sync.poll
-- are live job queues.
select pgboss.delete_queue(name) from pgboss.queue
where name ~ '\.(attention-items|suggestion-sync|calendar-sync|messaging|timer-event-log|email)$'
   or (name in ('attention-items','suggestion-sync','calendar-sync','messaging','timer-event-log')
       and policy <> 'key_strict_fifo');
```

Let the old queues drain first — anything still queued in them is stranded,
since nothing binds a worker to those names any more.
