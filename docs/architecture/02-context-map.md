# 02 — Context map

Ten bounded contexts. Each is named in the product's language, owns its own Postgres
schema, and is reachable only through a declared `contract/`.

## 1. The map

```
   INPUT CHANNELS                THE BARRIER                 THE DECISION

  ┌───────────────┐                ┌──────────┐              ┌──────────────┐
  │ conversations │───tagged──────▶│ tagging  │◀──policy─────│  attention   │
  │  (messages)   │                │  (tags)  │              │  (the heart) │
  └───────────────┘                └──────────┘              └──────┬───────┘
  ┌───────────────┐                     ▲                           │
  │    tasks      │───tagged────────────┤                    next occurrence
  └───────────────┘                     │                           ▼
  ┌───────────────┐                     │                    ┌──────────────┐
  │  gmail/slack  │───tagged────────────┘                    │  scheduling  │
  │  (future)     │                                          │ (calendar +  │
  └───────────────┘                                          │ integrations)│
                                                             └──────────────┘
  SUPPORTING                                  GENERIC
  ┌─────────┐ ┌─────────┐ ┌────────┐          ┌────────┐ ┌──────────┐
  │ network │ │ sharing │ │ focus  │          │ files  │ │ identity │
  └─────────┘ └─────────┘ └────────┘          └────────┘ └──────────┘
```

## 2. The contexts

Subdomain type decides how much modelling a context earns (Khononov): **core** gets
rich aggregates, pure policies, careful contracts; **supporting** is rich only where a
state machine exists (`Timer`, `TaskSuggestion`, `Invite`); **generic** stays thin.

| Context           | Today (module)                              | Type       | Owns                                                                                                                                |
| ----------------- | ------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **tagging**       | `tags`                                      | Core       | `tags`                                                                                                                              |
| **attention**     | `attention-items`                           | Core       | `attention_items`, `attention_item_tags`                                                                                            |
| **scheduling**    | `calendar-events` + `calendar-integrations` | Core       | `calendars`, `calendar_events`, `calendar_event_exceptions`, `calendar_event_tags`, `calendar_integrations`, `calendar_event_links` |
| **conversations** | `messaging`                                 | Supporting | `message_threads`, `thread_participants`, `messages`, `message_tags`, `message_attachments`                                         |
| **tasks**         | `tasks`                                     | Supporting | `tasks`, `task_batches`, `task_suggestions`, `task_tags`, `task_batch_tags`                                                         |
| **network**       | `networks`                                  | Supporting | `user_invites`, `user_network`                                                                                                      |
| **sharing**       | `public-views`                              | Supporting | `public_views`, `public_view_guests`                                                                                                |
| **focus**         | `timers`                                    | Supporting | `user_timers`, `user_timer_settings`, `user_timer_events`                                                                           |
| **files**         | `storage`                                   | Generic    | `attachments`                                                                                                                       |
| **identity**      | `auth` + `user-profile` + `user-settings`   | Generic    | `users`, `user_settings`, `sessions`, `accounts`, `verifications`                                                                   |
| _(platform)_      | `platform/`                                 | —          | `events_outbox`, `events_dead_letters`                                                                                              |

Tag junction tables belong to the **tagged** context: "this message carries tag X" is
a fact about the message.

Not contexts: `kernel/` and `platform/` (shared tiers, [03 §2](03-layering.md#2-kernel-vs-platform)),
`websockets` (transport), `events` (dead-letter admin REST), `health`, and the
composition-root files `app.module.ts` / `error-catalogs.root.ts`.

## 3. Boundary decisions

### 3.1 `calendar-events` + `calendar-integrations` → **scheduling** (merge)

15 cross-module imports (7 of them repositories), a shared FK, `applyFields(event,
fields)` mutating the other module's entity, one shared lifecycle. One context filed
in two folders. The real boundary is asksynk ↔ Google, and it already exists:
`providers/google-calendar.provider.ts` becomes `scheduling/infrastructure/acl/`.
→ [ADR 0003](adr/0003-merge-calendar-events-and-calendar-integrations.md)

### 3.2 `attention-items` → **attention** (aggregate with a projected slice)

Lifecycle state (`status`, `note`, `dueDatePinned`) is attention's write model;
content (title, body, sender) is a projection of the source; `dueDate` is derived by
attention's policy. Neither a pure read model nor a pure aggregate.
→ [ADR 0004](adr/0004-attention-as-projection-with-typed-source.md),
[06-attention-core.md](06-attention-core.md)

### 3.3 `tags` → **tagging** (a context, not a shared kernel)

`answerMode` is a policy that will grow (business hours, per-channel overrides,
escalation) — exactly what a jointly-owned Shared Kernel must not hold.

```ts
type AnswerMode =
  | { type: "immediately"; responseTimeMillis: number }
  | { type: "timeblock" };
```

Two published concerns:

- **Tag policy** — `{ tagId, answerMode }` for attention's due-date rule.
- **Tag ownership** — `assertOwnedBy(userId, tagIds)` for conversations, tasks,
  scheduling.

Tag _assignment_ stays in each tagged context, holding `tag_id` as a soft reference.

### 3.4 `networks` → **network** + a policy port

Two things under one name: **invites** (real state machine `pending → accepted |
rejected`, email side effect) and **connection checks** consumed by tasks, tags,
messaging, calendar-events. The latter becomes a narrow port:

```ts
export abstract class ConnectionPolicyPort {
  abstract areConnected(a: string, b: string): Promise<boolean>;
}
```

"Whose data may this actor read" (`resolveTargetUserId`, today injected into two
controllers) moves into the application layer.

### 3.5 `messaging` and `public-views` stay **separate** (conversations / sharing)

Despite dense FKs. **sharing** answers "who is this visitor and is their link live?"
(slugs, tokens, expiry, revocation); **conversations** answers "what was said, by whom".
Guest identity is sharing's; participation is conversations'. FKs become soft refs;
conversations stores a participant ref:

```ts
type ParticipantRef =
  | { kind: "user"; userId: string }
  | { kind: "guest"; guestId: string }; // id from sharing, no FK
```

The `auth → public-views` inversion is cured by `identity` declaring a
`GuestIdentityProvider` port that `sharing` registers into at bootstrap — the
`AttachmentAccessService.register()` pattern.

### 3.6 `auth` + `user-profile` + `user-settings` → **identity** (merge)

Three thin `users`-keyed modules. `user_settings` holds notification flags for
attention and focus; that's a coherent identity concept, read through a port.

### 3.7 `storage` → **files** (keep thin)

Leaf context; the resolver registry is already right. `attachments.placement`
(`public | message`) becomes `owner_context text` + visibility.

### 3.8 `timers` → **focus**

"Timer" is the mechanism, "focus" the concept. Owns a real five-state machine →
rich aggregate. Already behind `JobScheduler`; no job ref stored.

## 4. Relationships

| Upstream             | Downstream                                | Relationship                  | Mechanism                                   |
| -------------------- | ----------------------------------------- | ----------------------------- | ------------------------------------------- |
| tagging              | attention                                 | Published Language            | tag policy via port                         |
| tagging              | conversations, tasks, scheduling          | Open Host Service             | tag ownership port                          |
| scheduling           | attention                                 | Open Host Service             | `CalendarOccurrencePort`                    |
| conversations, tasks | attention                                 | Event Publisher (Conformist)  | `attention.source.*` events (Wave 6)        |
| attention            | conversations                             | Event Publisher               | `attention.message.synced`                  |
| Google Calendar      | scheduling                                | Anti-Corruption Layer         | `GoogleCalendarProvider`                    |
| network              | tasks, conversations, scheduling, tagging | Open Host Service             | `ConnectionPolicyPort`                      |
| sharing              | identity                                  | inverted registration         | `GuestIdentityProvider`                     |
| sharing              | conversations                             | Open Host Service             | public-link liveness port                   |
| files                | conversations, identity                   | Open Host Service + registry  | attachment catalog port + resolver registry |
| identity             | everyone                                  | Shared Kernel (`userId` only) | the one sanctioned universal                |

## 5. Where growth plugs in

| Planned                  | Home                                                                    | Cost                                 |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------ |
| Gmail / Slack / WhatsApp | `channels/<provider>/` publishing `AttentionSourceUpserted`             | Attention: zero lines (after Wave 6) |
| Calendar analytics       | `insights` context, read-only projections from events                   | Own schema; no writes into core      |
| Gamification             | `momentum` context consuming `attention.item.resolved`                  | One new event from attention (6.5)   |
| AI planning agents       | Not a context — another `Actor` kind calling the same application layer | A new inbound adapter                |

If the application layer is the only way in, agents inherit every invariant and
authorization rule for free. That is why `Actor` lands in Wave 1.
