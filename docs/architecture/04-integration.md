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

## 2. Published contracts

Every cross-context call goes through one of these (mechanism (a)); each module exports
only its `contract/` classes, bound `useExisting` / `useClass` to the implementation.

| Port (file under `<ctx>/contract/`)                          | Methods                                                                                               | Callers                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `tagging/…/tag-catalog.port.ts` `TagCatalogPort`             | `assertOwnedBy`, `getAnswerModes`                                                                     | attention, scheduling, tasks, conversations |
| `scheduling/…/occurrence.port.ts` `CalendarOccurrencePort`   | `findNextOccurrenceByTag` (impl `scheduling/infrastructure/persistence/calendar-occurrence.query.ts`) | attention                                   |
| `files/…/attachment-catalog.port.ts` `AttachmentCatalogPort` | `assertUsable`, `resolveMany`                                                                         | conversations, user-profile                 |
| `files/…/attachment-access.port.ts` `AttachmentAccessPort`   | `register(resolver)` — owners plug in read permission                                                 | conversations                               |
| `network/…/connection-policy.port.ts` `ConnectionPolicyPort` | `areConnected`, `connectedAmong`, `assertConnected`, `resolveTargetUserId`                            | conversations, tasks, tagging, scheduling   |
| `sharing/…/public-link.port.ts` `PublicLinkPort`             | `isLive`, `getLinkSummaries`, `getGuestSummaries`                                                     | conversations                               |
| `auth/…/guest-identity.provider.ts` `GuestIdentityRegistry`  | `register(provider)` — sharing registers at bootstrap (auth never imports sharing)                    | sharing                                     |
| `auth/…/actor-authenticator.port.ts` `ActorAuthenticator`    | `authenticate(headers) → Actor \| null`                                                               | websockets                                  |
| `tasks/…/task-suggestion.port.ts` `TaskSuggestionPort`       | `suggest` — same-transaction command                                                                  | conversations                               |

Public value types: `attention/contract/attention-item-status.public.ts`
(`AttentionItemStatus`, used by tasks' attention-projection mapper).

### Stays, deliberately

| Edge                                   | Why                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `conversations → TaskSuggestionPort`   | Same-transaction command: a message can embed a suggestion; both commit together         |
| `attention_item_tags.tag_id` has no FK | Ghost rows must survive tag deletion so the tag-deleted handler finds them               |
| `AttachmentAccessPort.register()`      | The pattern to copy for "owner decides access"                                           |
| Auth decorators used by controllers    | `@Public`, `@AllowGuest`, `@RequestActor` are transport helpers in `platform/http/auth/` |
| Global `RealtimeBroadcaster`           | Contexts inject the port without importing `WebsocketsModule` (→ `AuthModule`)           |

---

## 3. `Actor`

One identity shape for HTTP and WS: `@RequestActor()` (HTTP), `@WsActor()` (WS,
resolved on connect by `ActorAuthenticator`).

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

Capability rules that depend on who acts (e.g. "guests cannot attach files") live in
the application layer, so REST and WS enforce them identically. It is also the seam for
AI agents.

**Rule:** new and touched application methods take `Actor`, not `userId: string`.

## 4. Event catalogue moves home (Wave 8.1)

`platform/events/registry/events.registry.ts` (23 events) splits into
`<ctx>/contract/<ctx>.events.ts`. `defineEvent` and the types stay in
`platform/events/registry/`. Safe: the dispatcher and consumers work off outbox rows
and `@EventHandler` metadata, never a central import. Removes the
`AttentionItemUpserted` ↔ `AttentionItemResponse` duplicate.

## 5. Worked example — tagging a message

Steps 4–6 are built; step 2 is the Wave 5 target (today `MessagingService` publishes
`MessageUpdated` itself).

```
1. ws/rest      conversations/presentation  → command
2. use case     conversations/application/tag-message.usecase.ts  @Transactional()
                ├─ (a) tagCatalog.assertOwnedBy(ownerUserIdOf(actor), tagIds)
                └─ message.retag(tagIds); repo.save(message)
                   └─ (b) MessageRetagged → MessageUpdated      → outbox, same tx
3. COMMIT
4. durable      conversations/presentation/events/attention-projection.handler
                └─ mapper → publish(AttentionSourceUpserted)      → outbox, tx 2
5. durable      attention/presentation/events/attention-source.handler
                → AttentionProjectionService.upsert
                ├─ (a) tagCatalog.getAnswerModes(tagIds)
                ├─ (a) occurrences.findNextOccurrenceByTag(...)
                ├─ decideDueDate(...)                           ← pure policy
                ├─ applySnapshot(current, snapshot, decision)  ← pure, tombstone = no-op
                └─ (b) publish(AttentionItemUpserted)            only on change
6. realtime     attention/presentation/ws broadcaster → RealtimeBroadcaster.emit([user])
```

No repository crosses a boundary; the one real rule is a pure function.
