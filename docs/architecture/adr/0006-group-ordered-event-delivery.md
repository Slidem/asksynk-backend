# ADR 0006 — Group-ordered durable event delivery

**Status:** Accepted (2026-09-25) · built
**Reference:** [platform/events](../../platform/events.md)

## Context

Consumers (attention above all) assume events arrive in order. The original pipeline
didn't guarantee it: one queue per `eventType.group` split a message's created/updated
across queues; `singletonKey` on a `standard` queue is inert; concurrent drains and
batch inserts with one `created_on` reordered jobs; a retried job was overtaken by its
successor. Events also named their consumers (`groups` on `defineEvent`), allowing a
handler-less `email` group to exist.

## Options

- **A. `singleton` / `stately` policies** — drop inserts, or don't block on `retry`.
- **B. `group` + `groupConcurrency`** — advisory, an unlocked count.
- **C. `key_strict_fifo`, one queue per consumer group _(chosen)_** — partial unique
  index on `(name, singleton_key)` over `active | retry | failed`: Postgres enforces
  one in-flight job per key, across retries and nodes.

## Decision

1. One `key_strict_fifo` queue per consumer group; the event type travels in the job.
2. The ordering key belongs to the group: a `ConsumerGroup` const owned by the
   consuming context, passed to `@EventHandler(Event, Group)`.
3. Events don't name consumers.
4. Groups are discovered from handlers at bootstrap; the dispatcher drains only event
   types with a durable handler in its process (partial map → rows wait, not lost).
   Platform imports no context.
5. Fan-out at the producer: one row per recipient, so the outbox id is the job id.
6. Single-writer drain (advisory lock), ordered by uuidv7 `id`, enqueue in the drain tx.
7. pg-boss ≥ 12.34.0 (earlier versions stall the whole queue on one blocked key).
8. Terminal failure → our own `events_dead_letters` row, and the job **completes**.
   The runtime owns retries (3 attempts, backoff); pg-boss gets one extra attempt so
   an expired/killed terminal attempt is still dead-lettered. pg-boss never marks a
   group job `failed` (that would block the key). Replay via an admin API.

Rejected: a platform group-registry bean (registration + init-order for no gain);
fan-out in the dispatcher (non-outbox job ids, list-valued keys); pg-boss
`deadLetter` (leaves the original `failed`, blocking the key); relying on
`deleteAfterSeconds` to clear `failed` (undocumented, slow); blocking the key until
manual intervention (one poison event stops a user's stream).

## Consequences

- **+** Per-key order enforced by Postgres; a poison event costs its key seconds.
- **+** Producers don't know consumers; orphan groups can't exist.
- **−** One in-flight handler per key per group.
- **−** A dead letter is a gap in its key's order; replay re-orders it.
- **−** Per-recipient publish multiplies outbox rows and realtime deliveries.
- **−** The dispatcher's process must load every context with a durable handler.
- **−** Expired attempts aren't cancelled — handlers must be idempotent.

## Verification

`test/events/durable-consumer-runtime.unit.test.ts`,
`test/events/dead-letters.integration.test.ts`,
`test/events/dead-letters-admin.integration.test.ts`; startup fails if a group queue
has a policy other than `key_strict_fifo`.
