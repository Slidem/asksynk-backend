# 07 — Roadmap

Each wave ships on its own and leaves the app working. Order: pure core → contracts →
layers + lint → transport → aggregates → attention redesign → schemas → cleanup.
Efforts are relative-size guesses for one developer.

**Waves 0–4 are done.** No boundary-lint warnings left. `tasks` still speaks attention's
status vocabulary via `attention/contract/attention-item-status.public.ts` until its
outbound translator (6.2).

**Wave 0 is done** — jest unit/integration split, `kernel/` + `platform/`, typed
errors, ordered events + dead letters + retention, typed jobs. Its leftovers moved:
the `no-restricted-imports` rule → 3.1; case-insensitive tag names → backlog.

**Placement (since Wave 3):** every context is layered
`contract / domain / application / infrastructure / presentation` under its target name
([03 §3](03-layering.md#3-folder-template)); lint enforces it. Tests mirror
`apps/api/test/<context>/<file>.unit.test.ts`.

---

## Wave 1 — Extract the pure core ✅

**~1–2 days. No schema change. Every step is a move plus a unit test.**

| #   | Step                                        | Effort | Risk       | Safety net                                                  |
| --- | ------------------------------------------- | ------ | ---------- | ----------------------------------------------------------- |
| 1.1 | `Actor` in `kernel/` ✅                     | 3h     | low        | integration suites (attention ↔ messaging)                  |
| 1.2 | Due-date policy as a pure function ✅       | 2h     | none       | `attention-items.events-handler`, `tasks-attention`         |
| 1.3 | Batch status derived in tasks' own terms ✅ | 1h     | none       | `task-status.util.unit`, `tasks-attention`                  |
| 1.4 | Timer state machine as a domain object ✅   | 4h     | **medium** | `timers.integration.test.ts` (14 cases)                     |
| 1.5 | `RecurrenceRule` value object ✅            | 2h     | low        | `recurrence.utils.unit` (26), `calendar-events.integration` |

### 1.1 `Actor` ✅

```ts
// kernel/actor/actor.ts   (the empty kernel/actor/ folder is already there)
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

export const ownerUserIdOf = (a: Actor): string =>
  a.kind === "guest" ? a.ownerUserId : a.userId;
```

- `@RequestActor()` (`auth/requestActor.decorator.ts`) returns `Actor`; delete
  `RequestActor` (`auth/auth.types.ts:29`). Callers: `calendar-events.controller.ts:93`,
  `tags.controller.ts:61`, `NetworksService.resolveTargetUserId` (`networks.service.ts:182`).
- `WsAuthService.authenticateSocket` returns `Actor`; delete `WsIdentity`. Update
  `ws.gateway.ts` (95, 150, 263, 311) and `messaging.service.ts` (33, 163) — this
  removes the `messaging → websockets` cycle.
- Don't convert the ~74 `userId: string` methods now. Rule from here on: new or
  touched application methods take `Actor`. Collapsing messaging's `X`/`guestX` pairs
  is 4.3.
- Test: `test/kernel/actor.unit.test.ts` — `ownerUserIdOf` for both kinds.

### 1.2 Due-date policy ✅

- New `attention-items/domain/due-date.policy.ts`: `decideDueDate` +
  `AnswerModeSpec`, `TimeblockOccurrence`, `DueDateDecision`, exactly as in
  [06 §6](06-attention-core.md#6-the-tag--due-date-policy). Attention declares these
  types itself (domain can't import another context's contract).
- `AttentionDueDateService` maps `Tag` → `AnswerModeSpec` and calls `decideDueDate`;
  delete `pickEarliestCandidate` (`attention-due-date.service.ts:75-102`).
- Inject `Clock` instead of `new Date()` in `recomputeForItems` (line 40).
- Leave the `dueDatePinned` filter and the raw SQL where they are — Wave 5/6 and 2.3.
- Test: `test/attention-items/due-date.policy.unit.test.ts` — immediate wins,
  timeblock wins, mixed tie keeps first, no tags, timeblock without occurrence.

### 1.3 Batch status in tasks' terms ✅

- New `tasks/domain/task-batch-status.ts`:
  `deriveBatchStatus(statuses: TaskStatus[]): TaskStatus` — all `completed` →
  `completed`; empty or all `todo` → `todo`; else `in_progress`.
- Delete `aggregateBatchStatus`; `task-batches.service.ts:133` uses
  `mapTaskStatusToAttention(deriveBatchStatus(statuses))` (same results).
- `mapTaskStatusToAttention` stays in `task-status.util.ts` — the one place tasks
  speaks attention's vocabulary, until it becomes tasks' outbound translator (6.2).
- Test: split the existing `test/tasks/task-status.util.unit.test.ts`; batch cases
  move to `task-batch-status.unit.test.ts` with `TaskStatus` expectations.

### 1.4 Timer state machine ✅

- New `timers/domain/timer.ts`: a `Timer` built from the `UserTimer` props with
  `start(session, now)`, `pause(now)`, `resume(now)`, `stop(now)`, `complete(now)`.
  Each throws a typed `timersError(...)` on an illegal transition and returns the
  transition (`started | paused | resumed | stopped | completed`) for the service to
  persist, publish, and (re)schedule the completion job.
- Move the guards out of `timers.service.ts`: `persistStart` 168-202 (auto-complete
  when already running), `persistResume` 204-221, `persistPause` 223-249 (completes
  instead of pausing when already due), `persistStop` 251-279, `complete` 303-328,
  `validateTransitionInput` 354-367. Fold `UserTimer.completesAt` /
  `remainingSeconds` / `isDue` in.
- **Keep** the repository's `WHERE status = …` guards — they are the concurrency
  check, not the rule. Keep lazy completion in `getCurrent` and the
  `transitionedAt` staleness check in `handleScheduledCompletion`.
- Test: `test/timers/timer.unit.test.ts`, ~12 cases — every legal transition, every
  illegal one, pause-after-due completes, `remainingSeconds` clamps at 0.
- As built: `Timer` replaced the `UserTimer` entity (repository returns it);
  `now` only on `pause`/`stop` (the others don't need it); `validateTransitionInput`
  became `assertValidTransitionInput` in the same file.

### 1.5 `RecurrenceRule` ✅

- New `calendar-events/domain/recurrence-rule.vo.ts`: `RecurrenceRule.create(rrule,
timezone, start)` wraps `validateAndNormalizeRrule` (rejects `COUNT=`, defaults
  `UNTIL` to start + 1y, caps `UNTIL` at 12 months, embeds `TZID=`); exposes
  `.value` and `.withUntil(date)` (`replaceRruleUntil`).
- Move `recurrence.utils.ts` (233 LOC) to `calendar-events/domain/recurrence.ts`;
  update its 4 importers (`calendar-events.service`, `calendar-events.controller`,
  `calendar-sync.service`, `calendar-outbound-sync.service`) and the unit test import.
- Callers that validate rrules construct a `RecurrenceRule` instead.
- Test: existing `recurrence.utils.unit.test.ts` (26) keeps passing; add VO cases.
- As built: test renamed `recurrence.unit.test.ts`; `RecurrenceRule.restore(value)`
  rehydrates a stored rrule for `withUntil`. `CalendarEvent.rrule` stays a string.

**Done when:** `pnpm test:unit` covers policy, batch status, timer, recurrence rule,
actor; `pnpm test:integration` unchanged and green.

---

## Wave 2 — Ports and contracts, one context at a time ✅

**3–5 days.** Smallest first to validate the template.

| #   | Step                                                                                                                                                                                                                    | Effort | Risk              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------- |
| 2.1 | **`tags` → `tagging` pilot ✅.** `domain/ports/tag.repository.ts` + Drizzle adapter; `contract/tag-catalog.port.ts` (`assertOwnedBy`, `getAnswerModes`). Module exports only the contract. Kills the 3× `TagRepository` | 4h     | low               |
| 2.2 | **Merge into `scheduling` ✅.** `calendar-events` + `calendar-integrations`, pure file moves, no behaviour change                                                                                                       | 1 day  | **medium**        |
| 2.3 | `scheduling/contract/occurrence.port.ts`; move `attention-items.repository.ts:355-423` verbatim ✅                                                                                                                      | 4h     | low               |
| 2.4 | `storage` contract ✅: `AttachmentCatalogPort` (`getSummaries`, `assertUsable`, `resolveMany`); drop `@Global` + repo export                                                                                            | 2h     | low               |
| 2.5 | `networks` contract ✅: `ConnectionPolicyPort`; `resolveTargetUserId` out of the two controllers into application code, using `Actor`                                                                                   | 3h     | low               |
| 2.6 | Invert `auth → public-views` ✅: `GuestIdentityProvider`, registered by sharing at bootstrap                                                                                                                            | 4h     | **medium** — auth |
| 2.7 | `sharing` contract ✅: public-link liveness for messaging; ports for the cross-table reads in `messaging.repository.ts:446-497` and `public-view-guests.repository.ts`                                                  | 3h     | low               |
| 2.8 | Repository ports for the rest ✅: `timers`, `tasks`, `networks`, `public-views`, `messaging`, `attention-items`                                                                                                         | 1 day  | low, mechanical   |

- After 2.1: `grep -rn "TagRepository" apps/api/src | grep -v "^apps/api/src/tagging/"` → empty.
  As built: `Tag` + answer-mode types in `tagging/domain/tag.ts`; adapter
  `tagging/repositories/drizzle-tag.repository.ts` (layer folders wait for 3.2);
  `TagsService extends TagCatalogPort`, bound `useExisting`. Error namespace stays
  `tags`. Calendar tag validation now throws `tags.tags_not_found` (404) instead of
  `calendar-events.one_or_more_tags_not_found` (409). Attention's `tags` join (ghost
  filtering) stays until 7.2. Test: `test/tagging/tag-catalog.unit.test.ts`.
- After 2.2: both calendar integration suites green;
  `grep -rlE "@/api/calendar-(events|integrations)" apps/api/src apps/api/test` → empty.
  As built: two Nest modules under `scheduling/` — `SchedulingModule` (native calendar)
  and `CalendarIntegrationsModule` (provider sync, needs Google env + jobs) — merged in
  3.2. Error namespaces, queue/job/cron names and routes unchanged. Tests in
  `test/scheduling/`. Two unused model files deleted.
- After 2.3: SQL moved byte-identical to `scheduling/repositories/calendar-occurrence.query.ts`
  (`DrizzleCalendarOccurrenceQuery`); `SchedulingModule` exports `CalendarOccurrencePort`
  (+ its repos for the sibling sync module). New attention cases: recurring timeblock,
  cancelled occurrence.
- After 2.4: `storage/contract/attachment-catalog.port.ts` (`assertUsable`, `resolveMany`;
  `getSummaries` dropped — no consumer) + `attachment-access.port.ts` (resolver registry;
  resolvers get the id, not the entity). New `storage` catalog: `storage.attachment_not_usable`
  replaces `messaging.invalid_attachment` + `user-profile.invalid_avatar_attachment`.
  Messaging owns `MessageAttachmentResponseDto`. Messaging, user-profile, websockets import
  `StorageModule` explicitly.
- After 2.5: `networks/contract/connection-policy.port.ts` (`areConnected`, `assertConnected`,
  `resolveTargetUserId`), `NetworksService extends` it, bound `useExisting`; module exports
  only the port. `TagsService.listTags` / `CalendarEventsService.listCalendarEvents` take
  `Actor` + optional `userId`.
- After 2.7: `public-views/contract/public-link.port.ts` (`isLive`, `getLinkSummaries`,
  `getGuestSummaries`); module exports only it. Thread list SQL keeps messaging's tables +
  `users`; `MessagingService` enriches via `PublicLinkPort` + `ConnectionPolicyPort.connectedAmong`
  (now requires both network rows — a thread with none shows frozen). Guest message count is
  sharing's projection: `public_view_guests.message_count` + `last_counted_message_id`
  watermark (idempotent), migration `0011_guest_message_count` with backfill, group
  `public-views`.
- After 2.8: 20 more repositories → `<ctx>/domain/ports/<name>.repository.ts` +
  `Drizzle…` adapter next to the old file (also `scheduling` ×4, `user-profile`,
  `user-settings`, `storage`; platform events repos left alone). Exported row/view types
  moved into the ports. `MessagingModule` / `NetworksModule` dropped dead repo exports.
- **2.6 needs a test first** — guest sign-in has none. Write it before touching auth.
  As built: `test/auth/guest-auth.integration.test.ts` (real `AuthGuard`; `AuthService`
  jest-mocked — better-auth is ESM Jest can't load). `auth/contract/guest-identity.provider.ts`
  declares `GuestIdentityProvider` + `GuestIdentityRegistry`; `GuestAuthService` is the
  registry, in a small `GuestIdentityModule` (no better-auth). Public-views'
  `PublicViewGuestIdentityProvider` registers on init. No provider → guest tokens rejected.

## Wave 3 — Layer folders + boundary lint ✅

**2–3 days.** Executed per [plans/wave-3.md](plans/wave-3.md).

| #   | Step                                                                                                                  | Effort |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------ |
| 3.1 | Add `dependency-cruiser`, `eslint-plugin-boundaries` and `no-restricted-imports` (see Guardrails), as **warnings** ✅ | 2h     |
| 3.2 | Move each context into `contract / domain / application / infrastructure / presentation`; rename to target names ✅   | 2 days |
| 3.3 | Promote rules to `error`; `pnpm lint:boundaries` chained into `pnpm lint` ✅                                          | 1h     |

As built:

- Renames: `storage`→`files`, `timers`→`focus`, `networks`→`network`,
  `public-views`→`sharing`, `attention-items`→`attention`, `messaging`→`conversations`;
  module classes + `<ctx>.errors.ts` files follow. **Unchanged:** routes, error
  namespaces, consumer-group / queue / job names. `auth`, `user-profile`,
  `user-settings` layered in place (merge into `identity` is 8.3).
- Auth transport helpers (decorators, `AuthUser`/`AuthGuest` types, `actor.mapper`,
  `AdminApiKeyGuard`) → `platform/http/auth/`.
- Wave 2 leftovers: `tasks/contract/task-suggestion.port.ts` (`TaskSuggestionPort.suggest`
  + payload type; messaging injects it); `AttentionItemStatus` →
  `attention/contract/attention-item-status.public.ts`.
- Placement choices: `defineJob` definitions in `application/jobs/` (services schedule
  them); `domain/` may import its own `contract/` types; entity files drop `.entity`;
  wire-shape mappers used for event payloads live in `application/read/*.view.ts`
  (attention, task suggestion). `TaskSuggestionsService`'s `@EventHandler`s extracted to
  `presentation/events/suggestion-sync.handler.ts`.
- Scheduling: one `SchedulingModule` (exports only `CalendarOccurrencePort`); jsonb shape
  types declared in `domain/`; `CalendarProviderRegistry` built by a module factory.
  Tests reaching it load dummy Google config (`test/helpers/googleTestConfig.ts`).
- better-auth's `better-auth.ts` / module stay at the `auth` root (library boundary);
  ESLint allows auth application/presentation to import them.
- dependency-cruiser config lives in `apps/api/.dependency-cruiser.cjs` (run from
  `apps/api`). `schema-ownership` deferred to 7.3. Extra rules:
  `application-never-imports-presentation`, `domain-no-migrations-schema`,
  `module-imports-module-or-contract`. `websockets` is `warn` until Wave 4.
- Seen during the wave (pre-existing): cross-suite integration flakes (outbox claims,
  dispatcher tick after pg-boss stop, one supertest 401) — each suite passes alone.

## Wave 4 — Transport adapters ✅

**~2 days.** Untangles `ws.gateway.ts`. Executed per
[plans/wave-4-transport-adapters.md](plans/wave-4-transport-adapters.md).

| #   | Step                                                                                                                                 | Effort | Risk            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------------- |
| 4.0 | Upgrade the whole Nest stack to 11 ✅                                                                                                | 2h     | low             |
| 4.1 | `platform/realtime/realtime-broadcaster.ts`; the gateway implements it ✅                                                            | 2h     | low             |
| 4.2 | Move the 7 realtime `@EventHandler`s into per-context broadcasters ✅                                                                | 4h     | low             |
| 4.3 | **Collapse messaging's `X`/`guestX` pairs using `Actor`**; guest capability rules move from the gateway into the application layer ✅ | 1 day  | **medium-high** |
| 4.4 | Move the 5 `@SubscribeMessage` commands into the owning contexts, reusing REST DTOs and use cases ✅                                 | 3h     | low             |

4.3 is the riskiest step in the plan: messaging has no direct tests. Write them first.
Verify with a fake `RealtimeBroadcaster`, and that WS and REST reject the same invalid
payloads identically.

As built:

- 4.0: Nest 11 (`common`/`core`/`platform-express`/`testing` 11.2, `swagger` 11.4, `cli`
  11). `@All("*")` → `@All("*splat")` in `auth.controller.ts`; `main.ts` sets Express 5
  `query parser` to `extended` (keeps `a[b]=x`).
- 4.1: `RealtimeBroadcaster.emit(targets[], event, payload)` + `RealtimeTarget` +
  `roomOf()` in `platform/realtime/` — one `emit` so socket.io dedupes a socket present in
  several target rooms. `WsGateway extends RealtimeBroadcaster`; `WebsocketsModule` is
  `@Global()` and exports only the port (`useExisting: WsGateway`). Socket auth is
  `auth/contract/actor-authenticator.port.ts` (`ActorAuthenticator.authenticate(headers)`),
  impl `auth/application/actor-authenticator.service.ts`; the gateway builds the header
  bag (`handshake.auth.token` → `Bearer`). Deleted `ws-auth.service.ts`, `ws.rooms.ts`,
  `ws.types.ts` (`Ack` → `platform/realtime/ws-ack.ts`; `USER_NOTIFICATION_EVENT` dropped).
- 4.2: `conversations/presentation/ws/messaging.broadcaster.ts`,
  `attention/…/ws/attention.broadcaster.ts`, `focus/…/ws/timers.broadcaster.ts`,
  `tasks/…/ws/task-suggestions.broadcaster.ts`, each a provider in its context module.
  Tests: `test/conversations/messaging.broadcaster.unit.test.ts`,
  `test/focus/timers.broadcaster.unit.test.ts`.
- 4.3: characterization suite `test/conversations/messaging.integration.test.ts` first
  (helpers `test/helpers/messagingActors.ts`, `noopRealtimeModule.ts`). `MessagingService`
  now exposes `send(actor, SendMessageInput)` (`application/send-message.model.ts`),
  `tagMessage`, `updateManagedStatus`, `listMessages`, `listReplies`, `getThreadStats`,
  `listTaggedMessages` — all on `Actor`; reads share `readableThreadId`. New exposable
  `messaging` keys carrying the old ack strings verbatim: `thread_id_required`,
  `guest_cannot_attach_files`, `guest_cannot_suggest_tasks`, `guest_cannot_update_status`.
  `toAuthGuest` deleted.
- 4.4: `conversations/presentation/ws/conversations.gateway.ts` + `dto/` (class-validator,
  messages = old ack strings; `IsIdList` dedupes id lists). Shared WS plumbing in
  `platform/realtime/`: `@WsCommand(event)` (= `@SubscribeMessage` + payload-only
  `ValidationPipe` + `WsAckInterceptor`), `@WsActor()`, `WS_GATEWAY_OPTIONS`. No REST
  equivalents exist for these commands, so no DTO sharing (the row's "reusing REST DTOs"
  didn't apply). Tests: `test/platform/ws-ack.interceptor.unit.test.ts`,
  `test/conversations/ws-dtos.unit.test.ts`.
- Finish: `websockets` `warn` override and the `websockets-via-contract-only` depcruise
  rule removed; `websockets/` imports only `auth/contract` + `platform/`.

## Wave 5 — Rich aggregates

**3–5 days.** Order by value: `TaskSuggestion` → `Invite` → `Task`/`TaskBatch` →
`AttentionItem` → `CalendarEvent` → `CalendarIntegration` (`Timer` was 1.4).
Each: write the spec, move the rules from the service into the aggregate, delete the
procedural guard. Methods per [03 §7](03-layering.md#7-rich-vs-not).

## Wave 6 — Attention core redesign

**2–3 days plus a real migration.** Design: [06](06-attention-core.md).

| #   | Step                                                                                                                     | Risk     |
| --- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| 6.1 | Add `source_*` + `preview` nullable; backfill from `metadata`; verify counts; add unique index                           | **high** |
| 6.2 | `AttentionSourceUpserted/Removed`; port `tasks` (outbound translator, `TaskUpserted` carries `TaskStatus`); dual-publish | low      |
| 6.3 | Port `messaging` and the tag/calendar recompute handlers; delete the 3 bespoke handlers                                  | medium   |
| 6.4 | Reads via `findBySource` (check `EXPLAIN`); **separate commit:** drop `metadata`, `type`, enum                           | medium   |
| 6.5 | Publish `attention.item.resolved`                                                                                        | none     |

Verify: counts per old `type` = counts per `(source_context, source_kind)`; zero nulls;
`attention-items.events-handler.integration.test.ts` green.

## Wave 7 — Schema per context

**1–2 days.** Last on purpose: by now it is a rename, not a redesign.
→ [05](05-persistence.md), [ADR 0001](adr/0001-schema-per-context.md)

| #   | Step                                                                                  | Risk              |
| --- | ------------------------------------------------------------------------------------- | ----------------- |
| 7.1 | Audit every raw `sql` template (33) for unqualified table names                       | **the main risk** |
| 7.2 | `tag.deleted` handlers in each tagged context; then drop the 9 cross-context FKs      | low               |
| 7.3 | `pgTable` → `<schema>.table`; `apps/migrations/src/schema/<context>/`; `schemaFilter` | medium            |
| 7.4 | One migration; verify on a fresh DB and on a copy of real data                        | **medium-high**   |
| 7.5 | Orphan-count `@CronJob` replacing what the FKs guaranteed                             | low               |

7.2 can be pulled earlier; it is cheap and independently reversible. If 7.1 turns up
more friction than expected, stopping after 7.2 keeps most of the benefit.

## Wave 8 — Cleanup

| #   | Step                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------- |
| 8.1 | Split `events.registry.ts` into `<ctx>/contract/<ctx>.events.ts`; drop the `AttentionItemUpserted` zod copy |
| 8.2 | `attachments.placement` → `visibility` + `owner_context`                                                    |
| 8.3 | Merge `auth` + `user-profile` + `user-settings` → `identity`                                                |
| 8.4 | Add the architecture rules (below) to `CLAUDE.md`                                                           |
| 8.5 | `storage` error catalog; replace the 11 `HttpException`s in `attachments.service.ts`                        |

## Backlog (no wave)

- `isValidId` throws on malformed input → 500; accepts any UUID version (`kernel/id.ts`).
- Duplicate tag name → unmapped `23505` → 500; make uniqueness `lower(name)` (dedupe first).
- Events: key-prefix consistency, ignored guest-recipient jobs, thread-room duplicate
  emits, consumer inbox ([platform/events](../platform/events.md#known-gaps)).
- `AuthGuard` provided twice; `packages/*` in `pnpm-workspace.yaml`; empty `src/errors/`.

---

## Guardrails

### Tests

`apps/api/test/<module>/*.unit.test.ts` (no Postgres, `pnpm test:unit`) and
`*.integration.test.ts` (`pnpm test:integration:up`, then `pnpm test:integration`).
New domain logic ships with a unit test; new cross-context wiring with a fake-port
unit test.

### dependency-cruiser — cross-boundary rules (Wave 3.1)

**As built:** `apps/api/.dependency-cruiser.cjs` (paths `^src/…`, run from `apps/api`;
see Wave 3 notes for the differences). The original sketch:

```js
// .dependency-cruiser.js
module.exports = {
  options: {
    tsConfig: { fileName: "apps/api/tsconfig.json" },
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.(unit|integration)\\.test\\.ts$" },
  },
  forbidden: [
    {
      name: "cross-context-via-contract-only",
      severity: "error",
      // root files (app.module.ts, error-catalogs.root.ts) don't match `from`
      from: { path: "^apps/api/src/([^/]+)/" },
      to: {
        path: "^apps/api/src/(?!kernel/|platform/)([^/]+)/(?!contract/)",
        pathNot: "^apps/api/src/$1/",
      },
    },
    {
      name: "no-foreign-repository",
      severity: "error",
      from: { path: "^apps/api/src/([^/]+)/" },
      to: { path: "^apps/api/src/(?!$1/)[^/]+/.*\\.repository\\.ts$" },
    },
    {
      name: "only-module-imports-infrastructure",
      severity: "error",
      from: { path: "^apps/api/src/[^/]+/(application|presentation)/" },
      to: { path: "^apps/api/src/[^/]+/infrastructure/" },
    },
    {
      name: "schema-ownership",
      severity: "error",
      from: { path: "^apps/api/src/([^/]+)/infrastructure/" },
      to: { path: "^apps/migrations/src/schema/(?!$1/|identity/)" },
    },
    {
      name: "kernel-is-a-leaf",
      severity: "error",
      from: { path: "^apps/api/src/kernel/" },
      to: { path: "^apps/api/src/(?!kernel/)" },
    },
    {
      name: "platform-imports-no-context",
      severity: "error",
      from: { path: "^apps/api/src/platform/" },
      to: { path: "^apps/api/src/(?!kernel/|platform/)" },
    },
    {
      name: "domain-never-imports-platform",
      severity: "error",
      from: { path: "^apps/api/src/[^/]+/domain/" },
      to: { path: "^apps/api/src/platform/" },
    },
    {
      name: "no-barrels",
      severity: "error",
      from: {},
      to: { path: "^apps/api/src/.*/index\\.ts$" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
};
```

```jsonc
// root package.json
"lint:boundaries": "depcruise apps/api/src --config .dependency-cruiser.js"
```

### ESLint

`eslint-plugin-boundaries` v7 config in `eslint.config.js` ([03 §8](03-layering.md#8-enforcement-wave-3)), plus
(as built, banning `./*` and `../*` too):

```js
{
  files: ["apps/api/src/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", { patterns: [
      { group: ["src/*"],  message: "Use the @/api/* alias (CLAUDE.md)." },
      { group: ["../*/*"], message: "Use import aliases, not relative paths (CLAUDE.md)." },
    ]}],
  },
}
```

### `CLAUDE.md` additions (Wave 8.4)

```md
## Architecture

- Bounded contexts live at `apps/api/src/<context>/`, layered
  `contract / domain / application / infrastructure / presentation`.
- `kernel/` — pure shared vocabulary (`Actor`, ids, `DomainError` + `defineCatalog`,
  time predicates). No framework, no context, no `platform/`. The only shared code
  `domain/` may import; a file belongs here only if it is pure AND domain uses it.
- `platform/` — framework-aware shared infra (db/tx, errors, decorators, clock,
  events, jobs, email, realtime). Never imports a context; `domain/` never imports it.
- Dependency rule: presentation → application → domain; infrastructure implements
  domain ports. Only `<context>.module.ts` imports `infrastructure/`.
- Cross-context imports only from `@/api/<other>/contract/**`. A module's `exports`
  contain only `contract/` classes.
- Ports are `abstract class` (contract + DI token). No `Symbol` tokens.
- Repositories return aggregates; queries return views — separate ports.
- Sync `contract/` port for authoritative facts; outbox event for "something
  happened"; own projection for repeated foreign reads. Never write to a table you
  don't own; never JOIN across contexts.
- Application methods take `Actor`, never a bare `userId: string`.
- Throw `DomainError`s from your own `<ctx>.errors.ts`; register new catalogs in
  `src/error-catalogs.root.ts`. No Nest `HttpException` outside transport code.
- Run `pnpm lint:boundaries` before opening a PR.
```

---

## Leave alone

| Thing                                                    | Why                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| Controllers, DTOs, mappers                               | Already the target shape                                           |
| Outbox / dispatcher / consumer machinery                 | Strongest code in the repo; only the registry file moves (8.1)     |
| The raw `db.transaction()` in the dispatcher             | Must run outside request transactions                              |
| `@Transactional()` usage                                 | Correct and re-entrant                                             |
| `AttachmentAccessService.register()`                     | The pattern to copy                                                |
| Message ↔ attention status loop-breaking                 | Three idempotency guards that work. Move it, don't redesign it     |
| `calendar_event_links` origin-based echo skip            | Good design                                                        |
| `attention_item_tags.tag_id` without FK                  | Deliberate (ghost rows for the tag-deleted handler). Add a comment |
| better-auth's own `pg.Pool`                              | Library boundary; nothing relies on joining its writes to our tx   |
| `platform/email` templates in one switch                 | Inverting saves nothing until a context needs its own template     |
| Typed-record entities (`UserSettings`, `UserProfile`, …) | Enriching them is the classic over-DDD mistake                     |
