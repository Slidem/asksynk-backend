# 06 — The attention core

The product.
→ [ADR 0004](adr/0004-attention-as-projection-with-typed-source.md) (typed source,
ingestion contract), [ADR 0009](adr/0009-attention-as-pure-projection.md) (pure
projection)

## 1. What an attention item is

_A thing that arrived, carrying tags, that the user has to decide about — and the tags
decide when._

A pure projection of its source plus fields attention derives. The user never edits it;
they act on the source, and the item follows.

| Data                                           | Owner          | Written by                                         |
| ---------------------------------------------- | -------------- | -------------------------------------------------- |
| source identity                                | source context | ingestion, once                                    |
| `preview` (title, body, actor, meta)           | source context | ingestion, every upsert                            |
| `tagIds`                                       | source context | ingestion, every upsert                            |
| `status`                                       | source context | ingestion, every upsert                            |
| `dueDate`, `dueDatePinned`, `dueSourceEventId` | **attention**  | the due-date policy, or the source's explicit date |
| `deletedAt`                                    | **attention**  | the user (`DELETE`)                                |

- **Status flows one way.** Message resolved → item resolved; task in progress → item
  in progress. No `PATCH /attention-items/:id`; the inbox resolves by calling the
  source (message status, task `PATCH`).
- **A user delete is permanent.** The item is tombstoned and no later source event
  revives it (§5).
- The REST surface is `GET /attention-items` (`?status`, `?sourceKind`), `GET :id`,
  `DELETE :id`.

## 2. Why a projection

One writer per field: no message ↔ attention loop, no inbox edits drifting from the
source, and a new channel touches no attention code. Context and rejected
alternatives: [ADR 0004](adr/0004-attention-as-projection-with-typed-source.md),
[ADR 0009](adr/0009-attention-as-pure-projection.md).

## 3. Typed source identity

`apps/migrations/src/schema/attentionItems.ts`:

| Column                                               | Type                         | Notes                                                       |
| ---------------------------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `source_context`, `source_kind`, `source_id`         | `text`                       | e.g. `tasks` / `task_batch` / `<uuid>`; opaque to attention |
| `preview`                                            | `jsonb` (`AttentionPreview`) | display only, never queried                                 |
| `status`                                             | `attention_item_status` enum | `created \| in_progress \| resolved`                        |
| `due_date`, `due_date_pinned`, `due_source_event_id` | timestamp, bool, `uuid`      | `due_source_event_id` is a soft ref into scheduling         |
| `deleted_at`                                         | timestamp                    | user tombstone, sticky                                      |

`uq_attention_items_source (user_id, source_context, source_kind, source_id)` covers
tombstones — that is what makes a delete sticky — and backs `findBySource` and the
`ON CONFLICT` upsert. Partial indexes on `(user_id, status)`, `(user_id, due_date)` and
`due_source_event_id` skip tombstones.

- **Three-part source:** `tasks` alone produces three kinds; one enum would recreate
  the problem.
- **`text`, not enum:** adding a channel must not need a migration. One constant per
  source context guards typos.
- `attention_item_tags` holds `tagIds`, with a deliberate missing FK on `tag_id`.

## 4. Attention publishes the ingestion contract

Attention publishes the language and sources conform (Open Host Service + Published
Language; sources are Conformists).

```ts
// events.registry.ts (8.1 moves it to attention/contract/attention-source.events.ts)
const attentionSource = z.object({
  context: z.string(),
  kind: z.string(),
  id: z.string(),
});

export const AttentionSourceUpserted = defineEvent({
  name: "attention.source.upserted",
  schema: z.object({
    userId: z.string(),
    source: attentionSource,
    preview: z.object({
      title: z.string(),
      body: z.string().nullable(),
      actor: z
        .object({ kind: z.enum(["user", "guest"]), id: z.string() })
        .nullable(),
      meta: z.record(z.string(), z.string()), // opaque to attention
    }),
    tagIds: z.array(z.string()),
    status: z.enum(["created", "in_progress", "resolved"]),
    dueDate: z.string().nullable(), // non-null = explicit, pins the item
    occurredAt: z.string(), // due-date policy base
  }),
  delivery: DeliveryMode.Durable,
});
export const AttentionSourceRemoved = defineEvent({
  name: "attention.source.removed",
  schema: z.object({ userId: z.string(), source: attentionSource }),
  delivery: DeliveryMode.Durable,
});
```

- **One event per target user.** The source fans out to recipients / assignees.
- **Full snapshot, not a delta.** Every upsert carries the whole projected state, so
  the handler is a plain upsert and redelivery is harmless.
- **`preview.meta`** carries source-specific display and navigation extras (e.g.
  `{ threadId }` for a message deep link). Attention stores and returns it verbatim and
  never reads or queries it; anything attention must filter on becomes a column.

### Two hops; the source owns translation

```
tasks.service ──TaskUpserted──▶ tasks/…/attention-projection.handler ──AttentionSourceUpserted──▶ attention-source.handler
               (outbox, tx 1)   (consumer group tasks-attention-projection)  (outbox, tx 2)        (consumer group attention-items)
```

Each source context has `<ctx>/presentation/events/attention-projection.handler.ts`
in its own consumer group (`<ctx>-attention-projection`, keyed `user:<target>`), with
the mapping in a pure `<ctx>/application/attention-projection.mapper.ts`.

```ts
// tasks/presentation/events/attention-projection.handler.ts — tasks' outbound ACL
@Transactional()
@EventHandler(TaskUpserted, TasksAttentionProjectionConsumerGroup)
async onTaskUpserted(p: EventOf<typeof TaskUpserted>) {
  await this.publish(fromTask(p)); // pure mapper: tagged → upserted, untagged → removed
}
```

| Source                           | Consumes                                                                     | Upserted when                          | Removed when       | `status`                             |
| -------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- | ------------------ | ------------------------------------ |
| `conversations/message`          | `message.created`, `message.updated`, `message.status.changed`               | tagged, per non-sender user recipient  | untagged on update | `managed_status.status`              |
| `tasks/task`, `tasks/task_batch` | `task.upserted`, `task.deleted`, `task.batch.upserted`, `task.batch.deleted` | tagged, per assignee                   | untagged, deleted  | tasks' status, mapped here only      |
| `tasks/task_suggestion`          | `task.suggestion.{created,updated,resolved}`                                 | created, edited, resolved (`resolved`) | —                  | `pending → created`, else `resolved` |

Source events carry what their translator needs; it never reads foreign state.
`task.upserted` / `task.batch.upserted` carry tasks' own status, so translation happens
exactly once, in the mapper. Guests never get items. The assignee is immutable, so
"assignee change removes the old user's item" has no trigger yet.

Trade-off, accepted: two consumer groups and two dead-letter points per source, one
extra dispatcher poll of latency, and no causation id linking the hops until tracing
exists ([roadmap backlog](07-roadmap.md#backlog-no-wave)). Rejected: publishing
`attention.source.*` from the source's write transaction (every mutation site must
remember); translators inside attention (source semantics leak into the core).

**Attention has two handlers, permanently:** `attention-source.handler.ts`
(upserted/removed, all sources) and `tag-calendar-attention.handler.ts` (tag /
calendar recompute). Both run in the `attention-items` group, which
is keyed `user:<userId>`. Order between a tag change and a source upsert isn't
guaranteed across hops; every upsert recomputes the due date from current tags, so it
converges. Adding Gmail = `channels/gmail/` with its translator; attention changes
zero lines.

## 5. The projection

No aggregate: the rules are one pure function, and every write is serialized per user
by the consumer group; the user `DELETE` only sets `deleted_at` and `upsert` never
writes it (`WHERE deleted_at IS NULL`), so no `version`.

```ts
// attention/domain/attention-projection.ts
/** Next state of the item, or null when nothing changes (no write, no realtime push). */
export function applySnapshot(
  current: AttentionItem | null,
  snapshot: AttentionSourceSnapshot,
  decision: DueDateDecision,
): AttentionItemState | null; // every column an upsert writes; never `deletedAt`
```

| Case                        | Result                                                            |
| --------------------------- | ----------------------------------------------------------------- |
| `current` tombstoned        | `null` — a user delete is permanent                               |
| `snapshot.dueDate` non-null | `dueDate` = it, `dueDatePinned = true`, `dueSourceEventId = null` |
| otherwise                   | `decideDueDate` on `occurredAt`, unpinned                         |
| nothing differs             | `null`                                                            |

`attention.source.removed` hard-deletes a live item (tags cascade) and publishes
`attention.removed`; a tombstoned item stays as it is, so untag → retag never revives
it. Tombstones of deleted sources stay in the table.

`AttentionProjectionService` (application) is orchestration only: `findBySource` →
due-date decision → `applySnapshot` → `upsert` → `attention.upserted` on change, plus
`attention.item.resolved` on the transition to `resolved`. The repository's upsert is
`ON CONFLICT … DO UPDATE … WHERE deleted_at IS NULL`, so a delete racing an upsert
still wins.
Recompute (tag / calendar handlers) filters `!dueDatePinned && !deleted && status !==
"resolved"`, fetches modes + occurrences once, `decideDueDate` per item, saves and
publishes only what changed (`AttentionDueDateService`). The base is the item's
`createdAt`. `tag.deleted` removes a non-resolved item left with no tags, as an untag
would (the source's tag rows cascade without an event). `AttentionItemsService` keeps
`get` / `list` / `delete`.

## 6. The tag → due-date policy

The pure function `attention/domain/due-date.policy.ts`, called by
`AttentionDueDateService`, which feeds it answer modes from `TagCatalogPort` and
occurrences from `CalendarOccurrencePort`.

```ts
// attention/domain/due-date.policy.ts
export type DueDateDecision = {
  dueDate: Date | null;
  dueSourceEventId: string | null;
};

/** Earliest wins. immediately → base + responseTimeMillis; timeblock → next occurrence
 *  of an event carrying that tag. Ties keep the first candidate. */
export function decideDueDate(input: {
  answerModes: readonly AnswerModeSpec[];
  occurrences: ReadonlyMap<string, TimeblockOccurrence>; // by tagId
  base: Date;
}): DueDateDecision;
```

Unit cases: immediate wins, timeblock wins, mixed tie, no tags, timeblock with no
upcoming occurrence.

Attention injects the published ports directly (`TaggingModule`, `SchedulingModule`
imports); no attention-side port wraps them until a second implementation exists.

## 7. Designed-in growth

| Feature                  | Cost after this design                                 | Do now                                                                                                                      |
| ------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Gmail / Slack / WhatsApp | `channels/<provider>/` with its own translator handler | Nothing. Don't create `channels/` speculatively                                                                             |
| Gamification             | `momentum/` consuming `attention.item.resolved`        | `attention.item.resolved { userId, itemId, resolvedAt, dueDate, wasOverdue }` is published (realtime); make it durable then |
| Analytics                | `insights` projections from events                     | Nothing. Don't use the outbox as an event log (retention prunes it at 30 days)                                              |
| AI agents                | Another `Actor` through the same application layer     | `Actor` in every application method                                                                                         |
| Tracing across hops      | Causation / correlation id on the event envelope       | Nothing; backlog                                                                                                            |
