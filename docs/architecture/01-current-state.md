# 01 — Current state

As of `7aca955` (2026-10-15). Paths are relative to `apps/api/src/` unless noted.

## 1. Shape

pnpm workspace: `apps/api` (the whole backend — HTTP, WebSockets, event consumers,
jobs), `apps/migrations` (Drizzle schema + SQL), `scripts`. One process.

`apps/api/src`: ~22.1k LOC. `apps/api/test`: ~7.1k LOC.

| Context / folder |   LOC | Notes                                                                    |
| ---------------- | ----: | ------------------------------------------------------------------------ |
| `scheduling`     | 4,393 | native calendar + provider sync, one `SchedulingModule`                  |
| `platform/`      | 4,152 | shared framework-aware tier (not a context); incl. `http/auth/`, `realtime/` |
| `conversations`  | 2,618 | threads + messages; owns its WS gateway + broadcaster                    |
| `tasks`          | 2,465 | tasks, batches, suggestions                                              |
| `attention`      | 1,807 | the core domain                                                          |
| `focus`          | 1,292 | timers                                                                   |
| `sharing`        | 1,080 | public views + guests                                                    |
| `files`          |   928 | attachments                                                              |
| `network`        |   898 | invites + connections                                                    |
| `tagging`        |   790 |                                                                          |
| `auth`           |   539 | identity (with `user-profile`, `user-settings`; merged in 8.3)           |
| `user-profile`   |   297 |                                                                          |
| `events`         |   262 | dead-letter admin REST only                                              |
| `user-settings`  |   212 |                                                                          |
| `kernel/`        |   128 | pure shared tier                                                         |
| `websockets`     |   101 | transport only: auth on connect, room join, `RealtimeBroadcaster` impl   |

Every context is layered `contract / domain / application / infrastructure /
presentation` with `<ctx>.module.ts` + `<ctx>.errors.ts` at its root
([03 §3](03-layering.md#3-folder-template)). Not contexts: `websockets`, `events`,
`health`. Lint enforces the layering (§3.9).

---

## 2. What is solid — keep it

- **Controllers are clean.** None touches Drizzle or a repository; every response goes
  through a mapper; no DTO leaks `$inferSelect`.
- **Services never hit the DB directly.** Persistence goes through repositories.
- **Ports and contracts.** All 21 context repositories are `abstract class` ports in
  `<ctx>/domain/ports/` with a `Drizzle…` adapter in `<ctx>/infrastructure/persistence/`,
  bound `{ provide, useClass }` ([ADR 0002](adr/0002-repository-ports-as-abstract-classes.md)).
  Published contracts: `TagCatalogPort`, `CalendarOccurrencePort`,
  `AttachmentCatalogPort` + `AttachmentAccessPort`, `ConnectionPolicyPort`,
  `PublicLinkPort`, `GuestIdentityRegistry`, `ActorAuthenticator`, `TaskSuggestionPort`.
  No context imports another's repository; every module exports only `contract/` classes.
- **Transactions are uniform.** `TransactionHost` + re-entrant `@Transactional()`
  everywhere. The only raw `db.transaction()` is the outbox dispatcher (by design).
- **`kernel/` + `platform/` tiers.** `kernel/` (`id.ts`, `actor/actor.ts`,
  `time/iso.ts`, `errors/*`) imports no framework and nothing outside itself.
  `platform/` imports no context. No `src/…` or relative imports.
  → [ADR 0005](adr/0005-kernel-and-platform-tiers.md)
- **Typed domain errors.** `DomainError` + 13 per-context catalogs; HTTP status
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
- **One textbook seam:** `AttachmentAccessService.register(resolver)` — `conversations`
  self-registers a resolver so `files` never depends on it. The pattern to copy.
- **Calendar sync design:** `calendar_event_links` with `origin: imported | mirrored`
  echo-skip; `GoogleCalendarProvider` is a proper anti-corruption layer.
- **Message ↔ attention status sync**: bidirectional, loop-safe via three
  idempotency guards. Move it, don't redesign it.
- **Test harness.** Jest `unit` (`*.unit.test.ts`, no Postgres) + `integration`
  projects. 21 unit files, 12 integration files (attention, calendar events,
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
`attention_item_tags.tag_id`, `attention_items.source_calendar_event_id`,
`calendar_event_links.asksynk_event_id`.

**Queries on tables a context doesn't own:**

- `attention/infrastructure/persistence/drizzle-attention-items.repository.ts` joins
  `tags` 6× — ghost-filtering deleted tags; goes with 7.2.
- `conversations/…/drizzle-messaging.repository.ts` (`listThreadsForUser`) and
  `sharing/…/drizzle-public-views.repository.ts` (`getMetadataBySlug`) join `users` —
  identity, the sanctioned shared table.

### 3.2 The core rule is only half modelled

The tag → due-date rule is the pure `decideDueDate`
(`attention/domain/due-date.policy.ts`); `AttentionDueDateService` feeds it answer
modes from `TagCatalogPort` and occurrences from `CalendarOccurrencePort`. The "pinned
due date must not move" invariant is still a `.filter()` inside `recomputeForItems`.

### 3.3 The domain model is anemic

21 entity classes; most have a bare `static create()` and only predicates/getters
(`belongsTo`, `isDeleted`, `isPending`…). `Timer` (`focus/domain/timer.ts`) guards its
transitions but doesn't apply them: it returns a decision and `DrizzleTimersRepository`
mutates state with one conditional `UPDATE` per transition; `RecurrenceRule` (`scheduling/domain/recurrence-rule.vo.ts`) is
the one value object. A few encode a small rule: `CalendarIntegration.accessTokenExpired`,
`PublicView.isLive`, `Invite.isForEmail`.

State machines live in services (Wave 5):

- `tasks/application/task-suggestions.service.ts` — `requirePending()` guards.
- `network/application/networks.service.ts` — invite status guards.
- `attention/application/attention-items.service.ts` — status/note/tags assigned field by field.

### 3.4 `Actor` partly used

`Actor` (`kernel/actor/actor.ts`) comes from `@RequestActor()` (HTTP), `@WsActor()`
(WS) and `ActorAuthenticator.authenticate` (socket connect); built from `AuthUser` /
`AuthGuest` in `platform/http/auth/actor.mapper.ts`. Takers:
`ConnectionPolicyPort.resolveTargetUserId`, `TagsService.listTags`,
`CalendarEventsService.listCalendarEvents`, and all of `MessagingService`'s public
methods. Guest capability rules ("guests cannot attach files / suggest tasks / update
status / list threads") are `messaging` catalog errors in `MessagingService`. ~70
service methods in other contexts still take a bare `userId: string` (rule: convert
when touched).

### 3.5 Contracts live outside their contexts

All 20 events are defined in one file, `platform/events/registry/events.registry.ts`
(319 LOC). The `AttentionItemUpserted` zod schema is a hand-kept copy of
`AttentionItemResponse`. Consumer groups already live in their contexts. Fix: 8.1.

### 3.6 `attention_items` is a projection wearing an aggregate's clothes

- `type` enum names the source: `tagged_message | incoming_email | slack_message |
whatsapp_message | suggested_timeblock | suggested_task | task` — three values have
  no producer.
- Source identity lives in `metadata jsonb` (`messageId`, `taskId`, `taskBatchId`,
  `suggestionId`), looked up with `metadata->>'key'` — no index.
- Three bespoke handlers (`message-attention`, `task-attention`,
  `tag-calendar-attention`) each know a different source's shape.

Design for the fix: [06-attention-core.md](06-attention-core.md).

### 3.7 `tasks` speaks attention's vocabulary

`tasks/application/task-status.util.ts` imports `AttentionItemStatus` from
`attention/contract/` (`mapTaskStatusToAttention`). Legal, but goes away with tasks'
outbound translator (6.2).

### 3.8 Untested

The socket transport end to end (`WsGateway` connect/auth/rooms; no `socket.io-client`
— manual smoke), sharing services beyond guest sign-in, `network`, `user-profile`,
`user-settings`, calendar provider sync/OAuth, the auth guard's user-session path
(better-auth is ESM Jest can't load).

### 3.9 Boundary enforcement

`pnpm lint` runs ESLint (`eslint-plugin-boundaries` v7 layer rules,
`no-restricted-imports` for relative/`src/*` imports) and `pnpm lint:boundaries`
(dependency-cruiser: cross-context, foreign repository, infrastructure/presentation
direction, kernel/platform isolation, no Drizzle schema in domain, no barrels, no
cycles). All `error`, no exceptions. `schema-ownership` comes with 7.3.
→ [03 §8](03-layering.md#8-enforcement)

---

## 4. Known small defects

| Defect                                                                                                              | Where                                                     |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `isValidId` calls `UUID.parse`, which throws on malformed input → 500 instead of 400; also accepts any UUID version | `kernel/id.ts`                                            |
| Duplicate tag name → unmapped `23505` → 500. Uniqueness is case-sensitive (`uq_tags_user_name (user_id, name)`)     | `tagging/`, `apps/migrations/src/schema/tags.ts`          |
| 11 Nest `HttpException`s instead of `storage` catalog errors (no catalog for `auth`, `user-settings`)               | `files/application/attachments.service.ts`                |
| `attachments.placement` enum (`public \| message`) names consumer contexts                                          | `attachments` table                                       |
| Comment says job `deleteAfterSeconds` default is 1h; it is 2 days                                                   | `scheduling/application/jobs/calendar-sync.jobs.ts`       |
| `AuthGuard` provided by both `auth.module` and `auth-guard.module`                                                  | `auth/`                                                   |
| `GET /public/me` (`@AllowGuest`) returns 500 for a signed-in user (no `request.guest`)                              | `sharing/presentation/rest/public-visitors.controller.ts` |
| Parallel integration suites share one outbox: a suite's dispatcher claims rows for any event it handles and enqueues only its own groups (e.g. dead-letters suite subscribes to real `task.deleted`) → occasional cross-suite flakes; rerun a failing suite alone | `test/`, `platform/events/dispatcher/`                    |
| Leftover: `packages/*` in `pnpm-workspace.yaml`                                                                     | repo root                                                 |

Event-delivery gaps (idempotency inbox, key prefixes, guest-recipient jobs, thread-room
duplicates) are listed in [platform/events §Known gaps](../platform/events.md#known-gaps).
