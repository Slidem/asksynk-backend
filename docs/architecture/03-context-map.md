# 03 — Context map

Ten bounded contexts. Each one is named in the product's language, owns its own
Postgres schema, and is reachable only through a declared contract.

---

## 1. The map

```
                    ┌──────────────────────────────────────────┐
   INPUT CHANNELS   │              THE BARRIER                 │   THE DECISION
                    └──────────────────────────────────────────┘

  ┌───────────────┐                ┌──────────┐              ┌──────────────┐
  │ conversations │───tagged──────▶│ tagging  │◀──policy─────│  attention   │
  │  (messages)   │                │  (tags)  │              │  (the heart) │
  └───────────────┘                └──────────┘              └──────┬───────┘
  ┌───────────────┐                     ▲                           │
  │    tasks      │───tagged────────────┤                           │
  └───────────────┘                     │                           │
  ┌───────────────┐                     │                    next occurrence
  │  gmail/slack  │───tagged────────────┘                           │
  │  (future)     │                                                 ▼
  └───────────────┘                                          ┌──────────────┐
                                                             │  scheduling  │
                                                             │ (calendar +  │
                                                             │ integrations)│
                                                             └──────────────┘

  SUPPORTING                                  GENERIC
  ┌─────────┐ ┌─────────┐ ┌────────┐          ┌────────┐ ┌──────────┐
  │ network │ │ sharing │ │ focus  │          │ files  │ │ identity │
  └─────────┘ └─────────┘ └────────┘          └────────┘ └──────────┘
```

The vertical spine — **input → tagging → attention → scheduling** — is the product.
Everything else supports it.

---

## 2. The contexts

Subdomain classification follows Khononov: _core_ is complex **and** a competitive
advantage; _supporting_ is necessary but not differentiating; _generic_ is a solved
problem. **The classification decides how much modelling each context earns.**

| Context           | Today                                           | Subdomain  | Owns                                                                                                                                |
| ----------------- | ----------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **tagging**       | `tags`                                          | **Core**   | `tags`                                                                                                                              |
| **attention**     | `attention-items`                               | **Core**   | `attention_items`, `attention_item_tags`                                                                                            |
| **scheduling**    | `calendar-events` **+** `calendar-integrations` | **Core**   | `calendars`, `calendar_events`, `calendar_event_exceptions`, `calendar_event_tags`, `calendar_integrations`, `calendar_event_links` |
| **conversations** | `messaging`                                     | Supporting | `message_threads`, `thread_participants`, `messages`, `message_tags`, `message_attachments`                                         |
| **tasks**         | `tasks`                                         | Supporting | `tasks`, `task_batches`, `task_suggestions`, `task_tags`, `task_batch_tags`                                                         |
| **network**       | `networks`                                      | Supporting | `user_invites`, `user_network`                                                                                                      |
| **sharing**       | `public-views`                                  | Supporting | `public_views`, `public_view_guests`                                                                                                |
| **focus**         | `timers`                                        | Supporting | `user_timers`, `user_timer_settings`, `user_timer_events`                                                                           |
| **files**         | `storage`                                       | Generic    | `attachments`                                                                                                                       |
| **identity**      | `auth` + `user-profile` + `user-settings`       | Generic    | `users`, `user_settings`, `sessions`, `accounts`, `verifications`                                                                   |
| _(platform)_      | `packages/shared`                               | —          | `events_outbox`                                                                                                                     |

All 33 tables are assigned; none appears twice.

**Investment budget that follows from this table:**

- **Core (tagging, attention, scheduling)** — rich aggregates, pure policies,
  thorough unit tests, careful contracts. Spend time here.
- **Supporting** — rich only where a state machine genuinely exists (`TaskSuggestion`,
  `Invite`, `Timer`). Otherwise typed records and straightforward services.
- **Generic** — keep as thin as possible. `identity` is mostly better-auth; `files` is
  mostly S3. Do not model these.

---

## 3. Decisions, with the evidence

### 3.1 `calendar-events` + `calendar-integrations` → **scheduling** (merge)

→ [ADR 0003](adr/0003-merge-calendar-events-and-calendar-integrations.md)

The evidence is overwhelming:

- **15 cross-module import statements** — the heaviest edge in the codebase.
- **7 of them import a repository**, across 4 files. `calendar-integrations` writes
  directly into `calendar-events`' persistence, bypassing its service entirely.
- **A foreign key**: `calendars.integration_id` → `calendar_integrations.id`.
- They share one lifecycle. An imported Google event _is_ a `calendar_event`; a
  native event mirrored outward _is_ a `calendar_event_link`.

Two modules that share a lifecycle, a foreign key, and each other's repositories are
one context that was filed in two folders.

**What the merge preserves.** `providers/google-calendar.provider.ts` is already a
correct **anti-corruption layer** — it translates Google's model (RRULE lines, etags,
sync tokens, HTTP 410 on expired tokens) into asksynk's. It keeps that job, and moves
to `scheduling/infrastructure/acl/`. Nothing about it changes except the name of the
folder and what that name says about its purpose.

The mirror/echo-skip logic — `origin: "imported" | "mirrored"` on
`calendar_event_links`, with the inbound path skipping mirrors and the outbound path
refusing to push imports back — is genuinely good design. It stays as-is.

### 3.2 `attention-items` → **attention** (an aggregate whose content is a projection)

→ [ADR 0004](adr/0004-attention-as-projection-with-typed-source.md), and
[07-attention-core.md](07-attention-core.md) for the full design.

This is the decision most likely to be re-litigated later, so it is worth stating
precisely.

An attention item holds two kinds of data:

| Data                   | Owned by           | Example                            |
| ---------------------- | ------------------ | ---------------------------------- |
| **Lifecycle state**    | attention          | `status`, `note`, `dueDatePinned`  |
| **Content**            | the source context | title, message body, sender name   |
| **Derived scheduling** | attention's policy | `dueDate`, `sourceCalendarEventId` |

The lifecycle state is a genuine write model. `created → in_progress → resolved` is
_the user deciding they have handled something_ — the single most important action in
the product. That belongs to attention and nothing else.

The content is a **projection**. Attention does not own the message body; it caches
enough of it to render an inbox row.

So: **an aggregate, with a projected snapshot inside it.** Not a pure read model
(it has real state and real transitions), and not a pure aggregate (it does not own
its content).

Documenting this explicitly matters because both extremes look tempting:

- "Make it a pure projection" loses the status transitions and the pinned due date.
- "Make it a pure aggregate" means duplicating message content authoritatively, or
  joining across contexts at read time.

### 3.3 `tags` → **tagging** (a context, not a shared kernel)

The tempting reading is that `tags` is a Shared Kernel — five other tables reference
it, everyone needs it.

That is wrong, and the reason is `answerMode`:

```ts
type AnswerMode =
  | { type: "immediately"; responseTimeMillis: number }
  | { type: "timeblock" };
```

This is not a label. It is **a policy about when something deserves an answer** — the
product's core rule, and it will grow (business-hours-only tags, per-channel
overrides, escalation). A Shared Kernel is jointly owned and changes require
coordination between all owners; that is precisely what you do not want for the
concept most likely to evolve.

So `tagging` is a context with two published concerns:

- **`TagPolicy`** — a value object `{ id, answerMode }`. Attention consumes it to
  derive due dates. This is the _Published Language_.
- **`TagOwnership`** — `assertOwnedBy(userId, tagIds)`. Conversations, tasks and
  scheduling all need it before attaching tags.

**Tag _assignment_ is not tagging's business.** `message_tags`, `calendar_event_tags`,
`task_tags`, `task_batch_tags` and `attention_item_tags` each stay owned by the
_tagged_ context, holding a `tag_id` as a soft reference. Which tags are on a message
is a property of the message.

### 3.4 `networks` → **network** (a context) + a policy port

`networks` is currently two different things wearing one name:

1. **Invites** — a real aggregate with a real state machine
   (`pending → accepted | rejected`), an email side effect, and a uniqueness rule.
2. **`isActiveConnection` / `validateIsActiveConnection` / `resolveTargetUserId`** —
   authorization primitives consumed by `tasks`, `tags`, `messaging` and
   `calendar-events`. Eight inbound edges, zero outbound.

The second set is not a feature; it is a policy that other contexts ask about. It
becomes a narrow **`ConnectionPolicyPort`**:

```ts
export abstract class ConnectionPolicyPort {
  abstract areConnected(a: UserId, b: UserId): Promise<boolean>;
}
```

Two controllers currently inject `NetworksService` to call `resolveTargetUserId`
before delegating — [`calendar-events.controller.ts`](../../apps/api/src/calendar-events/rest/calendar-events.controller.ts)
and [`tags.controller.ts`](../../apps/api/src/tags/rest/tags.controller.ts). That
decision ("may this actor read another user's data") moves into the application
layer, where the rest of the authorization already lives.

### 3.5 `messaging` + `public-views` stay **separate** (conversations / sharing)

The temptation is to merge them — the FKs are dense:
`message_threads.public_view_id`, `thread_participants.guest_id`,
`messages.sender_guest_id`.

They stay separate, because they answer different questions:

- **sharing** answers _"who is this anonymous visitor, and is their link still
  valid?"_ — slugs, tokens, expiry, revocation.
- **conversations** answers _"what was said, by whom, in which thread?"_

Guest _identity_ is sharing's; guest _participation_ is conversations'. The three FKs
become soft references, and conversations stores a `ParticipantRef`:

```ts
type ParticipantRef =
  | { kind: "user"; userId: string }
  | { kind: "guest"; guestId: string }; // an id from `sharing`, no FK
```

This also fixes the method-duplication problem. Today `messaging` has 17 public
methods in systematic `X` / `guestX` pairs — `listThreadMessages` /
`listGuestThreadMessages`, `sendAsUser` / `sendAsGuest`, `tagMessage` /
`tagMessageAsGuest`. With a first-class `ParticipantRef`, most pairs collapse into one
method that takes an actor.

**The `auth → public-views` inversion is cured here too.** Today
`auth/guest-auth.service.ts` injects `PublicViewGuestsRepository`, so the global auth
guard depends on a feature module. Instead, `identity` declares the port and `sharing`
registers into it at bootstrap:

```ts
// identity/contract/guest-identity.provider.ts
export abstract class GuestIdentityProvider {
  abstract validateToken(token: string): Promise<GuestPrincipal | null>;
}
```

This is exactly the shape of the `AttachmentPermissionResolver` seam that already
works in this codebase.

### 3.6 `auth` + `user-profile` + `user-settings` → **identity** (merge)

Three thin, generic, `users`-keyed modules (571 + 277 + 201 LOC). Keeping them apart
buys nothing.

One wrinkle worth naming: `user_settings` holds
`attention_item_notifications` and `timer_notifications` — flags for two _other_
contexts. That is acceptable: "notification preferences" is a coherent identity-level
concept, and splitting the row per context would be worse. `attention` and `focus`
read it through a port:

```ts
export abstract class NotificationPreferencesPort {
  abstract prefersAttentionNotifications(userId: UserId): Promise<boolean>;
}
```

### 3.7 `storage` → **files** (generic, keep thin)

The cleanest leaf in the codebase: 15 inbound edges, zero outbound. The permission
resolver registry is already the right design.

One fix: `attachments.placement` is an enum of `public | message` — **consumer
context names inside the storage table**. `user-profile` already stores avatars there,
and every future consumer adds a value. It becomes `owner_context text` (a free-form
context name), with the permission resolver registry — which already exists — deciding
access per context.

### 3.8 `timers` → **focus**

Renamed because "timer" is the mechanism and "focus" is the concept. It owns a real
five-state machine (`idle | running | paused | completed | stopped`) that is currently
implemented with string-compare guards. Prime candidate for a rich aggregate.

The pg-boss coupling — `TimersService` injects `ScheduledJobService` — moves to the
application layer, behind the port that already exists in `packages/shared`.

---

## 4. Relationships between contexts

Using Evans' context-map vocabulary. This table is the summary;
[05-integration.md](05-integration.md) has the mechanics.

| Upstream             | Downstream                                | Relationship                  | Mechanism                                     |
| -------------------- | ----------------------------------------- | ----------------------------- | --------------------------------------------- |
| tagging              | attention                                 | **Published Language**        | `TagPolicy` VO via port                       |
| tagging              | conversations, tasks, scheduling          | Open Host Service             | `TagOwnershipPort`                            |
| scheduling           | attention                                 | Open Host Service             | `OccurrenceQueryPort`                         |
| conversations, tasks | attention                                 | **Event Publisher**           | domain events → channel adapters              |
| attention            | conversations                             | Event Publisher               | `attention.message.synced`                    |
| Google Calendar      | scheduling                                | **Anti-Corruption Layer**     | `GoogleCalendarProvider`                      |
| network              | tasks, conversations, scheduling, tagging | Open Host Service             | `ConnectionPolicyPort`                        |
| sharing              | identity                                  | **inverted** (was Conformist) | `GuestIdentityProvider` registered by sharing |
| sharing              | conversations                             | Open Host Service             | view liveness query                           |
| files                | conversations, identity                   | Open Host Service + registry  | facade + `AttachmentPermissionResolver`       |
| identity             | everyone                                  | Shared Kernel (`UserId` only) | the one sanctioned universal                  |

---

## 5. Where the growth plugs in

The point of drawing the map this way is that every planned feature has an obvious
home and does not disturb the core.

| Planned                             | Where it goes                                                                                                      | What it costs                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **Gmail / Slack / WhatsApp**        | A new context per channel, publishing events that a channel adapter in `attention/presentation/events/` translates | One adapter + one enum value. No change to attention's core.         |
| **Calendar analytics / statistics** | A new `insights` context, read-only, subscribing to `scheduling.*` and `attention.*` events                        | Its own schema, its own projections. Zero writes into core contexts. |
| **Gamification**                    | A new `momentum` context, subscribing to `attention.item.resolved`                                                 | Nothing in `attention` changes — it already publishes the event.     |
| **AI planning agents**              | Not a context. Agents are **another actor** issuing the same commands through the same application facades.        | A new inbound adapter alongside `rest/` and `ws/`.                   |

That last row is the important one. An AI agent that plans a calendar is not a new
domain — it is a new _client_. If the application layer is the only way in, agents
get the same invariants, the same authorization and the same events as a human user,
for free. If business rules stay scattered in controllers and services, every agent
integration re-implements them.

---

## 6. What deliberately does _not_ become a context

- **`common` / `infrastructure`** → a `kernel/` folder, not a context. It holds
  `UserId`, the `Clock`, time utilities and the domain error base. **Rule: `kernel`
  imports nothing from any context.** This is what cures the current
  `common → calendar-events` inversion.
- **`websockets`** → transport, not a context. See [04-layering.md §4](04-layering.md).
- **`events`** → platform wiring.
- **`health`** → one endpoint; it can stay where it is.

---

Next: [04-layering.md](04-layering.md) — the template every context follows.
