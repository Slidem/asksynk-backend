# 04 — Integration between contexts

Four ways for one context to reach another. Pick deliberately.

## 1. Mechanisms

|         | Mechanism                                 | Use when                                                                                        | Consistency                                                            |
| ------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **(a)** | Sync call to `<other>/contract/*.port.ts` | You need an authoritative fact **now** to make _your_ decision (ownership, existence, liveness) | Strong — joins the caller's tx via re-entrant `@Transactional()`       |
| **(b)** | Domain event via the outbox               | **You** decided something others care about. Mandatory for any write to a table you don't own   | Eventual, ordered per key within a consumer group; handlers idempotent |
| **(c)** | A projection you own                      | You repeatedly need another context's data for _your_ queries. Built by (b)                     | Eventual                                                               |
| **(d)** | ACL translator                            | The other side speaks a different language or is external (Google, Gmail, Slack)                | n/a                                                                    |

When (a) and (b) both fit, prefer (b) — it keeps the write side independent.

### Hard rules

1. Never import another context's repository.
2. Never write to a table you don't own — publish an event.
3. A `@Module`'s `exports` contain only classes declared under `contract/`.
4. No JOIN across contexts and no cross-context DB view. Use (c), or a port on the owner.
5. Jobs are not a fifth mechanism: `JobScheduler` / `@CronJob` are for a context's
   _own_ deferred work. To make another context act, publish an event.
6. Errors cross unchanged: a context throws only from its own catalog; callers let a
   port's `DomainError` propagate (codes are already namespaced and registered).
7. Prefer `useExisting` over an adapter class when a published port already matches.

---

## 2. Current violations and their fix

Grouped by fix. Numbers from [01 §3](01-current-state.md#3-what-is-still-wrong).

### A — dissolved by the `scheduling` merge (Wave 2.2)

`calendar-integrations → calendar-events`: 7 repository imports
(`calendar-sync.service`, `calendar-integration.service`,
`calendar-outbound-sync.service`, `sync/calendar-sync.job-handlers`) + 8 others
(`Calendar`, `CalendarEvent`, `utcToIso`, `parseIsoWallClockInTimezone`, module).
All become intra-context. `applyFields(event, fields)` in `calendar-sync.service.ts`
becomes `event.applyProviderFields(fields)` (Wave 5).

### B — `tagging` publishes a contract (Wave 2.1)

| Today                                                                                            | Becomes                                |
| ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `attention-due-date.service`, `tag-calendar-attention.handler` → `TagRepository`, `Tag`          | `getAnswerModes`                       |
| `attention-items.module`, `calendar-events.module` provide `TagRepository`                       | deleted                                |
| `calendar-events.service` → `TagRepository`                                                      | `assertOwnedBy`                        |
| `tasks.service`, `task-batches.service`, `task-suggestions.service`, `messaging` → `TagsService` | `assertOwnedBy`                        |
| `attention-items.repository` joins `tags` (6×)                                                   | answer modes via port, or tag ids only |

```ts
// tagging/contract/tag-catalog.port.ts
export type AnswerModeSpec =
  | { tagId: string; type: "immediately"; responseTimeMillis: number }
  | { tagId: string; type: "timeblock" };

export abstract class TagCatalogPort {
  abstract assertOwnedBy(userId: string, tagIds: string[]): Promise<void>;
  abstract getAnswerModes(tagIds: string[]): Promise<AnswerModeSpec[]>;
}
```

`TaggingModule` exports only `TagCatalogPort`. Nobody outside tagging loads a `Tag`.

```bash
grep -rn "TagRepository" apps/api/src | grep -v "^apps/api/src/tagging/"   # must be empty
```

### C — raw cross-context SQL (Wave 2.3)

`attention-items.repository.ts:355-423` (rrule CTE over three calendar tables) moves
**verbatim** to `scheduling/infrastructure/persistence/occurrence.query.ts`:

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

The `calendar_event_exceptions` check and the 365-day horizon are calendar rules;
recurrence gets one owner. Same treatment for `messaging.repository.ts:446-497`
(joins users / public views / network) and `public-view-guests.repository.ts`
(counts `messages`): each becomes a port on the owning context.

### D — inverted dependencies (Waves 1.1, 2.6)

| Violation                                                                    | Fix                                                                                           |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `auth` → `PublicViewGuestsRepository`, `hashGuestToken`, `PublicViewsModule` | `identity` declares `GuestIdentityProvider`; `sharing` registers at bootstrap                 |
| `messaging.service` → `PublicViewsRepository`                                | `sharing/contract/public-link.port.ts` → `isLive(publicViewId): Promise<boolean>`             |
| `tasks/task-status.util` → `AttentionItemStatus`                             | batch status derived in tasks' own terms (1.3); translation becomes tasks' outbound ACL (6.2) |

```ts
// identity/contract/guest-identity.provider.ts
export abstract class GuestIdentityProvider {
  abstract validateToken(token: string): Promise<GuestPrincipal | null>;
}
```

### E — `files` and `network` publish contracts (Waves 2.4, 2.5)

| Today                                                                                                                 | Becomes                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `message-attachment.resolver` → `AttachmentsRepository`, `AttachmentAccessService`, `Attachment`                      | `AttachmentCatalogPort.getSummaries(ids)`                                        |
| `user-profile.service` → `AttachmentsRepository`, `AttachmentsService`, `Attachment`                                  | `AttachmentCatalogPort.assertUsable(id, …)` — the files rule moves back to files |
| `threads.controller`, `guest-messaging.controller`, `message-attachments.helper`, `ws.gateway` → `AttachmentsService` | `AttachmentCatalogPort.resolveMany(ids)`                                         |
| `messaging`, `tasks`, `tags`, `calendar-events` → `NetworksService`                                                   | `ConnectionPolicyPort`                                                           |
| `calendar-events.controller`, `tags.controller` call `resolveTargetUserId`                                            | application layer, using `Actor`                                                 |

`StorageModule` stops being `@Global` and exporting its repository.

### F — the WebSocket gateway inverts (Wave 4)

`ws.gateway.ts` imports `MessagingService`, `AttachmentsService`,
`TaskSuggestionPayload`, `MANAGED_MESSAGE_STATUSES`, `MessageResponseDto`,
`MAX_ATTACHMENTS_PER_MESSAGE`, `toAttachmentResponse`. After Wave 4 it imports no
feature code. Design: [03 §6](03-layering.md#6-wsgatewayts-split-wave-4).

### G — stays, deliberately

| Edge                                   | Why                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `messaging → TaskSuggestionsService`   | Same-transaction command: a message can embed a suggestion; both commit together. Publish it as `tasks/contract/task-suggestion.port.ts` |
| `attention_item_tags.tag_id` has no FK | Ghost rows must survive tag deletion so the tag-deleted handler finds them                                                               |
| `AttachmentAccessService.register()`   | The pattern to copy                                                                                                                      |
| Auth decorators used by controllers    | `@Public`, `@AllowGuest`, `@RequestActor` are transport helpers; they stay importable                                                    |

---

## 3. `Actor`

One identity shape for HTTP and WS (`@RequestActor()`, `WsAuthService`); still to
replace the ad-hoc `AuthGuest` handling in messaging.

```ts
// kernel/actor/actor.ts
export type Actor =
  | { kind: "user"; userId: string; email: string }
  | {
      kind: "guest";
      guestId: string;
      publicViewId: string;
      ownerUserId: string;
      displayName: string;
      expiresAt: Date;
    };
// later: | { kind: "agent"; agentId: string; onBehalfOfUserId: string }

export const ownerUserIdOf = (a: Actor): string =>
  a.kind === "guest" ? a.ownerUserId : a.userId;
```

It collapses messaging's `X` / `guestX` pairs (4.3), moves guest capability rules from the gateway into the application layer
(so REST gets them too), and is the seam for AI agents.

**Rule:** new and touched application methods take `Actor`, not `userId: string`.

## 4. Event catalogue moves home (Wave 8.1)

`platform/events/registry/events.registry.ts` (20 events) splits into
`<ctx>/contract/<ctx>.events.ts`. `defineEvent` and the types stay in
`platform/events/registry/`. Safe: the dispatcher and consumers work off outbox rows
and `@EventHandler` metadata, never a central import. Removes the
`AttentionItemUpserted` ↔ `AttentionItemResponse` duplicate.

## 5. Worked example — tagging a message, after the refactor

```
1. ws/rest      conversations/presentation  → command
2. use case     conversations/application/tag-message.usecase.ts  @Transactional()
                ├─ (a) tagCatalog.assertOwnedBy(ownerUserIdOf(actor), tagIds)
                ├─ message.retag(tagIds); repo.save(message)
                └─ (b) publish(MessageUpdated)                 → outbox, same tx
3. COMMIT
4. durable      tasks/conversations outbound ACL → AttentionSourceUpserted
                attention handler → ingest use case
                ├─ (a) tagCatalog.getAnswerModes(tagIds)
                ├─ (a) occurrences.findNextOccurrenceByTag(...)
                ├─ decideDueDate(...)                           ← pure policy
                └─ (b) publish(AttentionItemUpserted)
5. realtime     attention/presentation/ws broadcaster → RealtimeBroadcaster.toUser
```

No repository crosses a boundary; the one real rule is a pure function.
