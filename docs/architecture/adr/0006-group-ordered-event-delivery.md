# ADR 0006 — Group-ordered durable event delivery

**Status:** Accepted
**Date:** 2026-09-25
**Deciders:** Mihai Alexandru
**Detail:** [docs/events](../../events/README.md) — the design, the pg-boss
analysis and the implementation status

---

## Context

Durable events go from `events_outbox` into pg-boss, drained by a dispatcher.
Consumers assume their events arrive in order: attention items are created,
updated and resolved from a stream of `task.*`, `message.*`, `tag.*` and
`calendar.event.*` events, and applying them out of order leaves wrong state.

That order was not guaranteed. In the original pipeline
([docs/events 01 §2](../../events/01-ordering-design.md)):

- queues were named `${eventType}.${group}`, so `message.created` and
  `message.updated` for the same message sat on different queues
- the `singletonKey` was unique per job and backed by no index on a `standard`
  queue — inert
- concurrent drains committed out of order, and one batch insert gave every job
  the same `created_on`, making in-batch order random
- a retried job was overtaken by its successor

Events also named their consumers (`groups: [...]` on `defineEvent`), which
coupled producers to consumers and let the handler-less `email` group exist.

## Options considered

### A. `singleton` / `stately` queue policies

Serialize per key, but do not block on the `retry` state, so a retry still
reorders. `short` / `stately` drop inserts outright.

### B. pg-boss `group` + `groupConcurrency`

Advisory only — an unlocked count; two concurrent fetches can both proceed.

### C. `key_strict_fifo`, one queue per consumer group _(chosen)_

A partial unique index on `(name, singleton_key)` over `active`, `retry`,
`failed`: Postgres enforces one in-flight job per key, across retries and nodes.

## Decision

1. **One `key_strict_fifo` queue per consumer group.** The event type travels in
   the job payload; the runtime dispatches on it.
2. **The ordering key belongs to the group.** A `ConsumerGroup` const
   (`name` + `orderingKeyFn`) is owned by the consuming context
   (`<ctx>/<ctx>.consumer-group.ts`) and passed to `@EventHandler(Event, Group)`.
   Almost every group keys on the user.
3. **Events do not name consumers.** `groups` is removed from `defineEvent` and
   from the outbox.
4. **Groups are discovered from handlers.** `EventHandlersRegistry`
   (`platform/events/decorators/`) scans `@EventHandler` metadata at
   `onApplicationBootstrap`. The dispatcher only drains event types that have a
   durable handler in its process, so a partial map leaves rows in the outbox
   instead of losing them. Platform never imports a context, as
   [ADR 0005](0005-kernel-and-platform-tiers.md) requires.
5. **Fan-out at the producer.** An event concerning several users is published
   once per recipient, so one outbox row is at most one job per group and the
   outbox row id is the job id.
6. **Single-writer, transactional drain.** An advisory lock around the drain,
   rows ordered by uuidv7 `id`, and the pg-boss insert joins the drain
   transaction.
7. **pg-boss ≥ 12.34.0.** Earlier strict-FIFO fetches abort on a blocked head
   job, stalling the whole queue; 12.34 skips blocked keys.
8. **Terminal failures go to our own `events_dead_letters` table, and the job
   completes.** The runtime owns the retry count (`MAX_ATTEMPTS = 3`, backoff),
   and pg-boss gets one extra attempt so that a terminal attempt lost to expiry
   or a dead worker is still dead-lettered. pg-boss never marks a group job
   `failed`.

### Rejected

- **A platform consumer-group registry bean** that each context registers into.
  It needs registration providers and init-order rules for no benefit once the
  drain filters by handled types.
- **Fan-out inside the dispatcher** (one key list per event). It needs job ids
  that are not the outbox id and a key function returning lists; publishing per
  recipient is simpler.
- **pg-boss's `deadLetter` queue.** It copies the job but leaves the original
  `failed`, and `failed` blocks the key.
- **Relying on `deleteAfterSeconds` to clear `failed` rows.** Documented for
  completed jobs only; works in 12.34 by implementation detail, and still leaves
  the key blocked for minutes.
- **Block the key until someone intervenes** (true strict FIFO). One poison
  event would stop a user's attention stream indefinitely.

## Consequences

### Positive

- Events for one key in one group are applied in order, enforced by Postgres,
  across nodes and retries.
- A poison event costs its key a few seconds of backoff, then the stream moves on.
- Producers no longer know their consumers; adding a consumer touches only the
  consumer's context.
- Orphan groups cannot exist.

### Negative

- Per-key throughput is capped at one in-flight handler per group.
- A dead-lettered event is a gap in its key's order; replaying it re-orders it.
- Per-recipient publish multiplies outbox rows and realtime deliveries by the
  number of recipients.
- The process that runs the dispatcher must load every context with a durable
  handler.
- Expired attempts are not cancelled, so a handler can overlap with its own
  retry. Handlers must be idempotent (already required by the outbox).

### Neutral

- Replay is not built yet; the dead-letter `status` column is there for it.
- Key prefixes differ between groups; keys only need to agree within one queue.

## Verification

- `test/events/durable-consumer-runtime.unit.test.ts` — retry, terminal and
  abandoned-attempt branches.
- `test/events/dead-letters.integration.test.ts` — a poison event is
  dead-lettered after `MAX_ATTEMPTS`, and the next event with the same key is
  then processed.
- Startup fails if a group queue exists with a policy other than
  `key_strict_fifo`.

## References

- [docs/events/01-ordering-design.md](../../events/01-ordering-design.md)
- [docs/events/02-consumer-groups.md](../../events/02-consumer-groups.md)
- [05-integration.md §4](../05-integration.md)
- pg-boss 12.34.0 `dist/plans.js` — `fetchNextJob` (`strict_fifo_heads`),
  `failJobsBody`, `deletion`
