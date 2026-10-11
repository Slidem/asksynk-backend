# 01 — Current state

Audited at `5129fc8` (2026-10-10); updated after Wave 2 (2026-10-10). Paths are relative to `apps/api/src/` unless noted.

## 1. Shape

pnpm workspace: `apps/api` (the whole backend — HTTP, WebSockets, event consumers,
jobs), `apps/migrations` (Drizzle schema + SQL), `scripts`. One process; no worker app.

`apps/api/src`: ~21.8k LOC. `apps/api/test`: ~5.9k LOC.

| Module            |   LOC | Notes                                                          |
| ----------------- | ----: | -------------------------------------------------------------- |
| `scheduling`      | 4,386 | merged `calendar-events` + `calendar-integrations` (2 Nest modules until 3.2) |
| `platform/`       | 3,833 | shared framework-aware infra (tier, not a context)             |
| `tasks`           | 2,393 |                                                                |
| `messaging`       | 2,185 | thread list enriched via sharing/network ports                 |
| `attention-items` | 1,767 | the core domain                                                |
| `timers`          | 1,259 |                                                                |
| `public-views`    | 1,080 |                                                                |
| `storage`         |   928 |                                                                |
| `networks`        |   898 |                                                                |
| `tagging`         |   790 | was `tags`                                                     |
| `auth`            |   661 |                                                                |
| `websockets`      |   560 | `ws.gateway.ts` ~460 LOC                                       |
| `user-profile`    |   288 |                                                                |
| `events`          |   262 | dead-letter admin REST only                                    |
| `user-settings`   |   212 |                                                                |
| `kernel/`         |   128 | pure shared tier                                               |

Module folder shapes are still inconsistent (`entities/ models/ repositories/ services/ rest/`
in some, services at the root in `attention-items`, flat in `timers`). Every context now
has `domain/ports/` (repository ports) and the published ones a `contract/`; full
`domain / application / infrastructure / presentation` layering is Wave 3.2.

---

## 2. What is solid — keep it

- **Controllers are clean.** None touches Drizzle or a repository; every response goes
  through a mapper; no DTO leaks `$inferSelect`.
- **Services never hit the DB directly.** Persistence goes through repositories.
- **Ports and contracts (Wave 2).** All 21 context repositories are `abstract class`
  ports in `<ctx>/domain/ports/` with a `Drizzle…` adapter bound `{ provide, useClass }`
  ([ADR 0002](adr/0002-repository-ports-as-abstract-classes.md)). Published contracts:
  `TagCatalogPort`, `CalendarOccurrencePort`, `AttachmentCatalogPort` +
  `AttachmentAccessPort`, `ConnectionPolicyPort`, `PublicLinkPort`,
  `GuestIdentityRegistry`. **0 imports of another context's repository.**
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
- **WebSocket broadcasting is decoupled.** No service holds the gateway; it subscribes
  to realtime events.
- **One textbook seam:** `AttachmentAccessService.register(resolver)` — `messaging`
  self-registers a resolver so `storage` never depends on it. The pattern to copy.
- **Calendar sync design:** `calendar_event_links` with `origin: imported | mirrored`
  echo-skip; `GoogleCalendarProvider` is already a proper anti-corruption layer.
- **Message ↔ attention status sync**: bidirectional, loop-safe via three
  idempotency guards. Move it, don't redesign it.
- **Test harness.** Jest `unit` (`*.unit.test.ts`, no Postgres) + `integration`
  projects. 17 unit files, 11 integration files (attention, calendar events,
  tasks↔attention, timers, storage, jobs, dead letters, retention, guest auth,
  guest message count).

---

## 3. What is still wrong

### 3.1 Cross-module imports that bypass a contract

Wave 2 removed every foreign repository import (was 16) and every repository export.
Modules export only `contract/` classes, except `SchedulingModule`, which still exports
its two repository ports to its sibling `CalendarIntegrationsModule` (same context;
merged in 3.2). 97 cross-module imports over 31 edges remain; most are contracts, module
imports or auth transport helpers. The ones that still reach into internals:

| Edge                         | Count | What                                                                    | Fix  |
| ---------------------------- | ----: | ----------------------------------------------------------------------- | ---- |
| `websockets` → `messaging`   |     5 | `MessagingService`, mapper, response DTO, entity, constants             | 4.x  |
| `websockets` → `auth`        |     2 | `AuthService`, `GuestAuthService`                                       | 4.x  |
| `websockets` → `tasks`       |     1 | `TaskSuggestionPayload`                                                 | 4.x  |
| `messaging` → `tasks`        |     2 | `TaskSuggestionsService`, `TaskSuggestionPayload` (same-tx command, [04 §G](04-integration.md)) | publish `tasks/contract/task-suggestion.port.ts` |
| `tasks` → `attention-items`  |     1 | `AttentionItemStatus` in `task-status.util.ts`                          | 6.2  |

### 3.2 The database is the integration layer

**10 FKs cross a module boundary** (excluding `users`):

| FK                                                       | Crosses                                 |
| -------------------------------------------------------- | --------------------------------------- |
| `calendars.integration_id` → `calendar_integrations.id`  | calendar-events → calendar-integrations |
| `calendar_event_tags.tag_id` → `tags.id`                 | calendar-events → tags                  |
| `message_tags.tag_id` → `tags.id`                        | messaging → tags                        |
| `task_tags.tag_id` → `tags.id`                           | tasks → tags                            |
| `task_batch_tags.tag_id` → `tags.id`                     | tasks → tags                            |
| `message_threads.public_view_id` → `public_views.id`     | messaging → public-views                |
| `thread_participants.guest_id` → `public_view_guests.id` | messaging → public-views                |
| `messages.sender_guest_id` → `public_view_guests.id`     | messaging → public-views                |
| `messages.suggestion_id` → `task_suggestions.id`         | messaging → tasks                       |
| `message_attachments.attachment_id` → `attachments.id`   | messaging → storage                     |

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
(`attention-items/domain/due-date.policy.ts`); `AttentionDueDateService` feeds it
answer modes from `TagCatalogPort` and occurrences from `CalendarOccurrencePort`. The "pinned due date
must not move" invariant is still a `.filter()` inside `recomputeForItems`.

### 3.4 The domain model is anemic

20 entity classes; each has a bare `static create()` and only predicates/getters
(`belongsTo`, `isDeleted`, `isPending`…). Only `Timer` (`timers/domain/timer.ts`)
owns its state transitions; `RecurrenceRule` (`scheduling/domain/`) is the one
value object. A few encode a small rule: `CalendarIntegration.accessTokenExpired`, `PublicView.isLive`, `Invite.isForEmail`.

State machines live in services:

- `tasks/services/task-suggestions.service.ts` — `requirePending()` guards.
- `networks/services/networks.service.ts` — invite status guards.
- `attention-items.service.ts` — status/note/tags assigned field by field.

### 3.5 Ports — done (Wave 2)

See §2. Ports still import their module's `entities/` / `models/` (moved into `domain/`
in 3.2); `CalendarIntegrationCredentials` still comes from the Drizzle schema file.

### 3.6 `Actor` barely used

`Actor` (`kernel/actor/actor.ts`) is returned by `@RequestActor()` and
`WsAuthService.authenticateSocket`; built from `AuthUser` / `AuthGuest` in
`auth/actor.mapper.ts`. Takers: `ConnectionPolicyPort.resolveTargetUserId`,
`TagsService.listTags`, `CalendarEventsService.listCalendarEvents`,
`MessagingService.canAccessThread`. ~74 service methods still take a bare
`userId: string`. `messaging.service.ts` duplicates methods in `X` / `guestX` pairs
(`sendAsUser`/`sendAsGuest`, `getThreadStats`/`getGuestThreadStats`, …) taking
`AuthGuest`; the gateway bridges via `toAuthGuest`.
Guest capability rules ("guests cannot attach files / suggest tasks / update status")
live only in `ws.gateway.ts`, so REST and WS can disagree.

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

### 3.9 `ws.gateway.ts` does three jobs

Transport + auth; 5 `@SubscribeMessage` commands (`message.send` duplicates the REST
path); 7 realtime `@EventHandler`s spanning messaging, timers, attention, tasks.

### 3.10 Inverted / cyclic module deps

- ~~`auth ↔ public-views`~~ — inverted in 2.6: auth declares `GuestIdentityRegistry`
  (`auth/contract/`), public-views registers its provider at bootstrap.
- `tasks → attention-items`: `task-status.util.ts` imports `AttentionItemStatus` (`mapTaskStatusToAttention`; batch status is already derived in tasks' terms).

### 3.11 No boundary enforcement

ESLint has only `simple-import-sort` + `unused-imports`. No dependency-cruiser, no
`eslint-plugin-boundaries`, no `no-restricted-imports`.

---

## 4. Known small defects

| Defect                                                                                                              | Where                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `isValidId` calls `UUID.parse`, which throws on malformed input → 500 instead of 400; also accepts any UUID version | `kernel/id.ts`                                        |
| Duplicate tag name → unmapped `23505` → 500. Uniqueness is case-sensitive (`uq_tags_user_name (user_id, name)`)     | `tagging/`, `apps/migrations/src/schema/tags.ts`         |
| 11 Nest `HttpException`s; no `storage` error catalog (also none for `auth`, `user-settings`)                        | `storage/attachments/services/attachments.service.ts` |
| `attachments.placement` enum (`public \| message`) names consumer contexts                                          | `attachments` table                                   |
| Comment says job `deleteAfterSeconds` default is 1h; it is 2 days                                                   | `scheduling/sync/calendar-sync.jobs.ts:16`            |
| `AuthGuard` provided by both `auth.module` and `authGuard.module`                                                   | `auth/`                                               |
| `GET /public/me` (`@AllowGuest`) returns 500 for a signed-in user (no `request.guest`)                              | `public-views/rest/public-visitors.controller.ts`     |
| Parallel integration suites share one outbox: a suite's dispatcher claims rows for any event it handles and enqueues only its own groups (e.g. dead-letters suite subscribes to real `task.deleted`) → occasional cross-suite flakes | `test/`, `platform/events/dispatcher`                 |
| Leftovers: `packages/*` in `pnpm-workspace.yaml`; empty `src/errors/`                                               | repo root, `apps/api/src`                             |

Event-delivery gaps (idempotency inbox, key prefixes, guest-recipient jobs, thread-room
duplicates) are listed in [platform/events §Known gaps](../platform/events.md#known-gaps).

## 5. Untested

`messaging` (only indirectly via the attention suite), `websockets`, public-views
services beyond guest sign-in, `networks`, `user-profile`, `user-settings`,
`calendar-integrations` (sync/OAuth), the auth guard's user-session path (better-auth
is ESM Jest can't load). Covered since Wave 2: guest sign-in + `AuthGuard` guest path,
`TagCatalogPort`, `assertUsable`, recurring/exception occurrences, guest message count.
