# 01 — Current state

As of 2026-10-30 (Waves 0–4 and 6 done; Wave 5 has its `Timer` reference). Paths are relative to `apps/api/src/` unless noted.

## 1. Shape

pnpm workspace: `apps/api` (the whole backend — HTTP, WebSockets, event consumers,
jobs), `apps/migrations` (Drizzle schema + SQL), `scripts`. One process.

`apps/api/src`: ~22.7k LOC. `apps/api/test`: ~8.5k LOC.

| Context / folder |   LOC | Notes                                                                        |
| ---------------- | ----: | ---------------------------------------------------------------------------- |
| `scheduling`     | 4,393 | native calendar + provider sync, one `SchedulingModule`                      |
| `platform/`      | 4,196 | shared framework-aware tier (not a context); incl. `http/auth/`, `realtime/` |
| `conversations`  | 2,720 | threads + messages; owns its WS gateway + broadcaster                        |
| `tasks`          | 2,705 | tasks, batches, suggestions                                                  |
| `focus`          | 2,036 | `Timer` aggregate + focus sessions — the aggregate reference                 |
| `attention`      | 1,229 | the core domain; a pure projection — the projection reference                |
| `sharing`        | 1,080 | public views + guests                                                        |
| `files`          |   928 | attachments                                                                  |
| `network`        |   898 | invites + connections                                                        |
| `tagging`        |   790 |                                                                              |
| `auth`           |   539 | identity (with `user-profile`, `user-settings`; merged in 8.3)               |
| `user-profile`   |   297 |                                                                              |
| `events`         |   262 | dead-letter admin REST only                                                  |
| `user-settings`  |   212 |                                                                              |
| `kernel/`        |   173 | pure shared tier                                                             |
| `websockets`     |   101 | transport only: auth on connect, room join, `RealtimeBroadcaster` impl       |

Every context is layered `contract / domain / application / infrastructure /
presentation` with `<ctx>.module.ts` + `<ctx>.errors.ts` at its root
([03 §3](03-layering.md#3-folder-template)). Not contexts: `websockets`, `events`,
`health`. Lint enforces the layering (§3.7).

---

## 2. What is solid — keep it

- **Controllers are clean.** None touches Drizzle or a repository; every response goes
  through a mapper; no DTO leaks `$inferSelect`.
- **Services never hit the DB directly.** Persistence goes through repositories.
- **Ports and contracts.** All 22 context repositories are `abstract class` ports in
  `<ctx>/domain/ports/` with a `Drizzle…` adapter in `<ctx>/infrastructure/persistence/`,
  bound `{ provide, useClass }` ([ADR 0002](adr/0002-repository-ports-as-abstract-classes.md)).
  Published contracts: `TagCatalogPort`, `CalendarOccurrencePort`,
  `AttachmentCatalogPort` + `AttachmentAccessPort`, `ConnectionPolicyPort`,
  `PublicLinkPort`, `GuestIdentityRegistry`, `ActorAuthenticator`, `TaskSuggestionPort`.
  No context imports another's repository; every module exports only `contract/` classes.
- **Transactions are uniform.** `TransactionHost` + re-entrant `@Transactional()`
  everywhere. The only raw `db.transaction()` is the outbox dispatcher (by design).
- **`kernel/` + `platform/` tiers.** `kernel/` (`id.ts`, `actor/actor.ts`,
  `time/iso.ts`, `domain/aggregate-root.ts`, `errors/*`) imports no framework and nothing outside itself.
  `platform/` imports no context. No `src/…` or relative imports.
  → [ADR 0005](adr/0005-kernel-and-platform-tiers.md)
- **Typed domain errors.** `DomainError` + 13 catalogs (`core` + per context); HTTP status
  decided in `platform/errors`, WS acks in `WsAckInterceptor`.
  → [platform/errors](../platform/errors.md)
- **Events.** Transactional outbox, durable + realtime legs, one `key_strict_fifo`
  queue per consumer group, consumer groups owned by their context, dead letters +
  admin replay, retention. → [platform/events](../platform/events.md)
- **Jobs.** One typed API (`defineJob`, `@JobHandler`, `@CronJob`, `JobScheduler`),
  caller-derived ids, no queue refs in domain tables. → [platform/jobs](../platform/jobs.md)
- **Realtime per context.** Each context's `presentation/ws/*.broadcaster.ts` turns
  realtime events into `RealtimeBroadcaster.emit(targets[], …)` (port in
  `platform/realtime/`, socket.io impl in `websockets/ws.gateway.ts`, global module).
  Inbound commands: `conversations/presentation/ws/conversations.gateway.ts`,
  DTO-validated, errors → `{ ok: false, error }` acks. → [03 §6](03-layering.md#6-realtime-ws)
- **Two reference patterns** for the remaining contexts ([03 §7](03-layering.md#reference-implementations)):
  - **Aggregate — `Timer`** (`focus/domain/timer.ts`, [ADR 0008](adr/0008-self-mutating-aggregates.md)):
    owns the open `FocusSession`, checks every change against the static
    `TIMER_TRANSITION_RULES` table (also served by `GET /timers/transitions`), records
    `TimerTransitioned` / `FocusSessionEnded`; `save` checks `version`, writes the
    sessions and flushes the events through `timer-events.mapper.ts`.
  - **Projection — `AttentionItem`** ([06](06-attention-core.md), [ADR 0009](adr/0009-attention-as-pure-projection.md)):
    keyed `(user_id, source_context, source_kind, source_id)` (unique, tombstones
    included); rules in the pure `applySnapshot` + `decideDueDate`. Sources translate in
    their own consumer group (`<ctx>/presentation/events/attention-projection.handler.ts`
    - pure `application/attention-projection.mapper.ts`) into `attention.source.*`;
      attention has one ingestion handler plus the tag / calendar recompute. Status flows
      source → item only; REST is `GET` / `GET :id` / `DELETE :id` (sticky tombstone).
- **One textbook seam:** `AttachmentAccessService.register(resolver)` — `conversations`
  self-registers a resolver so `files` never depends on it. The pattern to copy.
- **Calendar sync design:** `calendar_event_links` with `origin: imported | mirrored`
  echo-skip; `GoogleCalendarProvider` is a proper anti-corruption layer.
- **Calendar time model:** `start` is a `timestamptz` instant + the event's IANA `timezone`;
  the API takes and returns ISO instants. Recurrence expands in the event timezone
  (`rrule.between(rrule, start, from, to, e.timezone)`, rrules carry no `TZID`), so
  wall-clock time survives DST. All-day dates are local midnight
  (`scheduling/domain/zoned-date.ts`).
- **Test harness.** Jest `unit` (`*.unit.test.ts`, no Postgres) + `integration`
  projects. 26 unit files, 13 integration files (attention, calendar events + DST,
  tasks↔attention, timers, attachments, jobs, dead letters, retention, guest auth,
  guest message count, messaging).

---

## 3. What is still wrong

### 3.1 The database is the integration layer

**9 FKs cross a context boundary** (excluding `users`):

| FK                                                       | Crosses                 |
| -------------------------------------------------------- | ----------------------- |
| `calendar_event_tags.tag_id` → `tags.id`                 | scheduling → tagging    |
| `message_tags.tag_id` → `tags.id`                        | conversations → tagging |
| `task_tags.tag_id` → `tags.id`                           | tasks → tagging         |
| `task_batch_tags.tag_id` → `tags.id`                     | tasks → tagging         |
| `message_threads.public_view_id` → `public_views.id`     | conversations → sharing |
| `thread_participants.guest_id` → `public_view_guests.id` | conversations → sharing |
| `messages.sender_guest_id` → `public_view_guests.id`     | conversations → sharing |
| `messages.suggestion_id` → `task_suggestions.id`         | conversations → tasks   |
| `message_attachments.attachment_id` → `attachments.id`   | conversations → files   |

Deliberately FK-less soft refs exist and are the pattern to copy:
`attention_item_tags.tag_id`, `attention_items.due_source_event_id`,
`calendar_event_links.asksynk_event_id`.

**Queries on tables a context doesn't own:**

- `attention/infrastructure/persistence/drizzle-attention-items.repository.ts` joins
  `tags` — ghost-filtering deleted tags; goes with 7.2.
- `conversations/…/drizzle-messaging.repository.ts` (`listThreadsForUser`) and
  `sharing/…/drizzle-public-views.repository.ts` (`getMetadataBySlug`) join `users` —
  identity, the sanctioned shared table.

### 3.2 The domain model is anemic outside `Timer`

Most of the 22 domain entity classes have a bare `static create()` and only
predicates/getters (`belongsTo`, `isDeleted`, `isPending`…). `RecurrenceRule`
(`scheduling/domain/recurrence-rule.vo.ts`) is the one value object. A few encode a
small rule: `CalendarIntegration.accessTokenExpired`, `PublicView.isLive`,
`Invite.isForEmail`.

State machines still live in services (Wave 5):

- `tasks/application/task-suggestions.service.ts` — `requirePending()` guards.
- `network/application/networks.service.ts` — invite status guards.
- `tasks/application/tasks.service.ts`, `task-batches.service.ts` — status changes;
  batch status derived by `tasks/domain/task-batch-status.ts`.
- `scheduling` — calendar event edits / series splits in services; integration status
  mutated externally.

### 3.3 `Actor` partly used

`Actor` (`kernel/actor/actor.ts`) comes from `@RequestActor()` (HTTP), `@WsActor()`
(WS) and `ActorAuthenticator.authenticate` (socket connect); built from `AuthUser` /
`AuthGuest` in `platform/http/auth/actor.mapper.ts`. Takers:
`ConnectionPolicyPort.resolveTargetUserId`, `TagsService.listTags`,
`CalendarEventsService.listCalendarEvents`, all of `MessagingService`'s public
methods, `AttentionItemsService` and `TimersService`. Guest capability rules ("guests cannot attach
files / suggest tasks / update status / list threads / see attention items") are
catalog errors in the services. ~50 application methods elsewhere still take a bare
`userId: string` (rule: convert when touched).

### 3.4 Contracts live outside their contexts

All 23 events are defined in one file, `platform/events/registry/events.registry.ts`
(363 LOC). The `AttentionItemUpserted` zod schema is a hand-kept copy of
`AttentionItemResponse`. Consumer groups already live in their contexts. Fix: 8.1.

### 3.5 Attention leftovers

- The recompute eligibility rule (`!dueDatePinned && !deleted && status !== "resolved"`)
  is a `.filter()` in `AttentionDueDateService.recomputeForItems`, not in `domain/`.
- `attention.item.resolved` is realtime only (no listener); make it durable when a
  consumer group exists.
- `tasks`' assignee is immutable, so "assignee change removes the old user's item"
  has no trigger.
- The repository still joins `tags` to ghost-filter deleted tags (§3.1).

### 3.6 Untested

The socket transport end to end (`WsGateway` connect/auth/rooms; no `socket.io-client`
— manual smoke), sharing services beyond guest sign-in, `network`, `user-profile`,
`user-settings`, calendar provider sync/OAuth, the auth guard's user-session path
(better-auth is ESM Jest can't load).

### 3.7 Boundary enforcement

`pnpm lint` runs ESLint (`eslint-plugin-boundaries` v7 layer rules,
`no-restricted-imports` for relative/`src/*` imports) and `pnpm lint:boundaries`
(dependency-cruiser: cross-context, foreign repository, infrastructure/presentation
direction, kernel/platform isolation, no Drizzle schema in domain, no barrels, no
cycles). All `error`, no exceptions. `schema-ownership` comes with 7.3.
→ [03 §8](03-layering.md#8-enforcement)

---

## 4. Known small defects

| Defect                                                                                                                                                                                                                                                            | Where                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `isValidId` calls `UUID.parse`, which throws on malformed input → 500 instead of 400; also accepts any UUID version                                                                                                                                               | `kernel/id.ts`                                                                |
| Duplicate tag name → unmapped `23505` → 500. Uniqueness is case-sensitive (`uq_tags_user_name (user_id, name)`)                                                                                                                                                   | `tagging/`, `apps/migrations/src/schema/tags.ts`                              |
| 11 Nest `HttpException`s instead of `storage` catalog errors (no catalog for `auth`, `user-settings`)                                                                                                                                                             | `files/application/attachments.service.ts`                                    |
| `attachments.placement` enum (`public \| message`) names consumer contexts                                                                                                                                                                                        | `attachments` table                                                           |
| Comment says job `deleteAfterSeconds` default is 1h; it is 2 days                                                                                                                                                                                                 | `scheduling/application/jobs/calendar-sync.jobs.ts`                           |
| `AuthGuard` provided by both `auth.module` and `auth-guard.module`                                                                                                                                                                                                | `auth/`                                                                       |
| `GET /public/me` (`@AllowGuest`) returns 500 for a signed-in user (no `request.guest`)                                                                                                                                                                            | `sharing/presentation/rest/public-visitors.controller.ts`                     |
| Parallel integration suites share one outbox: a suite's dispatcher claims rows for any event it handles and enqueues only its own groups (e.g. dead-letters suite subscribes to real `task.deleted`) → occasional cross-suite flakes; rerun a failing suite alone | `test/`, `platform/events/dispatcher/`                                        |
| Recurring occurrences that start before the list window but overlap it are omitted (`rrule.between` gets the raw window start; one-offs use overlap)                                                                                                              | `scheduling/infrastructure/persistence/drizzle-calendar-events.repository.ts` |
| Leftover: `packages/*` in `pnpm-workspace.yaml`                                                                                                                                                                                                                   | repo root                                                                     |

Event-delivery gaps (idempotency inbox, key prefixes, guest-recipient jobs, thread-room
duplicates) are listed in [platform/events §Known gaps](../platform/events.md#known-gaps).
