# 07 — The attention core

This is the product. Everything else is supporting machinery, and this document is
the one worth arguing about.

---

## 1. What an attention item actually is

_A thing that arrived, carrying tags, that the user has to decide about — and the
tags decide when._

Three kinds of data live on it, with three different owners:

| Data                                   | Owner                  | Written by                       |
| -------------------------------------- | ---------------------- | -------------------------------- |
| Source identity — _what is this about_ | the source context     | ingestion, once                  |
| Preview — title, body, who sent it     | the source context     | ingestion, every update          |
| `tagIds`                               | the source context     | ingestion, every update          |
| `status`                               | **contested** — see §6 | the user _and_ the source        |
| `dueDate`, `dueDatePinned`             | **attention**          | the due-date policy, or the user |
| `note`                                 | **attention**          | the user                         |

So it is **an aggregate with a projected slice inside it**, not a pure read model and
not a pure aggregate. → [ADR 0004](adr/0004-attention-as-projection-with-typed-source.md)

That framing matters because the owned slice is genuinely the product:
`dueDate`, `dueDatePinned` and `status` are decisions **no source context can make**.
A task does not know when the user intends to deal with it. A tag does.

---

## 2. What is wrong with it today

```
type            = tagged_message | incoming_email | slack_message | whatsapp_message
                | suggested_timeblock | suggested_task | task
metadata jsonb  = { type, messageId?, threadId?, taskId?, taskBatchId?, suggestionId?, ... }
```

- The `type` enum names the **source context**. Three of its seven values
  (`incoming_email`, `slack_message`, `whatsapp_message`) have **no producer** — which
  tells you the column is really an extension point wearing an enum's clothes.
- Source identity lives in untyped jsonb, retrieved by
  `metadata->>'messageId'`, `metadata->>'taskId'`, `metadata->>'taskBatchId'`,
  `metadata->>'suggestionId'` — **four query paths, no supporting index**.
- `upsertFromSource` hardcodes `type: "task"` for both tasks and batches.
- Three bespoke handlers (`message-attention`, `task-attention`,
  `tag-calendar-attention`) each know a different source's event shape and build a
  different metadata arm.
- Idempotency under redelivery is hand-rolled: `findBySuggestionId` pre-checks,
  `syncSourceStatus` skips unchanged, `upsertFromSource` branches on
  `existing.length === 0`.
- **The invariant is defended in the wrong place.** `dueDatePinned` — "the user set
  this date, do not move it" — is enforced by a `.filter()` inside
  `AttentionDueDateService.recomputeForItems`. A _service_ defending an _entity's_
  invariant. Any new recompute path that forgets the filter silently overwrites the
  user's choice.

**The cost of adding Gmail today:** a new enum value, a new arm on the
`AttentionItemMetadata` union, a new bespoke handler, a new `metadata->>'emailId'`
query path, and a new unindexed scan. Four channels in, there are eight jsonb probe
paths and an eight-armed union.

---

## 3. Typed source identity

```ts
// apps/migrations/src/schema/attention/attentionItems.ts
export const attentionItems = attention.table(
  "attention_items",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }), // the sanctioned exception

    // What needs attention. Replaces the `type` enum and every metadata->>'k' lookup.
    sourceContext: text("source_context").notNull(), // 'conversations' | 'tasks' | 'channels.gmail' | …
    sourceKind: text("source_kind").notNull(), // 'message' | 'task' | 'task_batch' | 'task_suggestion'
    sourceId: text("source_id").notNull(), // opaque to attention

    // Projected from the source. Display only — never queried by key.
    preview: jsonb("preview").$type<AttentionPreview>().notNull(),

    // Owned by attention.
    status: attentionItemStatus("status").notNull().default("created"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    dueDatePinned: boolean("due_date_pinned").notNull().default(false),
    dueSourceEventId: uuid("due_source_event_id"), // soft ref into `scheduling`
    note: text("note"),

    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_attention_items_source").on(
      t.userId,
      t.sourceContext,
      t.sourceKind,
      t.sourceId,
    ), // <<< the key change
    index("idx_attention_items_user_status")
      .on(t.userId, t.status)
      .where(sql`deleted_at IS NULL`),
    index("idx_attention_items_user_due_date")
      .on(t.userId, t.dueDate)
      .where(sql`deleted_at IS NULL AND status != 'resolved'`),
    index("idx_attention_items_due_source_event")
      .on(t.dueSourceEventId)
      .where(
        sql`deleted_at IS NULL AND status != 'resolved' AND due_source_event_id IS NOT NULL`,
      ),
  ],
);
```

**Why the three-part source rather than one channel enum.** `sourceContext` is _who_
is speaking and `sourceKind` is _what kind of thing_ it is. `tasks` alone produces
three kinds (`task`, `task_batch`, `task_suggestion`). Collapsing them into one enum
reproduces the current problem in a new column.

**Why `text` rather than an enum.** Adding a channel should not require a migration.
The set of source contexts is open by design — that is the whole point.

**What this deletes:**

- the `attention_item_type` pgEnum, including its three speculative values;
- the `AttentionItemMetadata` discriminated union;
- `findByMessageId`, `findByTaskId`, `findByTaskBatchId`, `findBySuggestionId` —
  four unindexed finders replaced by one `findBySource(source)` hitting a unique
  index;
- the hand-rolled idempotency, because the unique index makes
  `upsertFromSource` a real upsert.

`attention_item_tags` is unchanged, **including its deliberate missing FK on
`tag_id`** — ghost rows must survive tag deletion so the tag-deleted handler can find
affected items. Add a comment saying so, since it now looks like an oversight rather
than a decision.

---

## 4. Attention publishes the ingestion contract

This is the design move that makes growth cheap, and it inverts the current
direction.

Today each source publishes _its own_ event and attention has a bespoke handler per
source. That means every new channel edits attention.

Instead: **attention is the core domain, so attention publishes the language and
sources conform.** In Evans' terms, attention is an _Open Host Service_ with a
_Published Language_, and every source is a _Conformist_.

```ts
// attention/contract/attention-source.events.ts
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
    dueDate: z.string().nullable(), // non-null means explicit — it pins the item
    occurredAt: z.string(),
  }),
  delivery: DeliveryMode.Durable,
  groups: ["attention"],
});

export const AttentionSourceRemoved = defineEvent({
  name: "attention.source.removed",
  schema: z.object({
    userId: z.string(),
    source: z.object({ context: z.string(), kind: z.string(), id: z.string() }),
  }),
  delivery: DeliveryMode.Durable,
  groups: ["attention"],
});
```

Each source keeps publishing its own events for its own reasons — `task.upserted`
still feeds the `suggestion-sync` group — and **additionally** publishes the attention
contract from a thin outbound translator it owns:

```ts
// tasks/presentation/events/attention-projection.publisher.ts   <- Tasks' outbound ACL
@EventHandler(TaskUpserted, { group: "attention-projection" })
async onTask(p: EventOf<typeof TaskUpserted>): Promise<void> {
  await this.publisher.publish(AttentionSourceUpserted, {
    userId: p.assigneeUserId,
    source: { context: "tasks", kind: "task", id: p.taskId },
    preview: { title: p.title, body: null, actorLabel: null },
    tagIds: p.tagIds,
    status: mapTaskStatusToAttention(p.status),   // the translation lives HERE, in tasks
    dueDate: p.dueDatePinned ? p.dueDate : null,
    occurredAt: p.createdAt,
  });
}
```

Note where `mapTaskStatusToAttention` ends up. It currently sits in
`tasks/task-status.util.ts`, a _supporting_ context importing the _core_ context's
vocabulary. As an outbound translator it is exactly right: tasks speaks attention's
language at the boundary, on purpose.

**Attention then has three handlers. Forever.**

```
attention/presentation/events/attention-source.handler.ts   # upserted + removed, ALL sources
attention/presentation/events/tag-changed.handler.ts        # TagUpdated / TagDeleted → recompute
attention/presentation/events/calendar-changed.handler.ts   # CalendarEvent{Created,Updated,Deleted} → recompute
```

This deletes `message-attention.handler.ts` and `task-attention.handler.ts`, and folds
`tag-calendar-attention.handler.ts` into the two recompute handlers.

**Adding Gmail becomes: write `channels/gmail/`, publish `AttentionSourceUpserted`.
Attention changes zero lines.** That is the entire goal of this section.

---

## 5. The aggregate

```ts
// attention/domain/attention-item.ts
export class AttentionItem {
  private constructor(private readonly props: AttentionItemProps) {}

  /** Invariants: source triple all non-empty; userId non-empty. */
  static open(input: OpenAttentionItem): AttentionItem {
    /* ... */
  }
  static rehydrate(props: AttentionItemProps): AttentionItem {
    /* ... */
  }

  // ---- owned by attention ----

  /** created → in_progress → resolved (and back). Returns whether anything changed. */
  transitionTo(status: AttentionItemStatus, now: Date): boolean;

  /** The user chose a date. From now on the policy must not move it. */
  pinDueDate(dueDate: Date, now: Date): void;

  /** NO-OP when pinned. The invariant lives here, not in a service's .filter(). */
  applyDueDateDecision(decision: DueDateDecision, now: Date): boolean;

  annotate(note: string | null, now: Date): void;

  // ---- mirrored from the source ----

  applyMirror(
    m: {
      preview: AttentionPreview;
      tagIds: string[];
      status: AttentionItemStatus;
    },
    now: Date,
  ): boolean;

  belongsTo(userId: string): boolean;
  get isDeleted(): boolean;
  get needsDueDateRecompute(): boolean; // !pinned && !deleted && status !== "resolved"
}
```

Two details carry most of the value.

**`applyDueDateDecision` no-ops when pinned.** That moves the rule out of
`AttentionDueDateService.recomputeForItems`'s `.filter((i) => !i.dueDatePinned)` and
into the entity, where no future recompute path can forget it.

**The `boolean` returns.** The application layer publishes `attention.upserted` only
on a real change. Today `syncSourceContent` and `recomputeForItems` republish
unconditionally, so every calendar edit fans out websocket traffic for items that did
not move.

---

## 6. On `status`, and not over-modelling it

`status` is genuinely bidirectional today:

- inbound — a task moving to `completed` drives its attention item to `resolved`
  (`mapTaskStatusToAttention`);
- outbound — the user resolving a tagged-message item publishes
  `attention.message.synced`, which updates `messages.managed_status`.

The loop is broken carefully and correctly: `updateAttentionItem` publishes the
reverse-sync event **only** from the user-driven path, never from `syncSourceStatus`;
`applyManagedStatusFromAttention` returns early when already in sync; and
`syncSourceStatus` skips unchanged items. That is three independent idempotency
guards, and they work.

**Do not replace this with something cleverer.** Keep last-writer-wins. Keep the
outbound event. The only improvement is that both writers now go through
`AttentionItem` methods — `applyMirror` for the source, `transitionTo` for the user —
so the two paths are visible in one file instead of spread across three handlers and a
service.

This is a case where the pragmatic answer is _"the existing design is right, just put
it somewhere findable."_

---

## 7. The tag → due-date policy, as a pure policy

The product's central rule. Currently a private method on a DI-injected service
([`attention-due-date.service.ts:75-102`](../../apps/api/src/attention-items/attention-due-date.service.ts)).
It splits three ways.

### (a) The pure policy — zero dependencies

```ts
// attention/domain/due-date.policy.ts
export type AnswerModeSpec =
  | { tagId: string; type: "immediately"; responseTimeMillis: number }
  | { tagId: string; type: "timeblock" };

export type TimeblockOccurrence = { startAt: Date; eventId: string };
export type DueDateDecision = {
  dueDate: Date | null;
  dueSourceEventId: string | null;
};

/**
 * Earliest wins.
 *   immediate tags → base + responseTimeMillis
 *   timeblock tags → the next upcoming occurrence of an event carrying that tag
 * Ties keep the first candidate.
 */
export function decideDueDate(input: {
  answerModes: readonly AnswerModeSpec[];
  occurrences: ReadonlyMap<string, TimeblockOccurrence>;
  base: Date;
}): DueDateDecision {
  let dueDate: Date | null = null;
  let dueSourceEventId: string | null = null;

  for (const mode of input.answerModes) {
    if (mode.type === "immediately") {
      const candidate = new Date(
        input.base.getTime() + mode.responseTimeMillis,
      );
      if (!dueDate || candidate < dueDate) {
        dueDate = candidate;
        dueSourceEventId = null;
      }
    } else {
      const occurrence = input.occurrences.get(mode.tagId);
      if (occurrence && (!dueDate || occurrence.startAt < dueDate)) {
        dueDate = occurrence.startAt;
        dueSourceEventId = occurrence.eventId;
      }
    }
  }
  return { dueDate, dueSourceEventId };
}
```

Roughly 25 lines. No `@Injectable()`, no repositories, no clock. **This should be the
first `.spec.ts` in the repository** — immediate wins, timeblock wins, mixed tie,
no tags, timeblock with no upcoming occurrence.

### (b) Two inbound ports, declared by attention in _its_ language

```ts
// attention/domain/ports/tag-answer-mode.port.ts
export abstract class TagAnswerModePort {
  abstract getAnswerModes(tagIds: string[]): Promise<AnswerModeSpec[]>;
}

// attention/domain/ports/timeblock-occurrence.port.ts
export abstract class TimeblockOccurrencePort {
  abstract findNextOccurrenceByTag(
    tagIds: string[],
    after: Date,
  ): Promise<Map<string, TimeblockOccurrence>>;
}
```

Attention declares what it needs, in types it owns. It never learns what a `Tag` or a
`CalendarEvent` is.

### (c) Bindings — no adapter classes needed

```ts
// attention.module.ts
{ provide: TagAnswerModePort,       useExisting: TagCatalogPort },        // tagging/contract
{ provide: TimeblockOccurrencePort, useExisting: CalendarOccurrencePort },// scheduling/contract
```

When the published contract already matches the port shape, `useExisting` is the whole
adapter. Write a translator class only when translation is actually required.

### The application service is now trivial

```ts
// attention/application/recompute-due-dates.usecase.ts
@Injectable()
export class RecomputeDueDatesUseCase {
  constructor(
    private readonly repo: AttentionItemsRepository,
    private readonly answerModes: TagAnswerModePort,
    private readonly occurrences: TimeblockOccurrencePort,
    private readonly events: EventsPublisher,
    private readonly clock: Clock,
  ) {}

  @Transactional()
  async execute(items: AttentionItem[]): Promise<void> {
    const candidates = items.filter((i) => i.needsDueDateRecompute);
    if (candidates.length === 0) return;

    const now = this.clock.now();
    const tagIds = [...new Set(candidates.flatMap((i) => i.tagIds))];
    const modes = await this.answerModes.getAnswerModes(tagIds);
    const occurrences = await this.occurrences.findNextOccurrenceByTag(
      modes.filter((m) => m.type === "timeblock").map((m) => m.tagId),
      now,
    );

    for (const item of candidates) {
      const decision = decideDueDate({
        answerModes: modes.filter((m) => item.tagIds.includes(m.tagId)),
        occurrences,
        base: item.createdAt,
      });
      if (item.applyDueDateDecision(decision, now)) {
        // no-ops when pinned
        await this.repo.save(item);
        await this.events.publish(AttentionItemUpserted, {
          item: toResponse(item),
        });
      }
    }
  }
}
```

Orchestration only. The rule is in the policy; the invariant is in the entity.

---

## 8. The timeblock lookup leaves attention

`attention-items.repository.ts:355-423` — the CTE with
`CROSS JOIN LATERAL rrule.between(...)` — moves **verbatim** into
`scheduling/infrastructure/persistence/occurrence.query.ts`, implementing
`CalendarOccurrencePort`.

Not a shuffle. Four reasons it belongs there:

1. It duplicates recurrence expansion that already exists as pure TypeScript in
   `recurrence.utils.ts`. Same context means one owner, and eventually one
   implementation.
2. The `NOT EXISTS (SELECT 1 FROM calendar_event_exceptions …)` clause is a
   **calendar rule** — a detached or cancelled occurrence does not count. Attention
   should not know that rule exists.
3. The hardcoded 365-day horizon is a calendar policy knob.
4. `calendar-events.integration.test.ts` already covers recurrence, so the SQL lands
   next to its safety net.

Under schema-per-context this stops being a preference: the query names three
`scheduling` tables and simply cannot live in `attention` any more.

---

## 9. Designed-in growth

| Planned feature                 | Cost after this design                                                                                                                     | What to do _now_                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gmail / Slack / WhatsApp**    | A `channels/<provider>/` context publishing `AttentionSourceUpserted` with `source.context = "channels.gmail"`. **Attention: zero lines.** | Nothing beyond the `source_*` columns and the generic event. Do **not** create `channels/` speculatively.                                                                                                 |
| **Gamification**                | A `momentum/` context consuming `attention.item.resolved` and `timer.lifecycle`, owning its own tables.                                    | **Publish `attention.item.resolved { userId, itemId, resolvedAt, dueDate, wasOverdue }` now.** Six lines, and it means the history exists when you want it — instead of needing a backfill you cannot do. |
| **Calendar analytics**          | An `insights` context with projections from `scheduling.*`, `focus.*` and `attention.*` events.                                            | Nothing. Do **not** repurpose the outbox as an event log; add the retention job and build a real `event_log` if and when needed.                                                                          |
| **AI planning agents**          | An agent is an **actor** issuing the same commands through the same application services.                                                  | Make every application service take `Actor`, never a bare `userId: string`, and leave the `Actor` union open. **Free today, expensive to retrofit.**                                                      |
| **Agents querying the network** | `network/contract/connection-policy.port.ts` — which is being built anyway.                                                                | Nothing extra.                                                                                                                                                                                            |

The AI row is the one worth dwelling on. If the application layer is the only way into
the system, an agent inherits every invariant, every authorization check and every
event for free. If business rules stay scattered across controllers, services and
gateways — as they are today, where REST and WebSocket already disagree about guest
capabilities — then every agent integration re-implements them, slightly differently.

---

## 10. The migration

The one genuinely risky step in the whole plan, because it rewrites live rows.

1. **Add the new columns nullable**, keep `type` and `metadata`. No behaviour change.
2. **Backfill** from `metadata` — a deterministic mapping per old `type`:
   `tagged_message → ('conversations','message', metadata->>'messageId')`,
   `task → ('tasks', 'task'|'task_batch', ...)`,
   `suggested_task → ('tasks','task_suggestion', metadata->>'suggestionId')`.
3. **Verify**: row counts per old `type` must equal counts per new
   `(source_context, source_kind)`; zero nulls in the new columns.
4. **Add the unique index.** If it fails, there are duplicate source rows —
   investigate rather than force it.
5. **Switch reads** to `findBySource`. Confirm with `EXPLAIN` that it is an index
   scan.
6. **Drop** `metadata`, `type`, and the `attention_item_type` enum.

Steps 1–4 are reversible. Step 6 is not — which is fine under the MVP policy in
`CLAUDE.md`, but should be a separate commit from step 5 so the switch can be reverted
on its own.

---

Next: [08-roadmap.md](08-roadmap.md) — the order to do all of this in.
