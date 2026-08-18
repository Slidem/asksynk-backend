# 05 — Integration between contexts

Four ways for one context to reach another. Pick deliberately; the wrong one is how
boundaries rot.

---

## 1. The decision table

|         | Mechanism                                     | Use when                                                                                                                                                                               | Consistency                                                                    | Cost                                    |
| ------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------- |
| **(a)** | **Sync call to `<other>/contract/*.port.ts`** | You need an authoritative answer **now** to validate or decide, the answer is small, you are mid-request. Typically: authorization, existence checks, "give me these ids' attributes". | Strong — joins the caller's transaction through `@Transactional()` re-entrancy | One abstract class + one binding        |
| **(b)** | **Domain event via the existing outbox**      | Something **happened** and other contexts should react. **Mandatory** for anything that would write to a table you do not own.                                                         | Eventual; handler must be idempotent                                           | One `defineEvent` + one `@EventHandler` |
| **(c)** | **A projection you own**                      | You repeatedly need another context's data to answer _your_ queries, and joining live would penetrate the boundary. Built by (b).                                                      | Eventual                                                                       | A table + handlers + a backfill         |
| **(d)** | **ACL translator**                            | The other side speaks a different language, or is **external** (Google, Gmail, Slack)                                                                                                  | n/a                                                                            | One adapter class                       |

### Hard rules

1. **Never import another context's repository.** This is what all 16 current
   violations do.
2. **Never write to a table you do not own.** Publish an event instead.
3. **A `@Module`'s `exports` may contain only classes declared under `contract/`.**
   This one rule prevents the whole class of problem mechanically — and it is why the
   current situation exists: `MessagingModule` exports `MessagingRepository`,
   `CalendarEventsModule` exports two repositories, and `TagsModule` exports
   _nothing_, which is why `TagRepository` gets re-provided four times. All three are
   the same bug.
4. **Need a JOIN across contexts?** Use (c), or a port method inside the _owning_
   context. Never a cross-context database view — a view is a JOIN with a nicer name,
   and it is invisible to the boundary linter.
5. **Prefer `useExisting` over writing an adapter class** when the port shape already
   matches the other context's contract. Write a (d) translator only when you must
   actually translate.

### Choosing between (a) and (b)

The question is not "sync or async". It is **who owns the decision**.

- If you need a _fact_ to make **your** decision → (a). "Is this tag owned by this
  user?" "Is this public link still live?"
- If **you** made a decision others care about → (b). "A message was sent." "A task
  changed status."

When both seem to fit, prefer (b). It is the only one that keeps the write side
independent.

---

## 2. Every current violation, resolved

All **16 cross-module repository imports** and all **19 cross-module service imports**,
plus the structural offenders. Grouped by fix rather than by edge, so each group is one
piece of work.

| Group     | Fix                                     | Repo imports | Service imports |
| --------- | --------------------------------------- | -----------: | --------------: |
| A         | dissolved by the `scheduling` merge     |            7 |               0 |
| B         | `tagging` publishes a contract          |            5 |               4 |
| C         | the raw cross-context SQL               |            — |               — |
| D         | inverted dependencies (incl. `sharing`) |            2 |               1 |
| E         | `files` and `network` publish contracts |            2 |              11 |
| G         | the WebSocket gateway inverts           |            0 |               3 |
| **Total** |                                         |       **16** |          **19** |

(Group F is a controller-layer fix with no imports of its own; Group H is the set that
deliberately stays.)

### Group A — dissolved by the `scheduling` merge

| File                                                               | Imports                                          | Becomes            |
| ------------------------------------------------------------------ | ------------------------------------------------ | ------------------ |
| `calendar-integrations/services/calendar-sync.service.ts`          | `CalendarRepository`, `CalendarEventsRepository` | intra-context call |
| `calendar-integrations/services/calendar-integration.service.ts`   | `CalendarRepository`, `CalendarEventsRepository` | intra-context call |
| `calendar-integrations/services/calendar-outbound-sync.service.ts` | `CalendarRepository`, `CalendarEventsRepository` | intra-context call |
| `calendar-integrations/sync/calendar-sync.scheduler.ts`            | `CalendarRepository`                             | intra-context call |

Plus the 8 non-repository imports on the same edge (`Calendar`, `CalendarEvent`,
`utcToIso`, `parseIsoWallClockInTimezone`, the module import).

**The single largest coupling reduction in the plan, and it is a file move.**
`calendar-sync.service.ts:283` currently does `applyFields(event, fields)` — mutating
another module's entity field by field from outside. That is not two contexts; it is
one context with a folder in the way. → [ADR 0003](adr/0003-merge-calendar-events-and-calendar-integrations.md)

### Group B — `tagging` publishes a contract

| File                                                         | Imports                  | Becomes                 |
| ------------------------------------------------------------ | ------------------------ | ----------------------- |
| `attention-items/attention-due-date.service.ts`              | `TagRepository`, `Tag`   | `TagAnswerModePort` (a) |
| `attention-items/handlers/tag-calendar-attention.handler.ts` | `TagRepository`          | `TagAnswerModePort` (a) |
| `attention-items/attention-items.module.ts`                  | provides `TagRepository` | **deleted**             |
| `calendar-events/services/calendar-events.service.ts`        | `TagRepository`          | `TagOwnershipPort` (a)  |
| `calendar-events/calendar-events.module.ts`                  | provides `TagRepository` | **deleted**             |
| `messaging`, `tasks` ×3                                      | `TagsService`            | `TagOwnershipPort` (a)  |

```ts
// tagging/contract/tag-catalog.port.ts
export abstract class TagCatalogPort {
  /** Throws if any tag is not owned by this user. Logic already exists as TagsService.assertOwnedBy. */
  abstract assertOwnedBy(userId: string, tagIds: string[]): Promise<void>;
  /** The answer-mode policy for these tags. Attention's only need. */
  abstract getAnswerModes(tagIds: string[]): Promise<AnswerModeSpec[]>;
}
```

`TaggingModule` exports **only** `TagCatalogPort`. `TagRepository` is provided once.

**Nobody outside `tagging` ever loads a `Tag` entity again.** Other contexts hold a
`TagId` and, where they need the policy, receive an `AnswerModeSpec` — a projection of
the tag, not the tag.

Verification for this step is a one-liner:

```bash
grep -rn "TagRepository" apps/api/src | grep -v "^apps/api/src/tagging/"   # must be empty
```

### Group C — the raw cross-context SQL (no imports at all, and the worst one)

`attention-items.repository.ts:355-423` — the `WITH non_recurring / recurring /
combined` CTE with `CROSS JOIN LATERAL rrule.between(...)`, reading
`calendar_events`, `calendar_event_tags` and `calendar_event_exceptions`.

**Moves verbatim** to `scheduling/infrastructure/persistence/occurrence.query.ts`,
implementing a published port:

```ts
// scheduling/contract/occurrence.port.ts
export type NextOccurrence = { startAt: Date; eventId: string };

export abstract class CalendarOccurrencePort {
  abstract findNextOccurrenceByTag(
    tagIds: string[],
    after: Date,
  ): Promise<Map<string, NextOccurrence>>;
}
```

Why `scheduling` is the right home rather than just a shuffle:

- It duplicates recurrence expansion that already exists as pure TypeScript in
  `recurrence.utils.ts`. Same context means one owner, and eventually one
  implementation.
- The `NOT EXISTS (SELECT 1 FROM calendar_event_exceptions …)` clause is a **calendar
  rule** — a detached or cancelled occurrence does not count. Attention should not
  know that rule exists.
- The hardcoded 365-day window is a calendar policy knob.
- `calendar-events.integration.test.ts` already covers recurrence, so the SQL lands
  next to its safety net.

Afterwards, `attention`'s repository touches `attention_items` and
`attention_item_tags` and nothing else. **Under schema-per-context this stops being
optional** — the query would otherwise cross schemas.

### Group D — inverted dependencies

| Violation                                                                                           | Fix                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth/guest-auth.service.ts` → `PublicViewGuestsRepository`, `auth.module.ts` → `PublicViewsModule` | **Invert.** `identity` declares `GuestIdentityProvider`; `sharing` registers into it at bootstrap.                                                                             |
| `messaging/services/messaging.service.ts` → `PublicViewsRepository`                                 | `sharing/contract/public-link.port.ts` → `isLive(publicViewId): Promise<boolean>`. The call site only uses `view.isLive()`, so the port returns a boolean, never an aggregate. |
| `common/decorators/*` → `calendar-events/utils/recurrence.utils`                                    | **Move down.** `isIsoDateWithOffset` / `isValidIanaTimezone` are pure predicates, not calendar domain → `kernel/time/iso.ts`.                                                  |
| `auth/auth.guard.ts:16` → `CalendarEventsRepository` (logger name only)                             | **Delete.** `new ContextLogger(AuthGuard.name)`. Five minutes.                                                                                                                 |
| `messaging/services/messaging.service.ts:3` → `WsIdentity` from `src/websockets/…`                  | **Kernel VO.** Becomes `Actor` — see §3.                                                                                                                                       |

```ts
// identity/contract/guest-identity.provider.ts
export abstract class GuestIdentityProvider {
  abstract validateToken(token: string): Promise<GuestPrincipal | null>;
}
```

`sharing` binds itself to this at bootstrap, exactly as
`MessageAttachmentResolver` already does with `AttachmentAccessService`. The auth
guard depends on a port it owns; `identity` no longer imports a feature module.

> **Alternative considered:** move `public_view_guests` into `identity` outright,
> since guest session _minting_ and guest session _verification_ are arguably the same
> concern. It is a defensible call. The registration approach is chosen because it
> reuses a pattern already proven in this codebase and touches far less code — and it
> can be upgraded later without changing any consumer.

### Group E — `files` and `network` publish contracts

| File                                                                                                     | Imports                                                          | Becomes                                             |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `messaging/attachments/message-attachment.resolver.ts`                                                   | `AttachmentsRepository`, `AttachmentAccessService`, `Attachment` | `AttachmentCatalogPort.getSummaries(ids)` (a)       |
| `user-profile/services/user-profile.service.ts`                                                          | `AttachmentsRepository`, `AttachmentsService`, `Attachment`      | `AttachmentCatalogPort.assertUsable(id, {...})` (a) |
| `messaging/rest/threads.controller.ts`, `guest-messaging.controller.ts`, `message-attachments.helper.ts` | `AttachmentsService`                                             | `AttachmentCatalogPort.resolveMany(ids)` (a)        |
| `messaging`, `tasks` ×1, `tags`, `calendar-events`                                                       | `NetworksService`                                                | `ConnectionPolicyPort` (a)                          |

Note the direction of travel on the two `assert` methods. Today
`user-profile.service.ts` loads an `Attachment` and checks owned/public/active
_itself_ — a `files` rule enforced in `identity`. `assertUsable` pushes that rule back
into `files` where it belongs. Conversely, `assertLinkable` (may this message carry
this attachment) **stays in conversations**, because that is a conversations rule.

### Group F — authorization decided in controllers (2)

`calendar-events.controller.ts:95` and `tags.controller.ts:63` both inject
`NetworksService` to call `resolveTargetUserId(actor, query.userId)` before
delegating.

That decision — _whose data is this actor allowed to read_ — is neither transport nor
network. It reads the actor's shape (guest vs user, and a guest's owner) and _then_
consults the connection graph. It becomes an application-layer concern backed by a
param decorator:

```ts
// kernel/actor.ts
export const ownerUserIdOf = (a: Actor): string =>
  a.kind === "guest" ? a.ownerUserId : a.userId;
```

Controllers stop injecting a service to work out whose data they are touching.

### Group G — the WebSocket gateway inverts

`ws.gateway.ts` imports `MessagingService`, `AttachmentsService`,
`TaskSuggestionPayload`, `MANAGED_MESSAGE_STATUSES`, `MessageResponseDto`, plus a
non-aliased `src/messaging/...` constant.

**Inverted.** Contexts push to a `RealtimeBroadcaster` port that the transport
implements; the transport imports zero feature code. Inbound commands move into the
owning context's gateway. Full design in
[04-layering.md §5](04-layering.md).

A technical fact that makes this work: **Nest supports multiple `@WebSocketGateway()`
classes on the same namespace.** They share the socket.io server and the same `socket`
object, so `socket.data.actor` set during connection is visible in every context's
gateway.

### Group H — stays as it is, deliberately

| Edge                                         | Why it stays                                                                                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `messaging` → `TaskSuggestionsService`       | A genuine same-transaction command: sending a message can embed a task suggestion, and both must commit together. This is exactly what mechanism (a) is for. It only needs _publishing_ — `work/contract/task-suggestion.port.ts` — not removing. |
| `attention_item_tags.tag_id` has no FK       | Deliberate. Ghost rows must survive tag deletion so the tag-deleted handler can find affected items. Add a comment saying so.                                                                                                                     |
| The outbox / dispatcher / consumer machinery | The strongest code in the repo. Only the _registry file_ is split.                                                                                                                                                                                |
| `AttachmentAccessService.register()`         | The pattern to copy, not fix.                                                                                                                                                                                                                     |

---

## 3. `Actor` — one value object that removes a lot of duplication

Three different representations of "who is doing this" exist today: `RequestActor`
(auth), `WsIdentity` (websockets), and `AuthGuest`. `messaging` handles the fork by
duplicating **17 public methods** into `X` / `guestX` pairs.

```ts
// kernel/actor.ts
export type Actor =
  | { kind: "user"; userId: string; email: string }
  | {
      kind: "guest";
      guestId: string;
      publicViewId: string;
      ownerUserId: string;
      expiresAt: Date;
    };
// later: | { kind: "agent"; agentId: string; onBehalfOfUserId: string }

export const ownerUserIdOf = (a: Actor): string =>
  a.kind === "guest" ? a.ownerUserId : a.userId;
export const isUser = (a: Actor): a is Extract<Actor, { kind: "user" }> =>
  a.kind === "user";
```

This single type:

- collapses `listThreadMessages`/`listGuestThreadMessages`,
  `sendAsUser`/`sendAsGuest`, `tagMessage`/`tagMessageAsGuest`,
  `getThreadStats`/`getGuestThreadStats` and the rest — **17 methods to roughly 8**;
- removes the `WsIdentity` feature → transport import;
- moves the guest capability rules (_"Guests cannot attach files"_, _"Guests cannot
  suggest tasks"_, _"guests cannot update status"_) out of `ws.gateway.ts` and into
  the application layer — where **REST gets them too**. Today REST and WebSocket can
  disagree about them;
- **is the seam where AI agents plug in.** An agent acting for a user is a third
  variant of `Actor`, not a new code path.

**Rule that follows:** application services take `Actor`, never a bare
`userId: string`. It is free to adopt now and expensive to retrofit later.

---

## 4. The event catalogue moves home

`packages/shared/src/event-registry/events.registry.ts` (347 lines, 24 events) splits
into per-context files:

```
tagging/contract/tagging.events.ts
scheduling/contract/scheduling.events.ts
conversations/contract/conversations.events.ts
tasks/contract/tasks.events.ts
focus/contract/focus.events.ts
attention/contract/attention.events.ts
```

`defineEvent`, `DeliveryMode` and the registry types **stay in `packages/shared`** —
that is infrastructure, and it is fine there.

This is safe because neither runtime component needs the central file: the dispatcher
works off database rows, and the consumer works off decorator metadata gathered at
bootstrap. It also removes the `AttentionItemUpserted` ↔ `AttentionItemResponse` zod
duplication, because the event definition ends up next to the response DTO instead of
in a different package.

**Delete while doing this:** `tag.created` (no publisher, no consumer) and the
`email` delivery group on `tag.created` / `tag.updated` (no handler anywhere, yet the
dispatcher still creates the queue and enqueues jobs into it).

---

## 5. Worked example: what a clean cross-context flow looks like

Tagging a message, end to end, after the refactor.

```
1. transport            conversations/presentation/ws/conversations.gateway.ts
                        @SubscribeMessage("message.tag") -> validate DTO -> command

2. use case             conversations/application/tag-message.usecase.ts
                        @Transactional()
                        ├─ (a) tagCatalog.assertOwnedBy(ownerUserIdOf(actor), tagIds)   -> tagging/contract
                        ├─ message.retag(tagIds)                                        -> own aggregate, own rule
                        ├─ repo.save(message)                                           -> own port
                        └─ (b) events.publish(MessageUpdated, ...)                      -> outbox, joins the tx

3. COMMIT               the outbox row and the message commit together

4. durable leg          attention/presentation/events/attention-source.handler.ts
                        -> ingest use case
                        ├─ (a) tagAnswerModes.getAnswerModes(tagIds)          -> tagging/contract
                        ├─ (a) occurrences.findNextOccurrenceByTag(...)       -> scheduling/contract
                        ├─ decideDueDate(...)                                 -> PURE domain policy
                        ├─ item.applyMirror(...) / item.applyDueDateDecision(...)
                        └─ (b) events.publish(AttentionItemUpserted, ...)

5. realtime leg         attention/presentation/ws/attention.broadcaster.ts
                        -> RealtimeBroadcaster.toUser(...)
```

Every arrow is one of the four mechanisms. No repository crosses a boundary. The one
piece of real business logic — `decideDueDate` — is a pure function with a unit test.

Compare with today, where step 4 loads `Tag` entities through a duplicated
`TagRepository` instance and runs raw SQL against three tables it does not own.

---

Next: [06-persistence.md](06-persistence.md) — schemas, foreign keys, and what a
repository returns.
