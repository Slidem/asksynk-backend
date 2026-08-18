# 01 — Current state

Everything here was derived mechanically from the tree at commit `fcd9922`. Where a
number appears, the command that produced it is reproducible.

---

## 1. Shape of the repo

pnpm workspace, no Turbo/Nx — orchestration is plain `pnpm -r`.

| Workspace         | Purpose                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| `apps/api`        | The entire backend: HTTP, WebSockets, event consumers, schedulers, pg-boss workers |
| `apps/migrations` | Drizzle schema + generated SQL                                                     |
| `packages/shared` | Event bus, event registry, email, pg-boss wrapper, scheduled jobs                  |
| `scripts`         | Two standalone `tsx` scripts                                                       |

> **`apps/background-worker` does not exist.** `CLAUDE.md` still references
> `apps/background-worker/.env.example`. All background work runs inside `apps/api`.
> Worth fixing in `CLAUDE.md`.

The three workspaces are **one TypeScript program**, not built artifacts —
`apps/api/tsconfig.json` `include`s `../migrations/src/**` and
`../../packages/shared/src/**`. There is no compile-time boundary between them.

```
"@/api/*"        -> apps/api/src/*
"@/migrations/*" -> apps/migrations/src/*
"@/shared/*"     -> packages/shared/src/*
```

---

## 2. Size

`apps/api/src`: **239 files, 16,745 lines**, 19 top-level directories.

| Module                            | Files |   LOC | Share |
| --------------------------------- | ----: | ----: | ----: |
| `tasks`                           |    27 | 2,249 | 13.4% |
| `calendar-integrations`           |    23 | 2,135 | 12.8% |
| `calendar-events`                 |    27 | 2,076 | 12.4% |
| `messaging`                       |    17 | 2,024 | 12.1% |
| `attention-items`                 |    14 | 1,699 | 10.1% |
| `timers`                          |    17 | 1,147 |  6.8% |
| `storage`                         |    14 |   877 |  5.2% |
| `public-views`                    |    16 |   811 |  4.8% |
| `networks`                        |    13 |   749 |  4.5% |
| `tags`                            |    14 |   722 |  4.3% |
| `auth`                            |    15 |   571 |  3.4% |
| `websockets`                      |     5 |   555 |  3.3% |
| `common`                          |    12 |   409 |  2.4% |
| `user-profile`                    |     9 |   277 |  1.7% |
| `user-settings`                   |     9 |   201 |  1.2% |
| `infrastructure`                  |     3 |   121 |  0.7% |
| root (`main.ts`, `app.module.ts`) |     2 |    80 |  0.5% |
| `events`                          |     1 |    26 |  0.2% |
| `health`                          |     1 |    16 |  0.1% |

Plus `packages/shared/src` 2,144 LOC, `apps/migrations` 1,269 LOC, `apps/api/test`
3,044 LOC.

Note the top five — `tasks`, the two calendar modules, `messaging`,
`attention-items` — are **61% of the codebase**. They are also where every
significant coupling problem lives.

---

## 3. What is already right

This section exists so the refactor does not undo working design.

**Controllers are clean.** Across all 19 controllers: zero import Drizzle, zero
import a repository, zero return a raw row. Every response goes through an explicit
mapper (`to*Response`). Across 31 DTO files, zero leak `typeof table.$inferSelect`.

**Services do not touch the database.** No service imports `drizzle-orm` or a schema
table. Persistence genuinely goes through repositories. `$inferSelect` types exist
only as private module-level aliases inside repository files, never exported.

**Transactions are uniform.** Every repository injects
`TransactionHost<TxAdapter>` and reads `this.txHost.tx`, which resolves to the
ambient CLS transaction or the pool. 94 `@Transactional()` annotations across 22
files. Because it is re-entrant, nested service calls share one transaction. There is
exactly **one** raw `db.transaction()` in the entire codebase — the outbox dispatcher,
which needs `FOR UPDATE SKIP LOCKED` outside any request context.

**A real transactional outbox.** `events_outbox` + two `AFTER INSERT` triggers →
`pg_notify`. Two delivery legs:

- _durable_ — a dispatcher drains the outbox into pg-boss queues named
  `${eventType}.${group}`;
- _realtime_ — `LISTEN evt:<name>` carries only the row id (8 KB notify limit), and
  the listener re-reads the payload.

The publisher is `@Transactional()`, so the outbox insert joins the caller's
transaction. This is the [transactional outbox pattern](https://microservices.io/patterns/data/transactional-outbox.html)
implemented correctly, including the idempotency requirement it imposes on consumers.

**WebSocket broadcasting is already a separate layer.** There are zero
`server.emit` / `server.to` calls outside [`ws.gateway.ts`](../../apps/api/src/websockets/ws.gateway.ts).
No domain service holds a reference to the gateway. Services only `publish()` to the
outbox; the gateway subscribes via realtime `@EventHandler`s. Many codebases get this
wrong; this one does not.

**One textbook context seam already exists.**
[`attachment-access.service.ts`](../../apps/api/src/storage/attachment-access.service.ts)
exposes `register(resolver)`, and
[`message-attachment.resolver.ts`](../../apps/api/src/messaging/attachments/message-attachment.resolver.ts)
self-registers at `onModuleInit`. The result: `storage` never depends on `messaging`.
**This is the pattern the rest of the refactor replicates.**

**Ports already exist — just not in `apps/api`.** `packages/shared` declares
`abstract class EventsPublisher` with `EventsPublisherImpl`, and
`abstract class ScheduledJobService` with `PgBossScheduledJobService`. The team knows
the pattern; it simply was not applied to the 21 repositories.

**Domain errors exist.** `AsksynkError` with an `ErrorType` enum plus a global
`AllExceptionsFilter`. Usage: **107 `AsksynkError.*` calls vs 17 Nest HTTP
exceptions** — and 11 of the 17 are in a single file.

---

## 4. What is wrong

### 4.1 Modules have no contract, so callers reach into internals

**16 cross-module imports of another module's repository, across 13 files, forming 7
edges:**

| Edge                                        | Count | Files                                                                                                                            |
| ------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------- |
| `calendar-integrations` → `calendar-events` |     7 | `calendar-sync.service.ts`, `calendar-integration.service.ts`, `calendar-outbound-sync.service.ts`, `calendar-sync.scheduler.ts` |
| `attention-items` → `tags`                  |     3 | `attention-due-date.service.ts`, `attention-items.module.ts`, `handlers/tag-calendar-attention.handler.ts`                       |
| `calendar-events` → `tags`                  |     2 | `calendar-events.module.ts`, `services/calendar-events.service.ts`                                                               |
| `auth` → `public-views`                     |     1 | `guest-auth.service.ts`                                                                                                          |
| `messaging` → `public-views`                |     1 | `services/messaging.service.ts`                                                                                                  |
| `messaging` → `storage`                     |     1 | `attachments/message-attachment.resolver.ts`                                                                                     |
| `user-profile` → `storage`                  |     1 | `services/user-profile.service.ts`                                                                                               |

Plus **19 cross-module service imports across 13 files** forming 13 edges — including
two where a **controller** injects another module's service to make an authorization
decision (`calendar-events.controller.ts` and `tags.controller.ts` both inject
`NetworksService`).

**Why this happens:** [`tags.module.ts`](../../apps/api/src/tags/tags.module.ts)
exports only `TagsService`. So three other modules **re-provide `TagRepository`
themselves** — `tags.module.ts`, `attention-items.module.ts`,
`calendar-events.module.ts`. That is **four separate instances** and no single write
path to the `tags` table.

This is the definition of a missing module contract. Grzybek:
_"everything that we share outside becomes the public API of the module"_ — here
nothing is deliberately shared, so consumers take what they need.

### 4.2 The database is the real integration layer

33 tables, 12 enums. **Nine foreign keys cross a module boundary:**

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

(Plus 17 FKs to `users.id`, which are a different matter — see
[06-persistence.md](06-persistence.md).)

**Two modules query tables they do not own**, and one does it in raw SQL:

- [`attention-items.repository.ts:370-411`](../../apps/api/src/attention-items/attention-items.repository.ts)
  hardcodes `calendar_events`, `calendar_event_tags` and
  `calendar_event_exceptions` in a `sql\`\``template, complete with a`CROSS JOIN LATERAL rrule.between(...)`extension call and a hardcoded 365-day
window — duplicating recurrence expansion that already exists in`calendar-events/utils/recurrence.utils.ts`.
- `public-view-guests.repository.ts` joins `messages` to compute a guest message
  count.
- `calendar.repository.ts` imports the `calendar_integrations` table.

This is Grzybek's _Shared Database Data_ integration style — the highest-coupling
option, where _"one little change to database structure or even data itself can break
another module without notice."_

**The one place it is done right:** `calendar_event_links.asksynk_event_id` is a
plain `uuid` with **no FK**, deliberately, so the link table can reference the other
side without binding to it. That is the pattern the other nine should follow.

### 4.3 The domain model is anemic

All 20 entity classes were audited for public behaviour. Here is every public method
on every entity:

| Entity                           | Public methods                                           |
| -------------------------------- | -------------------------------------------------------- |
| `calendar-event.entity.ts`       | `get isRecurring`, `belongsTo`                           |
| `calendar.entity.ts`             | `belongsTo`, `get isNative`                              |
| `task.entity.ts`                 | `get isDeleted`, `isVisibleTo`, `isAssignee`             |
| `task-batch.entity.ts`           | `get isDeleted`, `isVisibleTo`, `isAssignee`             |
| `task-suggestion.entity.ts`      | `isPending`, `isSuggestee`, `isSuggester`                |
| `attention-item.entity.ts`       | `belongsTo`, `get isDeleted`                             |
| `user-timer.entity.ts`           | `completesAt`, `remainingSeconds`, `isDue`               |
| `public-view.entity.ts`          | `belongsTo`, `isLive`                                    |
| `attachment.entity.ts`           | `isOwnedBy`, `isActive`                                  |
| `tag.entity.ts`                  | `belongsTo`                                              |
| `invite.entity.ts`               | `isForEmail`, `isPending`                                |
| `calendar-event-link.entity.ts`  | `get isMirrored`                                         |
| `calendar-integration.entity.ts` | `belongsTo`, `get isBidirectional`, `accessTokenExpired` |
| `thread.entity.ts`               | `isGuestThread`                                          |
| `message.entity.ts`              | `isReply`                                                |
| `user-settings.entity.ts`        | _(none)_                                                 |
| `user-timer-settings.entity.ts`  | _(none)_                                                 |
| `public-view-guest.entity.ts`    | _(none)_                                                 |
| `network-connection.entity.ts`   | _(none)_                                                 |
| `user-profile.entity.ts`         | _(none)_                                                 |

**Every single one is a predicate or a getter. There is not one mutator, not one
state transition, and not one constructor that rejects an invalid state.**

`create()` is a bare constructor alias:

```ts
// apps/api/src/tasks/entities/task.entity.ts:47
static create(props: TaskProps): Task {
  return new Task(props);
}
```

Fields are publicly mutable and mutated from outside:

```ts
// apps/api/src/attention-items/attention-items.service.ts:73-75
if (input.status !== undefined) item.status = input.status;
if (input.note !== undefined) item.note = input.note;
if (input.tagIds !== undefined) item.tagIds = input.tagIds;
```

Ownership and permission checks by layer: **services 49, entities 16, repositories 3,
gateway 1**. The entity supplies the predicate; the service supplies the rule.

Business rules live in procedural helpers instead of aggregates:

- `timers.service.ts:163-274` — transitions guarded by string comparison
  (`"Timer not paused"`, `"Timer not running"`)
- `tasks/task-status.util.ts` — `mapTaskStatusToAttention`, `aggregateBatchStatus`
- `task-suggestions.service.ts:258-284` — `requirePending()`
- `networks.service.ts:106,140` — invite status guards

### 4.4 There are no ports

`grep 'abstract class|interface .*Repository|implements .*Repository'` over
`apps/api/src` returns **nothing for repositories**. 21 concrete `@Injectable()`
Drizzle classes, injected by concrete type:

```ts
// every service, e.g. tasks.service.ts:25
constructor(private readonly tasksRepository: TasksRepository) {}  // the Drizzle class
```

There is no seam to substitute a fake. Only 3 files in all of `apps/api` contain
`export abstract class` — and none of them is a repository.

### 4.5 Unit tests cannot run

```ts
// apps/api/jest.config.ts:6
testMatch: ["**/*.integration.test.ts"],
```

A `*.spec.ts` file would be **silently ignored**. There are currently **0 `*.spec.ts`
files** in the repo. The 5 integration tests (3,044 LOC) all boot real Nest modules
and require a live Postgres via `globalSetup`, which shells out to
`drizzle-kit push --force` and truncates every table.

Covered: `attention-items`, `calendar-events`, `storage`, `tasks↔attention`,
`timers`.
**Not covered at all:** `messaging` (the 683-line largest service),
`calendar-integrations` (2,135 LOC), `networks`, `tags`, `public-views`,
`user-profile`, `user-settings`, `websockets`, `auth`.

Roughly **700 lines of already-pure, dependency-free logic** could be unit tested
today with no refactor at all — the 20 entity classes, `recurrence.utils.ts`
(229 LOC), `task-status.util.ts`, `oauth-state.util.ts`, `AsksynkError`, and the
due-date selection algorithm. None of it is, because the config will not run the
tests.

### 4.6 The published language lives outside every context

`packages/shared/src/event-registry/events.registry.ts` is **347 lines defining 24
events for every bounded context in the system** — tags, messaging, calendar, timers,
tasks, suggestions, attention. Every context's contract lives outside that context.

It also carries a known duplication: `AttentionItemUpserted`'s zod schema is a
hand-maintained copy of `AttentionItemResponse` in `apps/api`, because
`packages/shared` must not depend on `apps/api`. The comment in the file acknowledges
the drift risk.

### 4.7 `attention_items` is a projection wearing an aggregate's clothes

- The `type` enum names the **source context**, not a property of the item:
  `tagged_message | incoming_email | slack_message | whatsapp_message |
suggested_timeblock | suggested_task | task`.
- Source identity hides inside an untyped `metadata jsonb`. The repository looks
  items up with `metadata->>'messageId' = $1`, `metadata->>'taskId' = $1`,
  `metadata->>'taskBatchId'`, `metadata->>'suggestionId'` — **four query paths with
  no supporting index**.
- `source_calendar_event_id` is a `uuid` with no FK.
- `attention_item_tags.tag_id` has **no FK**, unlike the four sibling tag junction
  tables. This is deliberate: `findByTagIds` intentionally skips the `tags` join so
  "ghost" rows pointing at a just-deleted tag remain findable by the tag-deleted
  handler. Every _other_ read path does `leftJoin(tags)` and silently drops them.
- `upsertFromSource` hardcodes `type: "task"` for both tasks and batches
  ([`attention-items.service.ts:112`](../../apps/api/src/attention-items/attention-items.service.ts)).

It consumes events from four contexts and publishes back into two. It is the hub of
the system and the least typed thing in it.

### 4.8 Two inverted dependencies, and one import that should not exist

- `common/decorators/param.decorators.ts` and `common/decorators/validators.ts`
  import `isIsoDateWithOffset` / `isValidIanaTimezone` from
  `calendar-events/utils/recurrence.utils` — **the shared kernel depends on a
  feature**.
- `auth/auth.module.ts` imports `PublicViewsModule`, and `auth/guest-auth.service.ts`
  injects `PublicViewGuestsRepository` — **the global guard depends on a feature
  module**.
- `auth/auth.guard.ts:16` imports `CalendarEventsRepository` **solely to name a
  logger**: `new ContextLogger(CalendarEventsRepository.name)`. Both a copy-paste bug
  (the logger is mislabelled) and a hard coupling from the auth boundary into
  calendar persistence.
- `messaging/services/messaging.service.ts:3` imports `WsIdentity` from
  `src/websockets/...` — a transport type inside a domain service, and the _reverse_
  of the declared module dependency. It is also one of four files using a
  non-aliased `src/`-rooted import, against the rule in `CLAUDE.md`.

### 4.9 Smaller defects worth fixing while nearby

- **`tags.name` is globally `.unique()`** rather than unique per user. A second user
  creating a tag name that already exists anywhere gets a `23505`. This is a live
  bug.
- **`tag.created` has no publisher and no consumer.** Dead contract.
- **The `email` group on `tag.created` / `tag.updated` has no handler.** The
  dispatcher still creates the `tag.updated.email` pg-boss queue and enqueues jobs
  into it that nothing will ever work.
- **Realtime-only outbox rows are never marked dispatched.** The dispatcher's
  `WHERE` clause excludes `delivery_mode = 'realtime'`, so those rows accumulate
  forever. There is no retention job, and no index on `dispatched_at` / `failed_at` —
  the dispatcher's poll query will sequential-scan as the table grows.
- **`ws.gateway.ts` (555 LOC) does three jobs**: WebSocket transport, an inbound
  command surface (`@SubscribeMessage("message.send")` with a 128-line handler that
  duplicates the REST path), and an event-consumer surface with 7 realtime
  `@EventHandler`s spanning four contexts.
- **`messaging` handles actor polymorphism by method duplication** — 17 public
  methods with systematic `X` / `guestX` pairs. There is no domain-level Actor
  concept.
- **`attachments.placement` enum (`public | message`)** encodes consumer contexts
  inside the storage table.
- **better-auth runs its own second `pg.Pool` and `drizzle()` instance**, separate
  from `infrastructure/db`.
- **No lint-enforced boundaries.** `eslint.config.js` carries only
  `unused-imports` and `simple-import-sort`. Nothing mechanically prevents any of the
  above.

---

## 5. Structural inconsistency

Three module shapes coexist:

- **Layered** — `calendar-events`, `tasks`, `public-views`, `networks`:
  `entities/ models/ repositories/ services/ rest/`
- **Partial** — `attention-items` (services at the module root),
  `messaging`, `storage` (which nests a whole sub-context under `attachments/`)
- **Flat** — `timers`, `user-settings`, `auth`

A new contributor cannot predict where anything lives. That is a boundary problem
before it is a taste problem.

---

Next: [02-why-not-ddd.md](02-why-not-ddd.md) — why this shape resists the growth
that is planned.
