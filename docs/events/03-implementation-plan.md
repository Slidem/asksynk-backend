# Implementation plan

One PR. Phases are ordered by dependency and each one compiles on its own, so
they make reasonable review commits.

## Phase 0 — verify (blocking, run by hand)

```sql
-- Without job_i8, key_strict_fifo is accepted and enforces nothing.
select indexname from pg_indexes
where schemaname = 'pgboss' and indexname = 'job_i8';

-- Pre-cutover queue inventory.
select name, policy from pgboss.queue order by name;
```

`job_i8` is created by a pg-boss background migration that builds it
`CONCURRENTLY`, so it can lag `boss.start()`.

## Phase 1 — consumer-group registry

See [01-ordering-design.md](01-ordering-design.md) §5 "Registration and wiring"
for the init-order rules this phase has to respect.

New, in `apps/api/src/platform/events/registry/` — the port only, no group
definitions:

- `consumer-groups.types.ts` — `OrderingKeyFn = (eventName, payload) => string | string[]`;
  `ConsumerGroupDef { name, events, ordering }`
- `consumer-groups.registration.ts` — `defineConsumerGroup()`; validates name
  shape, non-empty events, no duplicate events, every event `durable` or `dual`
- `consumer-group.registry.ts` — the injectable. `register(def)` throws on a
  duplicate group name or a duplicate event within a group, and throws outright
  once sealed. Builds `Map<eventName, ConsumerGroupDef[]>`; exposes
  `groupsForEvent()`, `all()`, `byName()`, `seal()`.

New, two files per context — the five groups from
[02-consumer-groups.md](02-consumer-groups.md):

| Context                 | Definition                                   | Registration                                     |
| ----------------------- | -------------------------------------------- | ------------------------------------------------ |
| `attention-items`       | `contract/attention-items.consumer-group.ts` | `attention-items.consumer-group.registration.ts` |
| `tasks`                 | `contract/suggestion-sync.consumer-group.ts` | `suggestion-sync.consumer-group.registration.ts` |
| `calendar-integrations` | `contract/calendar-sync.consumer-group.ts`   | `calendar-sync.consumer-group.registration.ts`   |
| `messaging`             | `contract/messaging.consumer-group.ts`       | `messaging.consumer-group.registration.ts`       |
| `timers`                | `contract/timer-event-log.consumer-group.ts` | `timer-event-log.consumer-group.registration.ts` |

Each registration provider injects the registry and calls `register()` in
`onModuleInit` — the same shape as
[`message-attachment.resolver.ts`](../../apps/api/src/messaging/attachments/message-attachment.resolver.ts).
No central array; the context's own module provides it.

Lifecycle moves — this is the part that silently breaks if skipped:

- `events-dispatcher.ts` — `onModuleInit` → `onApplicationBootstrap`. It
  currently calls `await this.tick()` during init and would drain against a
  half-populated registry.
- message-bus queue bootstrap — `onApplicationBootstrap`, after `seal()`
- `event-consumer.discovery.ts` — already `onApplicationBootstrap`; add the two
  cross-checks (every handler group registered; every registered `(group, event)`
  has a handler) and the resolved-registry log line

Changed:

- `events.types.ts` — drop `groups` from `EventDef`
- `events.registration.ts` — drop the group overloads and their validation; the
  three `defineEvent` overloads collapse to two (realtime vs durable/dual)
- `events.registry.ts` — remove `groups: [...]` from every definition, which
  also removes the orphan `email` group
- `event-consumer.decorator.ts` — **keep `group` on `EventHandlerOptions`.** It
  is the realtime/durable lane discriminator, not a restatement of the registry;
  removing it makes every `Dual` handler bind realtime and leaves the durable
  branch of discovery unreachable. Keep the realtime-must-not-declare-a-group
  check too — it needs only `event.delivery`. Only the "is this group declared on
  this event" check moves to discovery, against the registry.

## Phase 2 — producer payload changes

The six call sites in [02-consumer-groups.md](02-consumer-groups.md#producer-changes),
plus the matching schema additions in `events.registry.ts`:

| Event                      | Field                |
| -------------------------- | -------------------- |
| `task.deleted`             | `assigneeUserId`     |
| `task.batch.deleted`       | `assigneeUserId`     |
| `task.suggestion.resolved` | `suggesteeUserId`    |
| `task.suggestion.updated`  | `suggesteeUserId`    |
| `message.status.changed`   | `participantUserIds` |
| `attention.message.synced` | `threadId`           |

After this phase every group's key function is total.

## Phase 3 — schema

- `outbox.ts` — drop `groups`; add a partial index on `id` where
  `dispatched_at is null and failed_at is null`
- New `events-dead-letter.ts` — `id`, `group`, `event_type`, `event_id` (outbox
  row id), `payload`, `error`, `attempts`, `status`
  (`pending` | `replayed` | `discarded`), `created_at`; unique on
  `(event_id, group)`
- Custom migration: narrow `notify_all_new` to `delivery_mode in ('durable','dual')`.
  `notify_realtime` already covers the realtime leg, so the dispatcher is
  currently woken for rows it will never drain.
- `drizzle-kit generate`, then the migration is run by hand

## Phase 4 — dispatcher and bus

`events-dispatcher.ts`:

- `pg_try_advisory_xact_lock(<const>)` at the top of the drain tx; bail on `false`
- order by `id` instead of `createdAt`
- resolve groups via `groupsForEvent(row.eventType)` instead of splitting the
  dropped column
- per group, call the ordering strategy; normalise `string | string[]` to a list
  and emit one job per key
- allocate job ids with `SELECT uuidv7() FROM generate_series(1, $n)` in the same
  tx, assigned in row order — the outbox row id no longer works as the job id
  once one row can produce several jobs
- job shape `{ id, singletonKey, data: { eventId, eventType, payload } }`
- `insertJobs(jobs, { db: fromDrizzle(tx, sql) })`

`message-bus.service.ts`:

- `insertJobs(jobs, opts?)` forwards `db`
- bootstrap: `createQueue(group, { policy: 'key_strict_fifo', retryLimit })` per
  registered group, then read `pgboss.queue.policy` back and throw on mismatch
- drop `ensureQueue` from the insert path

## Phase 5 — consumer runtime and dead letters

- `durable-consumer-runtime.service.ts` — `bind(group, handlersByEventName)`;
  one `work()` per group; dispatch on `data.eventType`; terminal-attempt
  dead-letter branch (`job.retryCount >= job.retryLimit` → record and return)
- `event-consumer.discovery.ts` — accumulate per-group handler maps, bind once
  per group after discovery completes
- `event-consumer.types.ts` — drop `concurrency` from `EventHandlerOptions` and
  nothing else; `group` stays (Phase 1)
- New dead-letter repository + service (the runtime must not touch the DB
  directly)
- `PATCH /event-dead-letters/:id` with `{ status: "replayed" }` — re-enqueues
  onto the group's queue **with a fresh uuid**, since the original job id is
  already `completed` and would be swallowed by `ON CONFLICT DO NOTHING`
- `OutboxRetentionJob` — prune by age; realtime rows never get `dispatchedAt`
  so age is the only workable criterion

## Phase 6 — documentation

`docs/architecture/`:

- `01-current-state.md` — the "A real transactional outbox" section still
  describes queues named `${eventType}.${group}`. §4.9 loses three entries: the
  orphan `email` group, the missing `dispatched_at` / `failed_at` index, and the
  `tag.created` dead contract (that event no longer exists — the entry is
  already stale).
- `04-layering.md` — the `platform/events/` folder map, and the line asserting
  only the `defineEvent` machinery is platform
- `05-integration.md` — mechanism table row (b) becomes `defineEvent` +
  `defineConsumerGroup` + `@EventHandler`; the "only the registry file is split"
  assessment changes. §4 also claims "neither runtime component needs the central
  file: the dispatcher works off database rows" — false once `groups` is dropped.
  The event catalogue can still split per context, but the consumer-group list is
  now assembled at the composition root; amend rather than delete.
- `adr/0005-kernel-and-platform-tiers.md` — worth a cross-reference: the
  consumer-group registry is the case that fixes the tier boundary in place
  (platform holds the port, contexts hold the definitions, the composition root
  joins them) rather than bending it
- New `adr/0006-group-ordered-event-delivery.md` — the decision, the rejected
  alternatives (`singleton` policy, per-aggregate keys, total order per group),
  and the consequences

`docs/events/` — reconcile with what actually shipped.

## Deploy

Queue names change, so the new queues are created fresh with the right policy,
sidestepping pg-boss's rule that policy is immutable. Let the old
`eventType.group` queues drain before cutover, then delete them — anything still
queued is stranded, since nothing will bind a worker to those names again.
