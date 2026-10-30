# ADR 0009 — Attention item is a pure projection; status flows one way

**Status:** Accepted (2026-10-27) · executed in Wave 6 · supersedes
[ADR 0004](0004-attention-as-projection-with-typed-source.md) Decision 1

## Context

ADR 0004 made the attention item an aggregate with a projected slice: `status` written
by both the user and the source, `note` and `tagIds` editable from the inbox. In code
that means a bidirectional message ↔ attention sync held together by three idempotency
guards, an inbox `PATCH` that lets a task item's status diverge from the task until the
next `task.upserted` overwrites it, and inbox tags that diverge from the source's tags.
Nothing in attention needs a write model of its own: due dates are derived, the pinned
date comes from the source.

## Decision 1 — **pure projection plus derived fields**

| Data                                           | Written by                                        |
| ---------------------------------------------- | ------------------------------------------------- |
| `source_*`, `preview`, `tagIds`, `status`      | the source's snapshot, every upsert               |
| `dueDate`, `dueDatePinned`, `dueSourceEventId` | attention's policy, or the source's explicit date |
| `deletedAt`                                    | the user (`DELETE`)                               |

- No client writes except delete: no `PATCH`, no `note`, no inbox tag edits.
- To change status the client acts on the source (message status, task `PATCH`); the
  item follows.
- `AttentionItem` is a read model, not a Wave 5 aggregate: the rules are one pure
  function, writes are serialized per user by the consumer group, so no `version`.

## Decision 2 — **a user delete is permanent**

The item is tombstoned (`deleted_at`). Lookups by source include tombstones; an upsert
on a tombstoned item is a no-op and `attention.source.removed` leaves it in place. The
unique index `(user_id, source_context, source_kind, source_id)` covers tombstones, so
an untag → retag never re-creates it. Removal by the source of a live item is a hard
delete (it is a projection).

## Decision 3 — **two hops; the source owns translation**

ADR 0004 Decision 3 stands: each source runs its own translator handler (own consumer
group) that turns its events into `attention.source.upserted` / `removed`; attention
has one handler for all sources.

Rejected: sources publishing `attention.source.*` in their own write transaction (one
hop, but every mutation site must remember to publish); translators inside attention
(one hop, but source semantics leak into the core).

## Consequences

- **+** The message ↔ attention loop and its guards disappear; one write direction.
- **+** Attention knows no source shapes; Gmail = a translator in `channels/gmail/`.
- **+** No aggregate, no `version` column, no concurrency handling.
- **−** Two consumer groups and two dead-letter points per source, one extra dispatcher
  poll of latency, and no causation id linking the hops until tracing exists (backlog).
- **−** Order between a tag change and a source upsert isn't guaranteed across hops;
  every upsert recomputes the due date from current tags, so it converges.
- **−** Tombstones of deleted sources stay in the table.
- **−** Breaking change for clients: `PATCH` gone, response and `attention.upserted`
  reshaped (`source`, `preview`; no `type`, `metadata`, `note`).

Design: [06-attention-core.md](../06-attention-core.md).
