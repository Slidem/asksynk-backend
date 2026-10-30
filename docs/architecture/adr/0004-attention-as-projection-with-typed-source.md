# ADR 0004 — Attention keyed by typed source; attention publishes the ingestion contract

**Status:** Accepted (2026-08-07) · Decision 1 superseded by [ADR 0009](0009-attention-as-pure-projection.md) · executed in Wave 6

## Context

`attention_items` is where the product converges and the least typed table:
a `type` enum naming the source (3 of 7 values without a producer), source ids in
unindexed `metadata` jsonb probed with `metadata->>'key'`, one bespoke handler per
source, hand-rolled idempotency, and the "pinned due date" invariant enforced by a
service `.filter()`.

## Decision 1 — aggregate or read model? **Superseded by [ADR 0009](0009-attention-as-pure-projection.md).**

A pure projection plus derived due-date fields; status flows source → attention only.

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
each source publishes them from a translator handler it owns, consuming its own events
in its own consumer group (Open Host Service + Published Language; sources conform).
Attention keeps three handlers permanently: source upserted/removed, tag changed,
calendar changed.

## Consequences

- **+** Adding Gmail costs attention zero lines.
- **+** Four unindexed probes → one indexed `findBySource`; the unique index makes
  upsert real and retires the hand-rolled idempotency.
- **+** One upsert path; `attention.upserted` only on real change.
- **−** No backfill: `attention_items` is truncated and refills as sources change
  (MVP data).
- **−** `text` columns don't catch typos; mitigated by one constant per source context.
- **=** `attention_item_tags.tag_id` keeps its deliberate missing FK.

Design: [06-attention-core.md](../06-attention-core.md).
