# 08 — Roadmap

Eight waves. Each ships on its own and leaves the app working. Effort assumes a solo
developer who knows this codebase.

**The ordering principle:** testability first, then boundaries, then depth, then the
database. Refactoring 16,700 lines with no safety net is how refactors fail — so the
very first step is one line of jest config.

---

## Wave 0 — Safety net and free wins

**~1 day. Risk: near zero. Do this even if nothing else in this plan ever happens.**

| #    | Step                                                                                                                                                                                                                                      | Effort | Risk       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- |
| 0.1  | **Split the jest config so unit tests run** (§Guardrails below)                                                                                                                                                                           | 1h     | none       |
| 0.2  | Delete the `CalendarEventsRepository` import in `auth.guard.ts:16`; use `new ContextLogger(AuthGuard.name)`                                                                                                                               | 5min   | none       |
| 0.3  | Move `isIsoDateWithOffset` / `isValidIanaTimezone` → `kernel/time/iso.ts`; kills the `common → calendar-events` inversion **✅ done**                                                                                                     | 30min  | none       |
| 0.3b | **Split `common/` + `infrastructure/` into `kernel/` + `platform/`** per [04 §1a](04-layering.md). Includes moving `kernel/time/decorators.ts` → `platform/validation/`, splitting `AsksynkError`, deleting the `logger.config.ts` barrel | 2h     | low        |
| 0.3c | Rewrite the 26 IDE-generated `"@/api/kernel/...` imports to `@/api/kernel/...`, and add the `no-restricted-imports` rule for `src/*` so it cannot recur                                                                                   | 30min  | none       |
| 0.3d | **Dissolve `packages/shared` into `platform/` + `kernel/id.ts`** per [04 §1b](04-layering.md). 80 imports, 5 config files. Leave `events.registry.ts` in place for now — it splits per context in Wave 8.1                                | 3h     | low        |
| 0.4  | `tags.name` → `uniqueIndex(userId, lower(name))` — **the migration must dedupe existing rows first**                                                                                                                                      | 30min  | **medium** |
| 0.5  | Delete the orphan `tag.created` event and the handler-less `email` group                                                                                                                                                                  | 15min  | none       |
| 0.6  | Outbox: index on `dispatched_at`; retention job deleting realtime-only rows older than 30 days                                                                                                                                            | 1h     | low        |
| 0.7  | Write the first `.spec.ts` files against code that is **already pure** — `recurrence.utils.ts`, `task-status.util.ts`, `oauth-state.util.ts`, `slug.util.ts`, all 20 entities                                                             | 3h     | none       |

**Verification:** `pnpm --filter @asksynk/api test` runs unit tests **with no
Postgres**, in milliseconds. The existing integration suite still passes.

> 0.1 is the unlock. Every step after this can be defended by a test that runs in
> 200 ms. 0.7 buys real coverage over ~700 lines for zero refactoring.

---

## Wave 1 — Extract the pure core

**1–2 days. The best value-per-hour in the plan.**

| #   | Step                                                                                                                               | Effort | Risk       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- |
| 1.1 | `kernel/actor.ts` — the `Actor` value object. `@RequestActor()` and `ws-auth.service` both produce it                              | 3h     | low        |
| 1.2 | `attention/domain/due-date.policy.ts` — `decideDueDate()` + **`due-date.policy.spec.ts`** (5 cases)                                | 2h     | none       |
| 1.3 | `task-status.util.ts` → `tasks/domain/task-batch.ts` (`TaskBatch.statusFrom`) + spec. Tasks stops importing attention's vocabulary | 1h     | none       |
| 1.4 | `focus/domain/timer.ts` — the five-state machine; move every guard out of `timers.service.ts:163-274`; **~12 spec cases**          | 4h     | **medium** |
| 1.5 | `recurrence.utils.ts` → `scheduling/domain/recurrence.ts` + spec; `RecurrenceRule` VO validates in its constructor                 | 2h     | low        |

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

That single step closes 6 of the cross-context edges and the 4× duplicate provider.

**Verification after 2.2:** both calendar integration tests green; the 15-import edge
is gone.

**2.6 needs a test first** — guest sign-in has **no test at all** today. Write
`guest-session.spec.ts` before touching it.

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
| 7.5 | Add the orphan-consistency check job (replaces what the dropped FKs used to guarantee)                                                                                                       | 2h     | low               |

**Verification:** `drizzle-kit push` against a fresh database, then the full
integration suite. Then the same against a restored copy of production data.

> 7.2 could be pulled forward into Wave 2 if you want the FK removal decoupled from
> the namespacing. It is a cheap, independently reversible step.

---

## Wave 8 — Cleanup

**~half a day.**

| #   | Step                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1 | Split `events.registry.ts` (347 LOC) into per-context `contract/<ctx>.events.ts`. `defineEvent` and the registry types stay in `platform/events/registry/` |
| 8.2 | `attachments.placement` → `visibility` + `owner_context`                                                                                                   |
| 8.3 | Merge `user-profile` + `user-settings` → `identity`                                                                                                        |
| 8.4 | Fix `CLAUDE.md`'s stale `apps/background-worker` reference; add the architecture rules (below)                                                             |
| 8.5 | Replace the 11 Nest HTTP exceptions in `attachments.service.ts` with domain errors                                                                         |

---

## Guardrails

### Jest — the Wave 0.1 change

```ts
// apps/api/jest.config.ts
const moduleNameMapper = {
  "^@/api/(.*)$": "<rootDir>/src/$1",
  "^@/migrations/(.*)$": "<rootDir>/../migrations/src/$1",
  // drop this line once step 0.3d dissolves packages/shared
  "^@/shared/(.*)$": "<rootDir>/../../packages/shared/src/$1",
  "^@/test/(.*)$": "<rootDir>/test/$1",
};
const transform = {
  /* …unchanged ts-jest block… */
};
const transformIgnorePatterns = [
  "/node_modules/(?!.*(?:pg-boss|serialize-error|non-error|@smithy))",
];

const config: Config = {
  projects: [
    {
      displayName: "unit",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["<rootDir>/src/**/*.spec.ts"], // no globalSetup → no Postgres
      moduleNameMapper,
      transform,
      transformIgnorePatterns,
    },
    {
      displayName: "integration",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["<rootDir>/test/**/*.integration.test.ts"],
      globalSetup: "<rootDir>/test/helpers/globalSetup.ts",
      testTimeout: 30000,
      moduleNameMapper,
      transform,
      transformIgnorePatterns,
    },
  ],
  forceExit: true,
};
export default config;
```

```jsonc
// apps/api/package.json
"test":             "jest --selectProjects unit",
"test:integration": "jest --selectProjects integration"
```

**Convention:** unit tests live next to the code (`src/**/*.spec.ts`); integration
tests stay in `test/`.

### dependency-cruiser — the cross-boundary rules

Chosen for these rules because it resolves the `@/api/*` aliases from `tsconfig.json`
natively and expresses "A may reach B only via C" directly.

```js
// .dependency-cruiser.js
module.exports = {
  options: {
    tsConfig: { fileName: "apps/api/tsconfig.json" },
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.(spec|integration\\.test)\\.ts$" },
  },
  forbidden: [
    {
      name: "cross-context-via-contract-only",
      comment:
        "Contexts talk through contract/. Never application/, infrastructure/, domain/.",
      severity: "error",
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
      from: { path: "^apps/api/"@/api/kernel/" },
      to: { path: "^apps/api/src/(?!kernel/)" },
    },
    {
      name: "kernel-is-framework-free",
      comment:
        "kernel/ is the only shared code domain/ may import, so it must stay pure.",
      severity: "error",
      from: { path: "^apps/api/"@/api/kernel/" },
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

The `src/*` rule catches the four existing non-aliased imports —
`messaging.service.ts:3`, `ws.gateway.ts:13`, `messaging.mapper.ts:1` — which are, not
coincidentally, exactly the places where boundaries were crossed. **Import style has
been a reliable smell detector in this codebase.**

### CLAUDE.md additions

```md
## Architecture

- Bounded contexts live at `apps/api/src/<context>/`.
  Layers: `contract / domain / application / infrastructure / presentation`.
- Two shared tiers, neither a context:
  - **`kernel/`** — pure domain vocabulary (`Actor`, `generateId`, `DomainError`, time
    predicates). **Imports nothing, including frameworks.** The only shared code
    `domain/` may import. A file earns a place here only if it passes both tests: it is
    pure **and** `domain/` actually references it.
  - **`platform/`** — framework-aware shared infra (db, tx, exception filter, DTO
    validation decorators, `Clock`/`SystemClock`, `RealtimeBroadcaster`, the outbox
    publisher/dispatcher/consumer, pg-boss, email, bootstrap config).
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
- Run `pnpm lint:boundaries` before opening a PR.

## Testing

- Unit: `src/**/*.spec.ts`, no Postgres — `pnpm --filter @asksynk/api test`.
- Integration: `test/**/*.integration.test.ts` — needs the localdev stack.
- New domain logic ships with a `.spec.ts`. New cross-context wiring ships with a
  fake-port unit test.
```

---

## Explicitly leave alone

Worth stating so these do not get "improved" by accident:

| Thing                                                                                 | Why                                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controllers, DTOs, mappers                                                            | Zero violations. Already the target state.                                                                                                                                         |
| The outbox / dispatcher / consumer machinery                                          | The strongest code in the repo. Only the _registry file_ moves.                                                                                                                    |
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

1. **Wave 0.1 + 0.7** — jest config plus specs for already-pure code. Half a day,
   700 lines covered, zero refactoring.
2. **Wave 2.1** — the `tagging` contract. Four hours, closes 6 cross-context edges and
   removes 3 duplicate provider instances.
3. **Wave 2.2** — the `scheduling` merge. One day, mostly file moves, removes the
   heaviest coupling edge in the codebase.

Together: roughly two days, and the three worst structural problems are gone.

---

Next: [09-references.md](09-references.md).
