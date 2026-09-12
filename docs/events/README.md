# Event delivery ordering

Workstream docs for making the outbox → pg-boss pipeline deliver durable events
in a defined order per consumer group.

**Status:** decided, not built. No code written yet.

| Doc | What it covers |
| --- | --- |
| [01-ordering-design.md](01-ordering-design.md) | Why ordering is not enforceable today, what pg-boss actually enforces, and the target design |
| [02-consumer-groups.md](02-consumer-groups.md) | The group → ordering-key map, and every producer change it requires |
| [03-implementation-plan.md](03-implementation-plan.md) | Phased plan, including the `docs/architecture` updates |

A rendered version of 01 lives at
[claude.ai/code/artifact/d8a68027](https://claude.ai/code/artifact/d8a68027-803f-4743-bab2-bdd083a50bab).
These files are the source of truth; the artifact mirrors them.

## The short version

- Ordering is broken in three independent places today, and `singletonKey` as
  currently passed is **inert** — no index covers it on a `standard` queue.
- pg-boss 12.18.2 ships `key_strict_fifo`, a Postgres-enforced strict FIFO per
  `singletonKey`. That is the only ordering primitive here backed by a unique
  index; `groupConcurrency` is advisory and cannot be relied on.
- One queue per consumer group, replacing one queue per event × group.
- Each group declares its own ordering key. Everything keys on the **user**
  except `messaging`, which keys on the thread.
- A group's key may fan one event into several jobs — `attention-items` does
  this for the three message events, which belong to every participant at once.
- Groups reach the dispatcher through a platform registry bean that each context
  registers into at `onModuleInit`, the same self-registration seam
  `attachment-access` already uses. Everything that reads the registry moves to
  `onApplicationBootstrap`.
- Terminal failures go to our own dead-letter table and the job **completes**,
  so a poison event never blocks its key.

## Related

- [../architecture/01-current-state.md](../architecture/01-current-state.md) §4.9 — two of the
  defects listed there are fixed by this work
- [../architecture/05-integration.md](../architecture/05-integration.md) — the context-integration
  mechanism this changes
