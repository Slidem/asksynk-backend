# 01 — Current state

Audited at `5129fc8` (2026-10-10). Paths are relative to `apps/api/src/` unless noted.

## 1. Shape

pnpm workspace: `apps/api` (the whole backend — HTTP, WebSockets, event consumers,
jobs), `apps/migrations` (Drizzle schema + SQL), `scripts`. One process; no worker app.

`apps/api/src`: ~20.7k LOC. `apps/api/test`: ~5k LOC.

| Module                  |   LOC | Notes                                              |
| ----------------------- | ----: | -------------------------------------------------- |
| `platform/`             | 3,833 | shared framework-aware infra (tier, not a context) |
| `tasks`                 | 2,301 |                                                    |
| `calendar-integrations` | 2,153 | merges into `scheduling` (ADR 0003)                |
| `messaging`             | 2,106 | no direct tests                                    |
| `calendar-events`       | 2,094 | merges into `scheduling`                           |
| `attention-items`       | 1,758 | the core domain                                    |
| `timers`                | 1,142 |                                                    |
| `storage`               |   867 |                                                    |
| `public-views`          |   827 |                                                    |
| `networks`              |   779 |                                                    |
| `tags`                  |   726 |                                                    |
| `auth`                  |   619 |                                                    |
| `websockets`            |   554 | `ws.gateway.ts` 459 LOC                            |
| `user-profile`          |   285 |                                                    |
| `events`                |   262 | dead-letter admin REST only                        |
| `user-settings`         |   192 |                                                    |
| `kernel/`               |   115 | pure shared tier                                   |

Module folder shapes are inconsistent (`entities/ models/ repositories/ services/ rest/`
in some, services at the root in `attention-items`, flat in `timers`). Nothing is
layered as `domain / application / infrastructure` yet.

---

## 2. What is solid — keep it

- **Controllers are clean.** None touches Drizzle or a repository; every response goes
  through a mapper; no DTO leaks `$inferSelect`.
- **Services never hit the DB directly.** Persistence goes through repositories.
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
  projects. 10 unit files (jobs, events runtime, errors translator, recurrence utils,
  task status, slug, admin guard), 9 integration files (attention, calendar events,
  tasks↔attention, timers, storage, jobs, dead letters, retention).

---

## 3. What is still wrong

### 3.1 Modules have no contract, so callers reach into internals

**16 imports of another module's repository:**

| Edge                                        | Count | Where                                                                                                                        |
| ------------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------- |
| `calendar-integrations` → `calendar-events` |     7 | `calendar-sync.service`, `calendar-integration.service`, `calendar-outbound-sync.service`, `sync/calendar-sync.job-handlers` |
| `attention-items` → `tags`                  |     3 | `attention-due-date.service`, `attention-items.module`, `handlers/tag-calendar-attention.handler`                            |
| `calendar-events` → `tags`                  |     2 | `calendar-events.module`, `services/calendar-events.service`                                                                 |
| `auth` → `public-views`                     |     1 | `guest-auth.service` (`PublicViewGuestsRepository`)                                                                          |
| `messaging` → `public-views`                |     1 | `services/messaging.service` (`PublicViewsRepository`)                                                                       |
| `messaging` → `storage`                     |     1 | `attachments/message-attachment.resolver`                                                                                    |
| `user-profile` → `storage`                  |     1 | `services/user-profile.service`                                                                                              |

Why: modules export internals or nothing useful. `TagsModule` exports only
`TagsService`, so **`TagRepository` is provided by 3 modules** (3 instances).
`CalendarEventsModule`, `MessagingModule`, `PublicViewsModule` and the `@Global`
`StorageModule` export repositories.

Beyond repositories: 103 cross-module imports over 34 edges (46 of them are auth
decorators/types in controllers — harmless). Heaviest: `messaging → storage` (12 incl.
repo), `calendar-integrations → calendar-events` (15 incl. repos), `websockets →
messaging` (5), `tasks → tags` (4, `TagsService`), `messaging → tasks` (3,
`TaskSuggestionsService`), four modules → `NetworksService`.
`calendar-events.controller` and `tags.controller` inject `NetworksService` to decide
whose data the actor may read.

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

**Queries on tables a module doesn't own:**

- `attention-items.repository.ts:355-423` (`findEarliestUpcomingOccurrenceForTags`) —
  raw SQL CTE over `calendar_events`, `calendar_event_tags`,
  `calendar_event_exceptions`, `CROSS JOIN LATERAL rrule.between(...)`, hardcoded
  365-day window. Duplicates recurrence logic in `recurrence.utils.ts`.
- `attention-items.repository.ts` joins `tags` 6× via the query builder.
- `messaging.repository.ts:446-497` — raw SQL joining `users`, `public_view_guests`,
  `public_views`, `user_network`.
- `public-view-guests.repository.ts:111-114` — joins `messages` for a count.
- `calendar.repository.ts:98-105` — joins `calendar_integrations`.

### 3.3 The core rule is the least-modelled code

The tag → due-date rule is `AttentionDueDateService.pickEarliestCandidate`
(`attention-items/attention-due-date.service.ts:75-102`), a private method on a DI
class; its other half is the raw SQL above. The "pinned due date must not move"
invariant is a `.filter()` inside `recomputeForItems` (31-55).

### 3.4 The domain model is anemic

20 entity classes; each has a bare `static create()` and only predicates/getters
(`belongsTo`, `isDeleted`, `isPending`…). None owns a state transition. A few encode
a small rule: `UserTimer` (`completesAt`, `remainingSeconds`, `isDue`),
`CalendarIntegration.accessTokenExpired`, `PublicView.isLive`, `Invite.isForEmail`.

State machines live in services:

- `timers/timers.service.ts` — five-state timer (`idle | running | paused | completed
| stopped`): `persistStart` 168-202, `persistResume` 204-221, `persistPause` 223-249,
  `persistStop` 251-279, `complete` 303-328, `validateTransitionInput` 354-367. The
  repository repeats the guards as `WHERE` clauses (a concurrency guard — keep it).
- `tasks/services/task-suggestions.service.ts` — `requirePending()` guards.
- `networks/services/networks.service.ts` — invite status guards.
- `attention-items.service.ts` — status/note/tags assigned field by field.

### 3.5 No ports

21 concrete `@Injectable()` Drizzle repositories, injected by concrete type. Ports
exist only in `platform/` (`EventsPublisher`, `JobScheduler`, `Clock`,
`ObjectStorage`, `EmailProvider`, `CalendarProvider`).

### 3.6 `Actor` barely used

`Actor` (`kernel/actor/actor.ts`) is returned by `@RequestActor()` and
`WsAuthService.authenticateSocket`; built from `AuthUser` / `AuthGuest` in
`auth/actor.mapper.ts`. Takers: `NetworksService.resolveTargetUserId`,
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

- `auth ↔ public-views`: `auth.module` imports `PublicViewsModule`,
  `guest-auth.service` injects `PublicViewGuestsRepository` + `hashGuestToken`; public
  views controllers import auth decorators. The global guard depends on a feature.
- `tasks → attention-items`: `task-status.util.ts` imports `AttentionItemStatus`.

### 3.11 No boundary enforcement

ESLint has only `simple-import-sort` + `unused-imports`. No dependency-cruiser, no
`eslint-plugin-boundaries`, no `no-restricted-imports`.

---

## 4. Known small defects

| Defect                                                                                                              | Where                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `isValidId` calls `UUID.parse`, which throws on malformed input → 500 instead of 400; also accepts any UUID version | `kernel/id.ts`                                        |
| Duplicate tag name → unmapped `23505` → 500. Uniqueness is case-sensitive (`uq_tags_user_name (user_id, name)`)     | `tags/`, `apps/migrations/src/schema/tags.ts`         |
| 11 Nest `HttpException`s; no `storage` error catalog (also none for `auth`, `user-settings`)                        | `storage/attachments/services/attachments.service.ts` |
| `attachments.placement` enum (`public \| message`) names consumer contexts                                          | `attachments` table                                   |
| Comment says job `deleteAfterSeconds` default is 1h; it is 2 days                                                   | `calendar-integrations/sync/calendar-sync.jobs.ts:16` |
| `AuthGuard` provided by both `auth.module` and `authGuard.module`                                                   | `auth/`                                               |
| Leftovers: `packages/*` in `pnpm-workspace.yaml`; empty `src/errors/`                                               | repo root, `apps/api/src`                             |

Event-delivery gaps (idempotency inbox, key prefixes, guest-recipient jobs, thread-room
duplicates) are listed in [platform/events §Known gaps](../platform/events.md#known-gaps).

## 5. Untested

`messaging` (only indirectly via the attention suite), `websockets`, guest sign-in /
`GuestAuthService` / public-views services, `tags`, `networks`, `user-profile`,
`user-settings`, `calendar-integrations`, the auth guard, the due-date rule as a unit.
