# ADR 0004 — Attention is an aggregate with a projected slice, keyed by typed source

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Mihai Alexandru

---

## Context

`attention_items` is where the product's value converges — and it is the least typed
table in the schema.

```
type            = tagged_message | incoming_email | slack_message | whatsapp_message
                | suggested_timeblock | suggested_task | task
metadata jsonb  = { type, messageId?, threadId?, taskId?, taskBatchId?, suggestionId?, … }
```

- The `type` enum names the **source context**, not a property of the item. Three of
  its seven values have no producer — the column is an extension point in disguise.
- Source identity lives in untyped jsonb, retrieved via four separate
  `metadata->>'key' = $1` queries with **no supporting index**.
- Three bespoke event handlers each know a different source's shape and build a
  different metadata arm.
- Idempotency under redelivery is hand-rolled in three places.
- `upsertFromSource` hardcodes `type: "task"` for both tasks and batches.
- `dueDatePinned` — "the user set this, do not move it" — is enforced by a `.filter()`
  inside a _service_, defending an _entity's_ invariant.

Two questions need answering, and they are usually conflated.

## Question 1 — Is attention an aggregate or a read model?

**Evidence for "read model":** it consumes events from four contexts and publishes
back into two; `type` names the source; source ids sit in jsonb; and
`mapTaskStatusToAttention` shows status is partly derived.

**Evidence for "aggregate":** `dueDate`, `dueDatePinned`, `note` and user-set `status`
are decisions **no source context can make**. A task does not know when its owner
intends to deal with it. A tag decides that. And _"the user marked this resolved"_ is
the single most important action in the product.

### Decision

**An aggregate with a projected slice inside it.**

| Data                                           | Owner                 | Written by                       |
| ---------------------------------------------- | --------------------- | -------------------------------- |
| `source_context` / `source_kind` / `source_id` | source                | ingestion, once                  |
| `preview` (title, body, actor label)           | source                | ingestion, every update          |
| `tagIds`                                       | source                | ingestion, every update          |
| `status`                                       | contested — see below | the user _and_ the source        |
| `dueDate`, `dueDatePinned`                     | **attention**         | the due-date policy, or the user |
| `note`                                         | **attention**         | the user                         |

Mirrored fields are overwritten wholesale by the ingestion handler and are never
user-editable. Owned fields change only through attention's own use cases.

This is recorded explicitly because both extremes are tempting and both are wrong:

- _"Make it a pure projection"_ loses the status transitions and the pinned due date —
  the product itself.
- _"Make it a pure aggregate"_ means either duplicating message content
  authoritatively, or joining across contexts at read time.

**On `status`, deliberately not over-modelled.** It is genuinely bidirectional today,
and the loop is broken correctly by three independent idempotency guards. Keep
last-writer-wins. Keep the outbound `attention.message.synced` event. The only change
is that both writers go through aggregate methods — `applyMirror` for the source,
`transitionTo` for the user — so the two paths are visible in one file instead of
spread across three handlers and a service.

## Question 2 — How is the source identified?

### Options considered

**A. Keep `metadata` jsonb, add a GIN index.**
Indexes the probes but keeps the untyped union, the per-source handlers and the
speculative enum. Every new channel still edits attention.

**B. One `source_channel` enum + `source_id`.**
Better, but collapses _who is speaking_ with _what kind of thing it is_. `tasks` alone
produces three kinds (`task`, `task_batch`, `task_suggestion`), so the enum
re-acquires the same problem in a new column. Adding a channel still needs a
migration.

**C. `source_context` + `source_kind` + `source_id`, all `text` _(chosen)_.**

### Decision

```sql
source_context text NOT NULL,   -- 'conversations' | 'tasks' | 'channels.gmail' | …
source_kind    text NOT NULL,   -- 'message' | 'task' | 'task_batch' | 'task_suggestion'
source_id      text NOT NULL,   -- opaque to attention
preview        jsonb NOT NULL,  -- display only, never queried by key

UNIQUE (user_id, source_context, source_kind, source_id) WHERE deleted_at IS NULL
```

`text` rather than an enum, deliberately: **adding a channel must not require a
migration.** The set of source contexts is open by design.

This is Vernon's _reference other aggregates by identity_ done properly — a typed,
indexed identity rather than a JSON key probe.

## The third decision — attention publishes the ingestion contract

The direction of the current dependency is backwards: each source publishes its own
event and attention has a handler per source, so **every new channel edits attention**.

Instead, attention — as the core domain — publishes the language, and sources conform.
In Evans' terms: attention is an _Open Host Service_ with a _Published Language_; every
source is a _Conformist_.

```ts
export const AttentionSourceUpserted = defineEvent({
  name: "attention.source.upserted",
  schema: z.object({
    userId: z.string(),
    source: z.object({ context: z.string(), kind: z.string(), id: z.string() }),
    preview: z.object({
      title: z.string(),
      body: z.string().nullable(),
      actorLabel: z.string().nullable(),
    }),
    tagIds: z.array(z.string()),
    status: z.enum(["created", "in_progress", "resolved"]),
    dueDate: z.string().nullable(),
    occurredAt: z.string(),
  }),
  delivery: DeliveryMode.Durable,
  groups: ["attention"],
});
```

Each source keeps its own events for its own purposes and _additionally_ publishes
this one from a thin outbound translator it owns. `mapTaskStatusToAttention` — today a
_supporting_ context importing the _core_ context's vocabulary from a shared util —
becomes exactly what it should be: a translation at `tasks`' outbound boundary.

Attention then has **three handlers, permanently**: source upserted/removed, tag
changed, calendar changed.

---

## Consequences

### Positive

- **Adding Gmail costs attention zero lines.** Write `channels/gmail/`, publish
  `AttentionSourceUpserted`. This is the entire point.
- Four unindexed jsonb scans become one indexed `findBySource`.
- The unique index makes `upsertFromSource` a real upsert, retiring three hand-rolled
  idempotency guards.
- Deletes the `attention_item_type` enum (including three speculative values), the
  `AttentionItemMetadata` union, four finders, and two bespoke handlers.
- `applyDueDateDecision` no-ops when pinned, moving that invariant from a service's
  `.filter()` into the entity where it cannot be forgotten.
- Boolean returns from aggregate methods let the application publish
  `attention.upserted` only on real change — today every calendar edit fans out
  websocket traffic for items that did not move.
- Gamification and analytics attach by subscribing to `attention.*`, with no core
  change.

### Negative

- **A real data migration with no rollback** — the one genuinely irreversible step in
  the plan. Acceptable under the MVP policy in `CLAUDE.md`, but sequenced late and
  split so that switching reads is revertible independently of dropping columns.
- `text` columns mean a typo in `source_context` is not caught by the database.
  Mitigated by the publishing context being the only writer, and by a constant per
  context.
- Two events per source change during the dual-publish transition. Temporary, and the
  outbox handles the volume.

### Neutral

- `attention_item_tags` is unchanged, **including its deliberate missing FK on
  `tag_id`** so ghost rows survive tag deletion and remain findable by the tag-deleted
  handler. A comment is added, because it now reads as an oversight rather than a
  decision.

---

## Migration

1. Add the new columns nullable; keep `type` and `metadata`. No behaviour change.
2. Backfill deterministically per old `type`.
3. Verify: row counts per old `type` equal counts per new
   `(source_context, source_kind)`; zero nulls.
4. Add the unique index. **If it fails there are duplicate source rows — investigate,
   do not force.**
5. Switch reads to `findBySource`; confirm with `EXPLAIN` that it is an index scan.
6. **Separate commit:** drop `metadata`, `type`, and the enum.

Steps 1–4 are reversible. Step 6 is not.

## References

- Vernon, [Effective Aggregate Design Part II](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_2.pdf) — reference by identity, eventual consistency outside the boundary
- Evans, _Domain-Driven Design_ — Open Host Service, Published Language, Conformist
- [Microsoft — CQRS pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs) — projections over a single store
- [Chris Richardson — Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html) — consumer idempotency
