# 08 — Roadmap

Eight waves. Each ships on its own and leaves the app working. Effort assumes a solo
developer who knows this codebase.

**The ordering principle:** testability first, then boundaries, then depth, then the
database. Refactoring 16,700 lines with no safety net is how refactors fail — so the
very first step is one line of jest config.

---

## Wave 0 — Safety net and free wins

**~1 day. Risk: near zero. Do this even if nothing else in this plan ever happens.**

**Status (audited 2026-10-07 at `01de2f3`, 0.3e done 2026-10-08): 10 of 12 steps
done.** Left: 0.3c (lint rule only), 0.7 (the tests). 0.4 has an optional remainder.

| #    | Step                                                                                                                                                                                                                                      | Status                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1  | **Split the jest config so unit tests run** (§Guardrails below)                                                                                                                                                                           | ✅ `unit` + `integration` jest projects. Unit tests are **`*.unit.test.ts`**, not `*.spec.ts`; run with `pnpm test:unit`. 6 exist (jobs ×4, durable consumer runtime, admin-api-key guard)                                                                                                                                                                                   |
| 0.2  | Delete the `CalendarEventsRepository` import in `auth.guard.ts:16`; use `new ContextLogger(AuthGuard.name)`                                                                                                                               | ✅                                                                                                                                                                                                                                                                                                                                                                              |
| 0.3  | Move `isIsoDateWithOffset` / `isValidIanaTimezone` → `kernel/time/iso.ts`; kills the `common → calendar-events` inversion                                                                                                                | ✅                                                                                                                                                                                                                                                                                                                                                                              |
| 0.3b | **Split `common/` + `infrastructure/` into `kernel/` + `platform/`** per [04 §1a](04-layering.md). Includes moving the DTO decorators to `platform/`, splitting `AsksynkError`, deleting the `logger.config.ts` barrel                     | ✅ with deviations: decorators → `platform/decorators/{field,param}Validators.decorators.ts`; `AsksynkError` → `DomainError` + per-context **error catalogs** ([04 §7](04-layering.md#7-errors)). Its one leak is 0.3e                                                                                                                                                      |
| 0.3c | Rewrite the 26 IDE-generated `src/kernel/...` imports to `@/api/kernel/...`, and add the `no-restricted-imports` rule for `src/*` so it cannot recur                                                                                      | 🟡 imports done — 0 `src/` and 0 relative imports left (`pnpm fix-imports`, `scripts/src/fix-import-aliases.ts`). **The lint rule was not added**                                                                                                                                                                                                                           |
| 0.3d | **Dissolve `packages/shared` into `platform/` + `kernel/id.ts`** per [04 §1b](04-layering.md). 80 imports, 5 config files. Leave `events.registry.ts` in place for now — it splits per context in Wave 8.1                                | ✅ Leftovers (cosmetic): the `packages/*` glob in `pnpm-workspace.yaml`; comments in `events.registry.ts` still justifying zod copies with "shared must not depend on apps/api"                                                                                                                                                                                              |
| 0.3e | **New.** Stop `platform/` depending on every context through the error registry (below)                                                                                                                                                  | ✅ `platform/` takes the catalogs via `ErrorsModule.forRoot(ERROR_CATALOGUES)`; `DomainErrorsTranslator` replaces `buildErrorRegistry` + `resolveDomainError`; `errors/` folder gone                                                                                                                                                                                         |
| 0.4  | `tags.name` → `uniqueIndex(userId, lower(name))` — **the migration must dedupe existing rows first**                                                                                                                                      | ✅ the bug: `uq_tags_user_name (user_id, name)`, migration `0003`. **Not done:** case-insensitivity (`lower(name)`) — that part does need the dedupe. Optional                                                                                                                                                                                                              |
| 0.5  | Delete the orphan `tag.created` event and the handler-less `email` group                                                                                                                                                                 | ✅ (events refactor)                                                                                                                                                                                                                                                                                                                                                            |
| 0.6a | Outbox: partial index on `id` where `dispatched_at` / `failed_at` are null (the drain orders by `id`)                                                                                                                                    | ✅ `idx_events_outbox_pending`, migration `0008`                                                                                                                                                                                                                                                                                                                               |
| 0.6b | Outbox: retention job deleting realtime-only rows older than 30 days — a `@CronJob`                                                                                                                                                       | ✅ `events.retention` (also prunes dispatched/failed rows and resolved dead letters) ([ADR 0007](adr/0007-unified-typed-jobs.md))                                                                                                                                                                                                                                              |
| 0.7  | Write the first unit tests against code that is **already pure** — scope defined in [§0.7 below](#07--what-already-pure-means-and-what-all-20-entities-meant)                                                                         | ⬜ 3h, none                                                                                                                                                                                                                                                                                                                                                                     |

**Verification:** `pnpm test:unit` runs unit tests **with no Postgres**, in
milliseconds. `pnpm test:integration` still passes.

> 0.1 is the unlock. Every step after this can be defended by a test that runs in
> 200 ms. 0.7 buys real coverage over ~700 lines for zero refactoring.

### 0.3e — the error registry leak (done)

> Full write-up, file by file: [docs/errors/01-error-registry-inversion.md](../errors/01-error-registry-inversion.md).

**Was:** `platform/errors/errors.filter.ts` imported `@/api/errors/resolve-domain-error`,
which imported `errors/error-registry.root.ts`, which imports **every context's
`*.errors.ts`**. So `platform/` depended on all contexts, which is exactly what the
`platform-imports-no-context` rule forbids.

**Now:** platform _receives_ the catalogs instead of importing them.

| File                                                  | Change                                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `kernel/errors/error-registry.ts`, `errors/resolve-domain-error.ts` | deleted; folded into `platform/errors/errors.translator.ts` (`DomainErrorsTranslator`: builds the map, throws on duplicates, `translate()`) |
| `errors/error-registry.root.ts`                      | → `src/error-catalogs.root.ts`: `ERROR_CATALOGUES: ErrorCatalog[]`, beside `app.module.ts`                                             |
| `platform/errors/errors.module.ts` (new)             | `@Global` `ErrorsModule.forRoot(catalogs)`: provides the translator and registers `APP_FILTER`                                          |
| `platform/errors/errors.filter.ts`, `ws.gateway.ts`   | inject `DomainErrorsTranslator`                                                                                                         |

Verification: `grep -rn '@/api/' apps/api/src/platform/ | grep -vE '@/api/(kernel|platform)/'`
→ empty.

### 0.7 — what "already pure" means, and what "all 20 entities" meant

"All 20 entities" was 01 §4.3's count of `*.entity.ts` classes. Read literally it means
a test per one-line getter. They split three ways:

| Group                     | Entities                                                                                                                                  | Test now?                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **No behaviour** (5)      | `NetworkConnection`, `PublicViewGuest`, `UserTimerSettings`, `UserProfile`, `UserSettings`                                                | **No.** Only `static create`. On the "leave alone" list — they stay typed records                                     |
| **Field comparisons** (11) | `AttentionItem`, `CalendarEvent`, `Calendar`, `CalendarEventLink`, `Message`, `Thread`, `Attachment`, `Tag`, `Task`, `TaskBatch`, `TaskSuggestion` | **No.** Every method is a one-line `===` / `!== null` (`belongsTo`, `isDeleted`, `isPending`, …). Five of them (`Task`, `TaskBatch`, `TaskSuggestion`, `AttentionItem`, `CalendarEvent`) become rich aggregates in Wave 5, and their specs get written then, against the real transitions |
| **Has a rule** (4)        | `UserTimer`, `CalendarIntegration`, `PublicView`, `Invite`                                                                                | **Yes**                                                                                                               |

So **0.7 means: every pure function, plus the 4 entities that encode a rule.** Concretely:

| Target                                                        | What to pin down                                                                                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calendar-events/utils/recurrence.utils.ts` (215 LOC)         | `parseIsoWallClockInTimezone` / `utcToIso` across DST; `validateAndNormalizeRrule` rejects bad input; `replaceRruleUntil`. **Highest value** — it is the safety net for 1.5 |
| `tasks/task-status.util.ts`                                   | both mappings, incl. empty batch → `created`. Safety net for 1.3                                                                                      |
| `calendar-integrations/utils/oauth-state.util.ts`             | sign → verify round-trip; tampered payload, tampered sig, wrong secret, malformed token → `null`                                                     |
| `public-views/utils/slug.util.ts`                             | length + alphabet only                                                                                                                               |
| `timers/entities/user-timer.entity.ts`                        | `completesAt` / `remainingSeconds` / `isDue` for running, paused, idle; clamp at 0                                                                   |
| `calendar-integrations/entities/calendar-integration.entity.ts` | `accessTokenExpired`: no expiry ⇒ expired; 60 s refresh skew boundary                                                                              |
| `public-views/entities/public-view.entity.ts`                 | `isLive`: revoked, expired, live                                                                                                                     |
| `networks/entities/invite.entity.ts`                          | `isForEmail` is case-insensitive                                                                                                                     |
| `kernel/time/iso.ts`                                          | offset required; invalid calendar date; IANA zone                                                                                                    |
| `kernel/id.ts`                                                | `isValidId` — **expect this one red**: `UUID.parse` throws on malformed input, so `@UuidV7Param` / `@IsUuidV7` answer 500, not 400, and any UUID version passes |
| `kernel/errors/error-catalog.ts`                              | `{ param }` interpolation; code is `namespace.key`                                                                                                   |
| `platform/errors/errors.translator.ts`                        | ✅ `test/platform/errors.translator.unit.test.ts`: category → status; fails closed on an unknown code; message only when `exposable`; duplicate namespace throws |
| `platform/http/bearer-token.ts`                               | scheme case, missing token, array header                                                                                                             |

**Dropped from the original list:** `AsksynkError` (gone) and the due-date policy
(does not exist until 1.2).

**Placement:** follow the six existing unit tests — `apps/api/test/<module>/<file>.unit.test.ts`.
Tests target the public function, so when 1.3 / 1.5 move the code only the import
changes.

---

## Wave 1 — Extract the pure core

**1–2 days. The best value-per-hour in the plan.**

| #   | Step                                                                                                                               | Effort | Risk       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- |
| 1.1 | `kernel/actor.ts` — the `Actor` value object. `@RequestActor()` and `ws-auth.service` both produce it                              | 3h     | low        |
| 1.2 | `attention/domain/due-date.policy.ts` — `decideDueDate()` + **`due-date.policy.unit.test.ts`** (5 cases)                            | 2h     | none       |
| 1.3 | `task-status.util.ts` → `tasks/domain/task-batch.ts` (`TaskBatch.statusFrom`) + test. Tasks stops importing attention's vocabulary | 1h     | none       |
| 1.4 | `focus/domain/timer.ts` — the five-state machine; move every guard out of `timers.service.ts:168-280`; **~12 test cases**          | 4h     | **medium** |
| 1.5 | `recurrence.utils.ts` → `scheduling/domain/recurrence.ts` + test; `RecurrenceRule` VO validates in its constructor                 | 2h     | low        |

**Verification:** the existing `timers.integration.test.ts` and
`calendar-events.integration.test.ts` stay green throughout — they are the safety net
for 1.4 and 1.5.

**Why 1.1 belongs this early:** `Actor` is a prerequisite for Wave 3's messaging work,
and it is free to adopt now versus expensive to retrofit across 17 methods later.

---

## Wave 2 — Ports and contracts, one context at a time

**3–5 days.** Smallest context first to validate the template, then the worst
offender.

| #   | Step                                                                                                                                                                                                   | Effort | Risk                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------- |
| 2.1 | **`tagging` pilot.** `domain/ports/tag.repository.ts` (abstract) + drizzle adapter + `contract/tag-catalog.port.ts` (`assertOwnedBy`, `getAnswerModes`). `TaggingModule` exports **only** the contract | 4h     | low                       |
| 2.2 | **Merge `scheduling`.** `calendar-events` + `calendar-integrations` → one context, layered per the template. Pure file moves, zero behaviour change                                                    | 1 day  | **medium**                |
| 2.3 | `scheduling/contract/occurrence.port.ts`; move the `rrule.between` SQL **verbatim** out of `attention-items.repository.ts:355-423`                                                                     | 4h     | low                       |
| 2.4 | `files/contract/attachment-catalog.port.ts` (`getSummaries`, `assertUsable`, `resolveMany`)                                                                                                            | 2h     | low                       |
| 2.5 | `network/contract/connection-policy.port.ts`; move `resolveTargetUserId` out of the two controllers into the application layer                                                                         | 3h     | low                       |
| 2.6 | Invert `identity → sharing`: `GuestIdentityProvider` port, registered by `sharing` at bootstrap                                                                                                        | 4h     | **medium** — touches auth |
| 2.7 | Remaining contexts get ports: `focus`, `tasks`, `network`, `sharing`, `conversations`, `attention`                                                                                                     | 1 day  | low, mechanical           |

**Verification after 2.1:**

```bash
grep -rn "TagRepository" apps/api/src | grep -v "^apps/api/src/tagging/"   # must be empty
```

That single step closes 6 of the cross-context edges and the 3× duplicate provider.

**Verification after 2.2:** both calendar integration tests green; the 15-import edge
is gone.

**2.6 needs a test first** — guest sign-in has **no test at all** today. Write
`guest-session.unit.test.ts` before touching it.

---

## Wave 3 — Layer the folders and turn on the boundary lint

**2–3 days.** One context per commit.

| #   | Step                                                                                               | Effort | Risk |
| --- | -------------------------------------------------------------------------------------------------- | ------ | ---- |
| 3.1 | Add `dependency-cruiser` + the `eslint-plugin-boundaries` domain-purity rule, both as **warnings** | 2h     | none |
| 3.2 | Move each context's files into `domain / application / infrastructure / presentation / contract`   | 2 days | low  |
| 3.3 | Promote rules to `error` per context as each goes clean; add `pnpm lint:boundaries` to CI          | 1h     | none |

Do the smallest contexts first (`files`, `focus`, `tagging`, `network`) to shake out
the template before the 2,000-line ones.

---

## Wave 4 — Transport adapters

**2 days.** Untangles `ws.gateway.ts`.

| #   | Step                                                                                    | Effort | Risk            |
| --- | --------------------------------------------------------------------------------------- | ------ | --------------- |
| 4.1 | `platform/realtime/realtime-broadcaster.ts` port; the gateway implements it             | 2h     | low             |
| 4.2 | Move the 7 `@EventHandler`s into 4 per-context broadcasters                             | 4h     | low             |
| 4.3 | **Collapse `conversations`' 17 methods to ~8 using `Actor`**                            | 1 day  | **medium-high** |
| 4.4 | Move the 5 `@SubscribeMessage` commands into the owning contexts, reusing the REST DTOs | 3h     | low             |

**4.3 is the riskiest step in the plan**: 2,024 LOC with **zero tests today**. Write
the specs first — which is only possible because of Waves 0 and 1. This is where the
testability-first ordering pays for itself.

**Verification:** a fake `RealtimeBroadcaster` asserts all 7 emissions; WebSocket and
REST reject the same invalid payloads identically (they currently do not — guest
capability rules live only in the gateway).

---

## Wave 5 — Rich aggregates

**3–5 days.** Now safe, because Waves 0–2 made unit tests possible.

Order by value: `TaskSuggestion` → `Invite` → `Task` / `TaskBatch` →
`AttentionItem` → `CalendarEvent` → `CalendarIntegration`.
(`Timer` was already done in 1.4.)

Each one: write the spec, move the rules out of the service, delete the procedural
guard. `CalendarEvent` is the largest — `reschedule`, `addException`,
`splitSeriesAt`, `detachInstance`, and `applyProviderFields` replacing the external
`applyFields(event, fields)` mutation.

**Verification:** unit tests per aggregate; integration suite unchanged.

---

## Wave 6 — The attention core redesign

**2–3 days plus a real migration.** Full detail in
[07-attention-core.md §10](07-attention-core.md).

| #   | Step                                                                                                                       | Effort | Risk     |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| 6.1 | Add `source_context` / `source_kind` / `source_id` nullable; backfill from `metadata`; verify counts; add the unique index | 4h     | **high** |
| 6.2 | `attention/contract/attention-source.events.ts`; port **one** source (`tasks`) and dual-publish                            | 3h     | low      |
| 6.3 | Port `conversations` and the tag/calendar recompute handlers; delete the 3 bespoke handlers                                | 4h     | medium   |
| 6.4 | Switch reads to `findBySource`; confirm index scans; **then** drop `metadata`, `type` and the enum in a separate commit    | 2h     | medium   |
| 6.5 | Publish `attention.item.resolved` for future gamification                                                                  | 30min  | none     |

**Verification:** row counts per old `type` equal counts per new
`(source_context, source_kind)`; zero nulls; `EXPLAIN` shows an index scan;
`attention-items.events-handler.integration.test.ts` green.

---

## Wave 7 — Schema namespacing

**1–2 days.** Deliberately last: by now the code boundaries are already clean, so this
is a rename rather than a redesign.

| #   | Step                                                                                                                                                                                         | Effort | Risk              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------- |
| 7.1 | **Audit every raw `sql\`\`` template for unqualified table names** — concentrated in `attention-items.repository.ts` (8), `calendar-events.repository.ts` (7), `messaging.repository.ts` (4) | 3h     | **the main risk** |
| 7.2 | Drop the 9 cross-context FKs (`ALTER TABLE … DROP CONSTRAINT`); keep every `users` FK                                                                                                        | 1h     | low               |
| 7.3 | Convert `pgTable` → `<schema>.table` per context; reorganise `apps/migrations/src/schema/<context>/`; add `schemaFilter`                                                                     | 4h     | medium            |
| 7.4 | Generate and run one migration; verify on a fresh database and on a copy of the real one                                                                                                     | 3h     | **medium-high**   |
| 7.5 | Add the orphan-consistency check job (replaces what the dropped FKs used to guarantee) — a `@CronJob`                                                                                                       | 2h     | low               |

**Verification:** `drizzle-kit push` against a fresh database, then the full
integration suite. Then the same against a restored copy of production data.

> 7.2 could be pulled forward into Wave 2 if you want the FK removal decoupled from
> the namespacing. It is a cheap, independently reversible step.

---

## Wave 8 — Cleanup

**~half a day.**

| #   | Step                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1 | Split `platform/events/registry/events.registry.ts` (319 LOC, 20 events) into per-context `contract/<ctx>.events.ts`. `defineEvent` and the registry types stay in `platform/events/registry/`. Error catalogs already live per context — the same shape |
| 8.2 | `attachments.placement` → `visibility` + `owner_context`                                                                                                   |
| 8.3 | Merge `user-profile` + `user-settings` → `identity`                                                                                                        |
| 8.4 | Add the architecture rules (below) to `CLAUDE.md`. (The stale `apps/background-worker` reference is ✅ already gone)                                      |
| 8.5 | Replace the 11 Nest HTTP exceptions in `attachments.service.ts` with domain errors — needs a `storage` catalog (it has none), registered in `src/error-catalogs.root.ts` |
| 8.6 | Dead-letter replay: **✅ done** (admin API key, not a role — see [docs/events 01 §Replay](../events/01-ordering-design.md#replay)) `GET` + `PATCH /admin/events/dead-letters[/:id]`, re-enqueue with a fresh job id. Design in [docs/events](../events/03-implementation-plan.md) |

---

## Guardrails

### Jest — the Wave 0.1 change ✅ (as built)

```ts
// apps/api/jest.config.ts — abridged
const config: Config = {
  forceExit: true,
  testTimeout: 30000,
  projects: [
    {
      displayName: "unit",
      testMatch: ["**/*.unit.test.ts"], // no globalSetup → no Postgres
      moduleNameMapper, transform, transformIgnorePatterns, preset: "ts-jest", testEnvironment: "node",
    },
    {
      displayName: "integration",
      testMatch: ["**/*.integration.test.ts"],
      globalSetup: "<rootDir>/test/helpers/globalSetup.ts", // drizzle-kit migrate + truncate
      moduleNameMapper, transform, transformIgnorePatterns, preset: "ts-jest", testEnvironment: "node",
    },
  ],
};
```

```jsonc
// apps/api/package.json
"test:unit":        "jest --config jest.config.ts --selectProjects unit --passWithNoTests",
"test:integration": "jest --config jest.config.ts --selectProjects integration --runInBand",
"test:all":         "jest --config jest.config.ts"
// root: pnpm test:unit / pnpm test:integration (+ test:integration:{up,down,reset})
```

**Convention:** `*.unit.test.ts` and `*.integration.test.ts`, both under
`apps/api/test/<module>/`. (The original plan said `src/**/*.spec.ts` next to the code;
the suffix-based `testMatch` would still pick that up if co-location is wanted later.)

### dependency-cruiser — the cross-boundary rules

Chosen for these rules because it resolves the `@/api/*` aliases from `tsconfig.json`
natively and expresses "A may reach B only via C" directly.

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
      comment:
        "Contexts talk through contract/. Never application/, infrastructure/, domain/.",
      severity: "error",
      // Root-level files (app.module.ts, error-catalogs.root.ts) are composition roots
      // and don't match `from`, so they may import every context.
      from: { path: "^apps/api/src/([^/]+)/" },
      to: {
        path: "^apps/api/src/(?!kernel/|platform/)([^/]+)/(?!contract/)",
        pathNot: "^apps/api/src/$1/",
      },
    },
    {
      name: "no-foreign-repository",
      comment: "Never import another context's repository.",
      severity: "error",
      from: { path: "^apps/api/src/([^/]+)/" },
      to: { path: "^apps/api/src/(?!$1/)[^/]+/.*\\.repository\\.ts$" },
    },
    {
      name: "only-module-imports-infrastructure",
      comment:
        "application/presentation depend on ports; only <ctx>.module.ts wires adapters.",
      severity: "error",
      from: { path: "^apps/api/src/[^/]+/(application|presentation)/" },
      to: { path: "^apps/api/src/[^/]+/infrastructure/" },
    },
    {
      name: "schema-ownership",
      comment:
        "A context's infrastructure may only import its own schema folder (+ identity/).",
      severity: "error",
      from: { path: "^apps/api/src/([^/]+)/infrastructure/" },
      to: { path: "^apps/migrations/src/schema/(?!$1/|identity/)" },
    },
    {
      name: "kernel-is-a-leaf",
      comment:
        "kernel/ imports nothing — not a context, not platform/, no framework.",
      severity: "error",
      from: { path: "^apps/api/src/kernel/" },
      to: { path: "^apps/api/src/(?!kernel/)" },
    },
    {
      name: "kernel-is-framework-free",
      comment:
        "kernel/ is the only shared code domain/ may import, so it must stay pure.",
      severity: "error",
      from: { path: "^apps/api/src/kernel/" },
      to: {
        path: "^(node_modules/)?(@nestjs|drizzle-orm|class-validator|class-transformer|zod|socket\\.io|pg-boss|@nestjs-cls)",
      },
    },
    {
      name: "platform-imports-no-context",
      // Replaces the old `shared-never-imports-api` rule: packages/shared's tsconfig
      // enforced this by omitting the @/api path. After step 0.3d it is stated here.
      comment:
        "platform/ is shared infrastructure; it may use kernel/ but never a context.",
      severity: "error",
      from: { path: "^apps/api/src/platform/" },
      to: { path: "^apps/api/src/(?!kernel/|platform/)" },
    },
    {
      name: "domain-never-imports-platform",
      comment: "platform/ is framework-aware. domain/ must reach only kernel/.",
      severity: "error",
      from: { path: "^apps/api/src/[^/]+/domain/" },
      to: { path: "^apps/api/src/platform/" },
    },
    {
      name: "no-barrels",
      comment: "CLAUDE.md: DON'T USE BARREL EXPORTS.",
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
"lint:boundaries": "depcruise apps/api/src --config .dependency-cruiser.js",
"graph": "depcruise apps/api/src --config .dependency-cruiser.js --output-type dot | dot -Tsvg > deps.svg"
```

> **Verify the backreference syntax** (`$1` vs `$<name>` in `to.path`) against the
> installed `dependency-cruiser` version before relying on these rules. Test each rule
> by deliberately writing a violating import and confirming it fails.

### ESLint — the in-editor rules

`eslint-plugin-boundaries` for layer purity (full config in
[04-layering.md §8](04-layering.md)), plus two cheap additions to the existing flat
config:

```js
{
  files: ["apps/api/src/*/domain/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{
        group: ["@nestjs/*", "drizzle-orm*", "class-validator", "class-transformer",
                "zod", "@nestjs-cls/*", "@/migrations/*"],
        message: "domain/ is framework-free. Move this to application/ or infrastructure/.",
      }],
    }],
  },
},
{
  files: ["apps/api/src/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["src/*"],   message: "Use the @/api/* alias (CLAUDE.md)." },
        { group: ["../*/*"], message: "Use import aliases, not relative paths (CLAUDE.md)." },
      ],
    }],
  },
}
```

The `src/*` rule is now preventive: the four non-aliased imports it was written for
(`messaging.service.ts`, `ws.gateway.ts`, `messaging.mapper.ts`) were rewritten by
`pnpm fix-imports` in step 0.3c, and 0 remain. They were, not coincidentally, exactly
the places where boundaries were crossed. **Import style has been a reliable smell
detector in this codebase** — which is why the rule is worth adding even with nothing
left to catch.

### CLAUDE.md additions

```md
## Architecture

- Bounded contexts live at `apps/api/src/<context>/`.
  Layers: `contract / domain / application / infrastructure / presentation`.
- Two shared tiers, neither a context:
  - **`kernel/`** — pure domain vocabulary (`Actor`, `generateId`, `DomainError` +
    `defineCatalog`, time predicates). **No framework imports, no context, no
    `platform/`** — plain libraries (`uuidv7`, `lodash`) only. The only shared code
    `domain/` may import. A file earns a place here only if it passes both tests: it is
    pure **and** `domain/` actually references it.
  - **`platform/`** — framework-aware shared infra (db, tx, exception filter, DTO
    validation decorators, `Clock`/`SystemClock`, `RealtimeBroadcaster`, the outbox
    publisher/dispatcher/consumer + dead letters, the typed jobs API, email, bootstrap
    config).
    **`domain/` may never import it.**
- **Infrastructure ports live beside their adapters in `platform/`**, not in `kernel/`.
  Only _repository_ ports split by layer, and that split is within a context
  (`<ctx>/domain/ports/` → `<ctx>/infrastructure/`).
- There is **no `packages/shared`**. It was a package in name only — no `index.ts`,
  compiled into `apps/api`'s own program, one consumer. Shared code lives in `kernel/`
  or `platform/`.
- Dependency rule: `presentation -> application -> domain`. `infrastructure` implements
  domain ports. **Only `<context>.module.ts` may import `infrastructure/`.**
- `domain/` is framework-free: no `@nestjs/*`, no drizzle, no class-validator, no zod.
- **Cross-context imports are allowed ONLY from `@/api/<other>/contract/**`.**
Never a repository, never `application/`, never `domain/`, never `infrastructure/`.
- A `@Module`'s `exports` may contain only classes declared under `contract/`.
- Ports are `abstract class` (contract + DI token), matching `EventsPublisher`.
  No `Symbol` tokens.
- **Repositories return aggregates. Queries return views.** Different ports,
  different files.
- Integration: a sync `contract/` port for authoritative decisions; an outbox event
  for "something happened"; a projection you own for repeated foreign reads.
  **Never write to a table you don't own. Never JOIN across schemas.**
- A context owns tables under `apps/migrations/src/schema/<context>/` and may import
  only those (plus `identity/`).
- Application services take `Actor` (`@/api/kernel/actor`), never a bare `userId: string`.
- Errors: throw `DomainError`s from your own context's `<ctx>.errors.ts` catalog
  (`defineCatalog`), never a Nest `HttpException`. Register a new catalog in
  `src/error-catalogs.root.ts`; HTTP status comes from the catalog's category.
- Run `pnpm lint:boundaries` before opening a PR.

## Testing

- Unit: `test/<module>/*.unit.test.ts`, no Postgres — `pnpm test:unit`.
- Integration: `test/<module>/*.integration.test.ts` — needs the test stack
  (`pnpm test:integration:up`), then `pnpm test:integration`.
- New domain logic ships with a unit test. New cross-context wiring ships with a
  fake-port unit test.
```

---

## Explicitly leave alone

Worth stating so these do not get "improved" by accident:

| Thing                                                                                 | Why                                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controllers, DTOs, mappers                                                            | Zero violations. Already the target state.                                                                                                                                         |
| The outbox / dispatcher / consumer machinery                                          | The strongest code in the repo. Only the _registry file_ moves. Ordering, retries and dead letters are specified in [docs/events](../events/README.md) / [ADR 0006](adr/0006-group-ordered-event-delivery.md). |
| The single raw `db.transaction()` in `events-dispatcher.ts`                           | Correct — the dispatcher is outside any request transaction by design.                                                                                                             |
| `@Transactional()` usage                                                              | Correct and re-entrant.                                                                                                                                                            |
| `AttachmentAccessService.register()`                                                  | The pattern to copy, not fix.                                                                                                                                                      |
| The message ↔ attention status loop-breaking                                          | Three independent idempotency guards that work. Move it, do not redesign it.                                                                                                       |
| `calendar_event_links` origin-based echo skip                                         | Genuinely good design.                                                                                                                                                             |
| `attention_item_tags.tag_id` having no FK                                             | Deliberate. Add a comment.                                                                                                                                                         |
| better-auth's second `pg.Pool`                                                        | A library boundary that works. Unifying risks auth for near-zero gain. Worth _verifying_ that nothing relies on better-auth writes joining your transactions — today nothing does. |
| `UserSettings`, `UserProfile`, `PublicView`, `NetworkConnection`, `Calendar` entities | Genuinely anemic data. Enriching them is the classic over-DDD mistake.                                                                                                             |

---

## If you only do three things

1. **Wave 0.1 + 0.7** — jest config (✅ done) plus unit tests for already-pure code
   (left). Half a day, ~700 lines covered, zero refactoring.
2. **Wave 2.1** — the `tagging` contract. Four hours, closes 6 cross-context edges and
   removes the 2 duplicate provider instances.
3. **Wave 2.2** — the `scheduling` merge. One day, mostly file moves, removes the
   heaviest coupling edge in the codebase.

Together: roughly two days, and the three worst structural problems are gone.

---

Next: [09-references.md](09-references.md).
