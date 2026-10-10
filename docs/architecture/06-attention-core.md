# 06 — The attention core

The product. Design target for Waves 1.2 (policy), 5 (aggregate) and 6 (typed source).
→ [ADR 0004](adr/0004-attention-as-projection-with-typed-source.md)

## 1. What an attention item is

_A thing that arrived, carrying tags, that the user has to decide about — and the tags
decide when._

| Data                                     | Owner                 | Written by                       |
| ---------------------------------------- | --------------------- | -------------------------------- |
| source identity                          | source context        | ingestion, once                  |
| preview (title, body, sender)            | source context        | ingestion, every update          |
| `tagIds`                                 | source context        | ingestion, every update          |
| `status`                                 | contested — §5        | the user _and_ the source        |
| `dueDate`, `dueDatePinned`               | **attention**         | the due-date policy, or the user |
| `note`                                   | **attention**         | the user                         |

An aggregate with a projected slice. `dueDate`, `dueDatePinned` and user-set `status`
are decisions no source can make — that is the product.

## 2. Today's problems

See [01 §3.3, §3.8](01-current-state.md#38-attention_items-is-a-projection-wearing-an-aggregates-clothes):
`type` enum naming sources (3 without producers), source ids in unindexed `metadata`
jsonb, `upsertFromSource` hardcoding `type: "task"` for tasks and batches, three
bespoke handlers, hand-rolled idempotency, the pinned-date invariant defended by a
service `.filter()`. Adding Gmail today = new enum value + metadata arm + handler +
unindexed probe.

## 3. Typed source identity (Wave 6)

```ts
export const attentionItems = attention.table("attention_items", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  sourceContext: text("source_context").notNull(), // 'conversations' | 'tasks' | 'channels.gmail' | …
  sourceKind: text("source_kind").notNull(),       // 'message' | 'task' | 'task_batch' | 'task_suggestion'
  sourceId: text("source_id").notNull(),           // opaque to attention
  preview: jsonb("preview").$type<AttentionPreview>().notNull(), // display only

  status: attentionItemStatus("status").notNull().default("created"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  dueDatePinned: boolean("due_date_pinned").notNull().default(false),
  dueSourceEventId: uuid("due_source_event_id"),   // soft ref into scheduling
  note: text("note"),
  deletedAt, createdAt, updatedAt,
}, (t) => [
  uniqueIndex("uq_attention_items_source").on(t.userId, t.sourceContext, t.sourceKind, t.sourceId),
  // + existing user/status, user/due_date, due_source_event partial indexes
]);
```

- **Three-part source:** `tasks` alone produces three kinds; one enum would recreate
  the problem.
- **`text`, not enum:** adding a channel must not need a migration.
- **Deletes:** `attention_item_type` enum, `AttentionItemMetadata` union, the four
  `metadata->>` finders (→ one `findBySource` on a unique index), hand-rolled
  idempotency (the unique index makes upsert real).
- `attention_item_tags` unchanged, including the deliberate missing FK on `tag_id`.

## 4. Attention publishes the ingestion contract (Wave 6)

Today each source publishes its own event and attention has a handler per source.
Instead attention publishes the language and sources conform (Open Host Service +
Published Language; sources are Conformists).

```ts
// attention/contract/attention-source.events.ts
export const AttentionSourceUpserted = defineEvent({
  name: "attention.source.upserted",
  schema: z.object({
    userId: z.string(),
    source: z.object({ context: z.string(), kind: z.string(), id: z.string() }),
    preview: z.object({ title: z.string(), body: z.string().nullable(), actorLabel: z.string().nullable() }),
    tagIds: z.array(z.string()),
    status: z.enum(["created", "in_progress", "resolved"]),
    dueDate: z.string().nullable(), // non-null = explicit, pins the item
    occurredAt: z.string(),
  }),
  delivery: DeliveryMode.Durable,
});
export const AttentionSourceRemoved = defineEvent({
  name: "attention.source.removed",
  schema: z.object({ userId: z.string(), source: z.object({ context: z.string(), kind: z.string(), id: z.string() }) }),
  delivery: DeliveryMode.Durable,
});
```

Attention's consumer group stays user-keyed and also takes the tag / calendar
recompute events, so every change to a user's attention applies in order.

Each source publishes it from a thin outbound translator it owns:

```ts
// tasks/presentation/events/attention-projection.publisher.ts — tasks' outbound ACL
@EventHandler(TaskUpserted, AttentionProjectionConsumerGroup) // keyed user:<assigneeUserId>
async onTask(p: EventOf<typeof TaskUpserted>) {
  await this.publisher.publish(AttentionSourceUpserted, {
    userId: p.assigneeUserId,
    source: { context: "tasks", kind: "task", id: p.taskId },
    preview: { title: p.title, body: null, actorLabel: null },
    tagIds: p.tagIds,
    status: mapTaskStatusToAttention(p.status), // translation lives here, once
    dueDate: p.dueDatePinned ? p.dueDate : null,
    occurredAt: p.createdAt,
  });
}
```

`TaskUpserted.status` is already mapped to attention's status today; part of 6.2 is
making it carry tasks' own `TaskStatus` so translation happens exactly once.

**Attention then has three handlers, permanently:** `attention-source.handler.ts`
(upserted/removed, all sources), `tag-changed.handler.ts`,
`calendar-changed.handler.ts`. Adding Gmail = `channels/gmail/` publishing
`AttentionSourceUpserted`; attention changes zero lines.

## 5. The aggregate (Wave 5)

```ts
export class AttentionItem {
  static open(input: OpenAttentionItem): AttentionItem;    // source triple + userId non-empty
  static rehydrate(props: AttentionItemProps): AttentionItem;

  // owned by attention
  transitionTo(status: AttentionItemStatus, now: Date): boolean;
  pinDueDate(dueDate: Date, now: Date): void;
  applyDueDateDecision(decision: DueDateDecision, now: Date): boolean; // NO-OP when pinned
  annotate(note: string | null, now: Date): void;

  // mirrored from the source
  applyMirror(m: { preview; tagIds; status }, now: Date): boolean;

  belongsTo(userId: string): boolean;
  get needsDueDateRecompute(): boolean; // !pinned && !deleted && status !== "resolved"
}
```

- `applyDueDateDecision` no-ops when pinned — the invariant moves out of the service.
- `boolean` returns let the application publish `attention.upserted` only on real
  change (today recompute republishes unconditionally).

**On `status`: don't over-model.** It is bidirectional (task completed → item
resolved; user resolves tagged-message item → `attention.message.synced` →
`messages.managed_status`) and the loop is broken by three idempotency guards that
work. Keep last-writer-wins and the outbound event; just route both writers through
`applyMirror` / `transitionTo`.

## 6. The tag → due-date policy

Today: `AttentionDueDateService.pickEarliestCandidate`
(`attention-items/attention-due-date.service.ts:75-102`). Target: a pure function
(Wave 1.2) plus two ports (Wave 2).

```ts
// domain/due-date.policy.ts
export type TimeblockOccurrence = { startAt: Date; eventId: string };
export type DueDateDecision = { dueDate: Date | null; dueSourceEventId: string | null };

/** Earliest wins. immediately → base + responseTimeMillis; timeblock → next occurrence
 *  of an event carrying that tag. Ties keep the first candidate. */
export function decideDueDate(input: {
  answerModes: readonly AnswerModeSpec[];
  occurrences: ReadonlyMap<string, TimeblockOccurrence>;
  base: Date;
}): DueDateDecision {
  let dueDate: Date | null = null;
  let dueSourceEventId: string | null = null;
  for (const mode of input.answerModes) {
    if (mode.type === "immediately") {
      const candidate = new Date(input.base.getTime() + mode.responseTimeMillis);
      if (!dueDate || candidate < dueDate) { dueDate = candidate; dueSourceEventId = null; }
    } else {
      const occ = input.occurrences.get(mode.tagId);
      if (occ && (!dueDate || occ.startAt < dueDate)) { dueDate = occ.startAt; dueSourceEventId = occ.eventId; }
    }
  }
  return { dueDate, dueSourceEventId };
}
```

Unit cases: immediate wins, timeblock wins, mixed tie, no tags, timeblock with no
upcoming occurrence.

Ports declared by attention, in its own language; bound with `useExisting`:

```ts
// attention/domain/ports/
export abstract class TagAnswerModePort {
  abstract getAnswerModes(tagIds: string[]): Promise<AnswerModeSpec[]>;
}
export abstract class TimeblockOccurrencePort {
  abstract findNextOccurrenceByTag(tagIds: string[], after: Date): Promise<Map<string, TimeblockOccurrence>>;
}

// attention.module.ts
{ provide: TagAnswerModePort,       useExisting: TagCatalogPort },          // tagging/contract
{ provide: TimeblockOccurrencePort, useExisting: CalendarOccurrencePort },  // scheduling/contract
```

The recompute use case is then orchestration only: filter `needsDueDateRecompute`,
fetch modes + occurrences once, `decideDueDate` per item, save + publish when
`applyDueDateDecision` returns true.

## 7. Designed-in growth

| Feature                  | Cost after this design                                       | Do now                                                                       |
| ------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Gmail / Slack / WhatsApp | `channels/<provider>/` publishing `AttentionSourceUpserted`   | Nothing beyond Wave 6. Don't create `channels/` speculatively                |
| Gamification             | `momentum/` consuming `attention.item.resolved`               | Publish `attention.item.resolved { userId, itemId, resolvedAt, dueDate, wasOverdue }` (6.5) so history exists |
| Analytics                | `insights` projections from events                            | Nothing. Don't use the outbox as an event log (retention prunes it at 30 days) |
| AI agents                | Another `Actor` through the same application layer            | `Actor` everywhere (Wave 1.1 onward)                                         |

## 8. Migration

1. Add `source_*` + `preview` nullable; keep `type` and `metadata`.
2. Backfill per old `type`: `tagged_message → ('conversations','message', metadata->>'messageId')`,
   `task → ('tasks','task'|'task_batch', …)`, `suggested_task → ('tasks','task_suggestion', metadata->>'suggestionId')`.
3. Verify counts per old `type` = counts per `(source_context, source_kind)`; zero nulls.
4. Add the unique index. If it fails there are duplicates — investigate, don't force.
5. Switch reads to `findBySource`; confirm index scan with `EXPLAIN`.
6. **Separate commit:** drop `metadata`, `type`, the enum. Irreversible.
