# Event delivery ordering

Workstream docs for making the outbox → pg-boss pipeline deliver durable events
in a defined order per consumer group.

**Status:** partially built. Part 1 (`1c3f518`) shipped queue-per-group,
ordering keys, the single-writer drain and transactional enqueue. Part 2 adds
retries and the dead-letter table. See
[03-implementation-plan.md](03-implementation-plan.md) for what is left.

The decision record is
[ADR 0006](../architecture/adr/0006-group-ordered-event-delivery.md).

| Doc                                                    | What it covers                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [01-ordering-design.md](01-ordering-design.md)         | Why ordering was not enforceable, what pg-boss actually enforces, and the design as built |
| [02-consumer-groups.md](02-consumer-groups.md)         | The group → ordering-key map, producer-side fan-out, invariants                           |
| [03-implementation-plan.md](03-implementation-plan.md) | Status tracker: done, this pass, remaining                                                |

A rendered version of an earlier 01 lives at
[claude.ai/code/artifact/d8a68027](https://claude.ai/code/artifact/d8a68027-803f-4743-bab2-bdd083a50bab).
It predates the implementation; these files are the source of truth.

## The short version

- Ordering was broken in three independent places, and `singletonKey` was
  **inert** — no index covers it on a `standard` queue.
- pg-boss ships `key_strict_fifo`, a Postgres-enforced strict FIFO per
  `singletonKey`. It is the only ordering primitive backed by a unique index.
  **Requires pg-boss ≥ 12.34.0**: on 12.18.2 one blocked key stalls the whole
  queue.
- One queue per consumer group, replacing one queue per event × group.
- Each group declares its own ordering key. Almost everything keys on the
  **user**; `messaging` keys on the message.
- A consumer group is a typed const owned by its context, passed to
  `@EventHandler(Event, Group)`. The platform derives the group map from the
  discovered handlers at `onApplicationBootstrap` — no registration step.
- Fan-out happens at the **producer**: a message is published once per
  recipient, so one outbox row is always one job per group.
- The dispatcher only drains event types that have a durable handler in its
  process; anything else stays in the outbox rather than being dropped.
- A failing event retries with backoff while its key waits. On the terminal
  attempt the runtime writes a row to our own `events_dead_letters` table and
  **completes** the job, so a poison event never blocks its key.

## Related

- [../architecture/01-current-state.md](../architecture/01-current-state.md) §4.9 — two of the
  defects listed there were fixed by this work
- [../architecture/05-integration.md](../architecture/05-integration.md) — the context-integration
  mechanism this changes
