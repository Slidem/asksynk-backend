# 01 — Current state

Audited at `5129fc8` (2026-10-10); updated after Wave 3 (2026-10-11) and Wave 4 (2026-10-15). Paths are relative to `apps/api/src/` unless noted.

## 1. Shape

pnpm workspace: `apps/api` (the whole backend — HTTP, WebSockets, event consumers,
jobs), `apps/migrations` (Drizzle schema + SQL), `scripts`. One process; no worker app.

`apps/api/src`: ~22.1k LOC. `apps/api/test`: ~7.0k LOC.

| Context / folder |   LOC | Notes                                                                   |
| ---------------- | ----: | ----------------------------------------------------------------------- |
| `scheduling`     | 4,393 | calendar + provider sync, one `SchedulingModule`                         |
| `platform/`      | 4,152 | shared framework-aware infra (tier, not a context); incl. `http/auth/`, `realtime/` |
| `tasks`          | 2,433 |                                                                         |
| `conversations`  | 2,607 | was `messaging`; owns its WS gateway + broadcaster                      |
| `attention`      | 1,755 | was `attention-items`; the core domain                                  |
| `focus`          | 1,259 | was `timers`                                                            |
| `sharing`        | 1,080 | was `public-views`                                                      |
| `files`          |   928 | was `storage`                                                           |
| `network`        |   898 | was `networks`                                                          |
| `tagging`        |   790 |                                                                         |
| `websockets`     |   101 | transport only: auth on connect, room join, `RealtimeBroadcaster` impl  |
| `auth`           |   539 | identity (with `user-profile`, `user-settings`; merged in 8.3)          |
| `user-profile`   |   297 |                                                                         |
| `events`         |   262 | dead-letter admin REST only                                             |
| `user-settings`  |   212 |                                                                         |
| `kernel/`        |   128 | pure shared tier                                                        |

Every context is layered `contract / domain / application / infrastructure /
presentation` with `<ctx>.module.ts` + `<ctx>.errors.ts` at its root (Wave 3); not
contexts: `websockets`, `events`, `health`. Lint enforces it (§3.11).

---

## 2. What is solid — keep it

- **Controllers are clean.** None touches Drizzle or a repository; every response goes
  through a mapper; no DTO leaks `$inferSelect`.
- **Services never hit the DB directly.** Persistence goes through repositories.
- **Ports and contracts (Wave 2).** All 21 context repositories are `abstract class`
  ports in `<ctx>/domain/ports/` with a `Drizzle…` adapter in
  `<ctx>/infrastructure/persistence/`, bound `{ provide, useClass }`
  ([ADR 0002](adr/0002-repository-ports-as-abstract-classes.md)). Published contracts:
  `TagCatalogPort`, `CalendarOccurrencePort`, `AttachmentCatalogPort` +
  `AttachmentAccessPort`, `ConnectionPolicyPort`, `PublicLinkPort`,
  `GuestIdentityRegistry`, `ActorAuthenticator`, `TaskSuggestionPort`. **0 imports of another context's
  repository.**
- **Transactions are uniform.** `TransactionHost` + re-entrant `@Transactional()`
  everywhere. The only raw `db.transaction()` is the outbox dispatcher (by design).
- **`kernel/` + `platform/` tiers.** `kernel/` (5 files: `id.ts`, `time/iso.ts`,
  `errors/*`) imports no framework and nothing outside itself. `platform/` imports no
  context. `common/`, `infrastructure/` and `packages/shared` are gone. 0 `src/…` or
  relative imports. → [ADR 0005](adr/0005-kernel-and-platform-tiers.md)
- **Typed domain errors.** `DomainError` + 12 per-context catalogs; HTTP status
  decided in `platform/errors`. → [platform/errors](../platform/errors.md)
- **Events.** Transactional outbox, durable + realtime legs, one `key_strict_fifo`
  queue per consumer group, consumer groups owned by their context, dead letters +
  admin replay, retention. → [platform/events](../platform/events.md)
- **Jobs.** One typed API (`defineJob`, `@JobHandler`, `@CronJob`, `JobScheduler`),
  caller-derived ids, no queue refs in domain tables. → [platform/jobs](../platform/jobs.md)
- **Realtime is per context (Wave 4).** Each context's `presentation/ws/*.broadcaster.ts`
  turns realtime events into `RealtimeBroadcaster.emit(targets[], …)` (port in
  `platform/realtime/`, socket.io impl `websockets/ws.gateway.ts`, global module).
  Inbound commands: `conversations/presentation/ws/conversations.gateway.ts`, DTO-validated,
  errors → `{ ok: false, error }` acks via `WsAckInterceptor`.
- **One textbook seam:** `AttachmentAccessService.register(resolver)` — `messaging`
  self-registers a resolver so `storage` never depends on it. The pattern to copy.
- **Calendar sync design:** `calendar_event_links` with `origin: imported | mirrored`
  echo-skip; `GoogleCalendarProvider` is already a proper anti-corruption layer.
- **Message ↔ attention status sync**: bidirectional, loop-safe via three
  idempotency guards. Move it, don't redesign it.
- **Test harness.** Jest `unit` (`*.unit.test.ts`, no Postgres) + `integration`
  projects. 21 unit files, 12 integration files (attention, calendar events,
  tasks↔attention, timers, storage, jobs, dead letters, retention, guest auth,
  guest message count, messaging).

---

## 3. What is still wrong

### 3.1 Cross-module imports that bypass a contract

Wave 2 removed every foreign repository import and repository export; Wave 3 published
`TaskSuggestionPort` and attention's status type, merged scheduling into one module, and
moved the auth request decorators/types to `platform/http/auth/`. Every module exports
only `contract/` classes. Contexts reach each other only through `contract/` and
`*.module.ts` (lint `error`). Wave 4 removed the last offender: `websockets` now imports
only `auth/contract/` + `platform/`; no boundary warnings remain. Exception:
`ConversationsModule` still exports `MessagingService` (no importer left since Wave 4).

`tasks` imports `AttentionItemStatus` from `attention/contract/` (legal, but tasks still
speaks attention's vocabulary until its outbound translator, 6.2).

### 3.2 The database is the integration layer

**10 FKs cross a context boundary** (excluding `users`):

| FK                                                       | Crosses                                 |
| -------------------------------------------------------- | --------------------------------------- |
| `calendars.integration_id` → `calendar_integrations.id`  | intra-`scheduling` since 2.2 (keeps FK)  |
| `calendar_event_tags.tag_id` → `tags.id`                 | scheduling → tagging                    |
| `message_tags.tag_id` → `tags.id`                        | conversations → tagging                 |
| `task_tags.tag_id` → `tags.id`                           | tasks → tagging                         |
| `task_batch_tags.tag_id` → `tags.id`                     | tasks → tagging                         |
| `message_threads.public_view_id` → `public_views.id`     | conversations → sharing                 |
| `thread_participants.guest_id` → `public_view_guests.id` | conversations → sharing                 |
| `messages.sender_guest_id` → `public_view_guests.id`     | conversations → sharing                 |
| `messages.suggestion_id` → `task_suggestions.id`         | conversations → tasks                   |
| `message_attachments.attachment_id` → `attachments.id`   | conversations → files                   |

Deliberately FK-less soft refs already exist and are the pattern to copy:
`attention_item_tags.tag_id`, `attention_items.source_calendar_event_id`,
`calendar_event_links.asksynk_event_id`.

**Queries on tables a module doesn't own** (Wave 2 moved the rrule CTE into scheduling
behind `CalendarOccurrencePort`, replaced the messaging joins on `public_view_*` /
`user_network` with port calls, and made the guest message count sharing's own
projection, `public_view_guests.message_count`). What remains:

- `drizzle-attention-items.repository.ts` joins `tags` 6× — ghost-filtering deleted
  tags; goes with 7.2.
- `drizzle-messaging.repository.ts` (`listThreadsForUser`) and
  `drizzle-public-views.repository.ts` (`getMetadataBySlug`) join `users` — identity,
  the sanctioned shared table.
- `drizzle-calendar.repository.ts` joins `calendar_integrations` — now intra-context.

### 3.3 The core rule is only half modelled

The tag → due-date rule is the pure `decideDueDate`
(`attention/domain/due-date.policy.ts`); `AttentionDueDateService` feeds it
answer modes from `TagCatalogPort` and occurrences from `CalendarOccurrencePort`. The "pinned due date
must not move" invariant is still a `.filter()` inside `recomputeForItems`.

### 3.4 The domain model is anemic

20 entity classes; each has a bare `static create()` and only predicates/getters
(`belongsTo`, `isDeleted`, `isPending`…). Only `Timer` (`focus/domain/timer.ts`)
owns its state transitions; `RecurrenceRule` (`scheduling/domain/`) is the one
value object. A few encode a small rule: `CalendarIntegration.accessTokenExpired`, `PublicView.isLive`, `Invite.isForEmail`.

State machines live in services:

- `tasks/application/task-suggestions.service.ts` — `requirePending()` guards.
- `network/application/networks.service.ts` — invite status guards.
- `attention/application/attention-items.service.ts` — status/note/tags assigned field by field.

### 3.5 Ports — done (Wave 2), layered (Wave 3)

See §2. Entities and the models ports need live in `domain/`; no `domain/` or
`contract/` file imports the Drizzle schema (scheduling declares its jsonb shape types).

### 3.6 `Actor` partly used

`Actor` (`kernel/actor/actor.ts`) is returned by `@RequestActor()`, `@WsActor()` and
`ActorAuthenticator.authenticate`; built from `AuthUser` / `AuthGuest` in
`platform/http/auth/actor.mapper.ts`. Takers: `ConnectionPolicyPort.resolveTargetUserId`,
`TagsService.listTags`, `CalendarEventsService.listCalendarEvents`, and messaging's
public surface (`send`, `tagMessage`, `updateManagedStatus`, `listMessages`,
`listReplies`, `getThreadStats`, `listTaggedMessages`, `canAccessThread` — the `X` /
`guestX` pairs collapsed in 4.3). Guest capability rules ("guests cannot attach files /
suggest tasks / update status") live in `MessagingService` as `messaging` catalog errors.
Still on a bare `userId: string`: ~70 service methods, including
`MessagingService.listThreadsForUser` and `createOrGetUserThread`.

### 3.7 Contracts live outside their contexts

All 20 events are defined in one file, `platform/events/registry/events.registry.ts`
(319 LOC). The `AttentionItemUpserted` zod schema is a hand-kept copy of
`AttentionItemResponse`, with a stale comment blaming the old `packages/shared`.
(Consumer groups, by contrast, already live in their contexts.)

### 3.8 `attention_items` is a projection wearing an aggregate's clothes

- `type` enum names the source: `tagged_message | incoming_email | slack_message |
whatsapp_message | suggested_timeblock | suggested_task | task` — three values have
  no producer.
- Source identity lives in `metadata jsonb` (`messageId`, `taskId`, `taskBatchId`,
  `suggestionId`), looked up with `metadata->>'key'` — no index.
- Three bespoke handlers (`message-attention`, `task-attention`,
  `tag-calendar-attention`) each know a different source's shape.

Design for the fix: [06-attention-core.md](06-attention-core.md).

### 3.9 ~~`ws.gateway.ts` does three jobs~~ — split in Wave 4

`websockets/ws.gateway.ts` is transport only (auth on connect, user/guest room join,
`emit`). The 5 commands moved to `ConversationsGateway`, the 7 realtime handlers to 4
per-context broadcasters.

### 3.10 Inverted / cyclic module deps

- ~~`auth ↔ public-views`~~ — inverted in 2.6: auth declares `GuestIdentityRegistry`
  (`auth/contract/`), public-views registers its provider at bootstrap.
- `tasks → attention`: `task-status.util.ts` imports `AttentionItemStatus` from attention's
  `contract/` (`mapTaskStatusToAttention`; batch status is already derived in tasks' terms).

### 3.11 Boundary enforcement (Wave 3)

`pnpm lint` runs ESLint (`eslint-plugin-boundaries` v7 layer rules, `no-restricted-imports`
for relative/`src/*` imports) and `pnpm lint:boundaries` (dependency-cruiser:
cross-context, foreign repository, infrastructure/presentation direction, kernel/platform
isolation, no Drizzle schema in domain, no barrels, no cycles). All `error`, no
exceptions since Wave 4. `schema-ownership` waits for 7.3. → [03 §8](03-layering.md#8-enforcement-wave-3)

---

## 4. Known small defects

| Defect                                                                                                              | Where                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `isValidId` calls `UUID.parse`, which throws on malformed input → 500 instead of 400; also accepts any UUID version | `kernel/id.ts`                                        |
| Duplicate tag name → unmapped `23505` → 500. Uniqueness is case-sensitive (`uq_tags_user_name (user_id, name)`)     | `tagging/`, `apps/migrations/src/schema/tags.ts`         |
| 11 Nest `HttpException`s; no `storage` error catalog (also none for `auth`, `user-settings`)                        | `files/application/attachments.service.ts`           |
| `attachments.placement` enum (`public \| message`) names consumer contexts                                          | `attachments` table                                   |
| Comment says job `deleteAfterSeconds` default is 1h; it is 2 days                                                   | `scheduling/application/jobs/calendar-sync.jobs.ts`   |
| `AuthGuard` provided by both `auth.module` and `auth-guard.module`                                                  | `auth/`                                               |
| `GET /public/me` (`@AllowGuest`) returns 500 for a signed-in user (no `request.guest`)                              | `sharing/presentation/rest/public-visitors.controller.ts` |
| Parallel integration suites share one outbox: a suite's dispatcher claims rows for any event it handles and enqueues only its own groups (e.g. dead-letters suite subscribes to real `task.deleted`) → occasional cross-suite flakes | `test/`, `platform/events/dispatcher`                 |
| Leftover: `packages/*` in `pnpm-workspace.yaml`                                                                     | repo root                                             |

Event-delivery gaps (idempotency inbox, key prefixes, guest-recipient jobs, thread-room
duplicates) are listed in [platform/events §Known gaps](../platform/events.md#known-gaps).

## 5. Untested

The socket transport end to end (`WsGateway` connect/auth/rooms; no `socket.io-client`
— covered by manual smoke), sharing services beyond guest sign-in, `network`,
`user-profile`, `user-settings`, calendar provider sync/OAuth, the auth guard's
user-session path (better-auth is ESM Jest can't load). Covered since Wave 2: guest
sign-in + `AuthGuard` guest path, `TagCatalogPort`, `assertUsable`,
recurring/exception occurrences, guest message count. Since Wave 4: `MessagingService`
(characterization suite), broadcasters, WS DTO ack strings, `WsAckInterceptor`.
