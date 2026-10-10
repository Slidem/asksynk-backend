# ADR 0004 — Attention is an aggregate with a projected slice, keyed by typed source

**Status:** Accepted (2026-08-07) · executed in Waves 5–6

## Context

`attention_items` is where the product converges and the least typed table:
a `type` enum naming the source (3 of 7 values without a producer), source ids in
unindexed `metadata` jsonb probed with `metadata->>'key'`, one bespoke handler per
source, hand-rolled idempotency, and the "pinned due date" invariant enforced by a
service `.filter()`.

## Decision 1 — aggregate or read model? **An aggregate with a projected slice.**

| Data                                           | Owner         | Written by                       |
| ---------------------------------------------- | ------------- | -------------------------------- |
| `source_context` / `source_kind` / `source_id` | source        | ingestion, once                  |
| `preview`, `tagIds`                            | source        | ingestion, every update          |
| `status`                                       | contested     | the user _and_ the source        |
| `dueDate`, `dueDatePinned`, `note`             | **attention** | the policy or the user           |

Pure projection would lose status transitions and the pinned date (the product);
pure aggregate would duplicate source content or join across contexts.

`status` stays last-writer-wins with the outbound `attention.message.synced` event;
both writers go through aggregate methods (`applyMirror`, `transitionTo`).

## Decision 2 — source identity. **`source_context` + `source_kind` + `source_id`, all `text`.**

Rejected: GIN index on `metadata` (keeps the untyped union and per-source handlers);
one `source_channel` enum (conflates speaker and kind — tasks alone has three kinds —
and needs a migration per channel).

```sql
UNIQUE (user_id, source_context, source_kind, source_id)
```

`text`, so a new channel needs no migration.

## Decision 3 — attention publishes the ingestion contract

Attention (core) publishes `attention.source.upserted` / `attention.source.removed`;
each source publishes them from a thin outbound translator it owns (Open Host Service
+ Published Language; sources conform). Attention keeps three handlers permanently:
source upserted/removed, tag changed, calendar changed.

## Consequences

- **+** Adding Gmail costs attention zero lines.
- **+** Four unindexed probes → one indexed `findBySource`; the unique index makes
  upsert real and retires the hand-rolled idempotency.
- **+** `applyDueDateDecision` no-ops when pinned; boolean returns mean
  `attention.upserted` only on real change.
- **−** A data migration with no rollback past the column drop — split so switching
  reads is revertible separately.
- **−** `text` columns don't catch typos; mitigated by one constant per source context.
- **−** Dual-publish during the transition.
- **=** `attention_item_tags.tag_id` keeps its deliberate missing FK.

Design and migration steps: [06-attention-core.md](../06-attention-core.md).
