# 07 — Roadmap

Each wave ships on its own and leaves the app working. Order: pure core → contracts →
layers + lint → transport → aggregates → attention redesign → schemas → cleanup.
Efforts are relative-size guesses for one developer. Shipped waves keep one row in
[Done](#done); details live in git history.

## Done

| Wave | Outcome | ADRs |
| --- | --- | --- |
| 0 — Safety net | Jest unit/integration split; `kernel/` + `platform/` tiers; typed `DomainError` catalogs; outbox events with ordered delivery, dead letters, retention; typed jobs API | [0005](adr/0005-kernel-and-platform-tiers.md), [0006](adr/0006-group-ordered-event-delivery.md), [0007](adr/0007-unified-typed-jobs.md) |
| 1 — Pure core | `Actor`; `decideDueDate` policy; batch status in tasks' terms; `Timer` state machine; `RecurrenceRule` VO | — |
| 2 — Ports and contracts | Repository ports + Drizzle adapters everywhere; published `contract/` ports; `scheduling` merge; auth ↔ sharing inverted (`GuestIdentityRegistry`) | [0002](adr/0002-repository-ports-as-abstract-classes.md), [0003](adr/0003-merge-calendar-events-and-calendar-integrations.md) |
| 3 — Layers + lint | Every context layered `contract / domain / application / infrastructure / presentation` under its target name; ESLint boundaries + dependency-cruiser as `error` in `pnpm lint` | — |
| 4 — Transport adapters | Nest 11; `RealtimeBroadcaster` port; per-context broadcasters + WS gateways; `websockets/` = transport only; messaging on `Actor` | — |

`tasks` still speaks attention's status vocabulary via
`attention/contract/attention-item-status.public.ts` until its outbound translator (6.2).

---

## Wave 5 — Rich aggregates

**3–5 days.** Order by value: `TaskSuggestion` → `Invite` → `Task`/`TaskBatch` →
`AttentionItem` → `CalendarEvent` → `CalendarIntegration` (`Timer` is done).
Each: write the spec, move the rules from the service into the aggregate, delete the
procedural guard. Methods per [03 §7](03-layering.md#7-rich-vs-not).

## Wave 6 — Attention core redesign

**2–3 days plus a real migration.** Design: [06](06-attention-core.md).

| #   | Step                                                                                                                     | Risk     |
| --- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| 6.1 | Add `source_*` + `preview` nullable; backfill from `metadata`; verify counts; add unique index                           | **high** |
| 6.2 | `AttentionSourceUpserted/Removed`; port `tasks` (outbound translator, `TaskUpserted` carries `TaskStatus`); dual-publish | low      |
| 6.3 | Port `conversations` and the tag/calendar recompute handlers; delete the 3 bespoke handlers                                  | medium   |
| 6.4 | Reads via `findBySource` (check `EXPLAIN`); **separate commit:** drop `metadata`, `type`, enum                           | medium   |
| 6.5 | Publish `attention.item.resolved`                                                                                        | none     |

Verify: counts per old `type` = counts per `(source_context, source_kind)`; zero nulls;
`test/attention/attention-items.events-handler.integration.test.ts` green.

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
| 8.1 | Split `platform/events/registry/events.registry.ts` into `<ctx>/contract/<ctx>.events.ts`; drop the `AttentionItemUpserted` zod copy |
| 8.2 | `attachments.placement` → `visibility` + `owner_context`                                                    |
| 8.3 | Merge `auth` + `user-profile` + `user-settings` → `identity`                                                |
| 8.4 | Add the architecture rules (below) to `CLAUDE.md`                                                           |
| 8.5 | Replace the 11 `HttpException`s in `files/application/attachments.service.ts` with `storage` catalog errors |

## Backlog (no wave)

- `isValidId` throws on malformed input → 500; accepts any UUID version (`kernel/id.ts`).
- Duplicate tag name → unmapped `23505` → 500; make uniqueness `lower(name)` (dedupe first).
- Events: key-prefix consistency, ignored guest-recipient jobs, thread-room duplicate
  emits, consumer inbox ([platform/events](../platform/events.md#known-gaps)).
- `AuthGuard` provided twice (`auth.module`, `auth-guard.module`); `packages/*` in `pnpm-workspace.yaml`.

---

## Guardrails

### Tests

`apps/api/test/<module>/*.unit.test.ts` (no Postgres, `pnpm test:unit`) and
`*.integration.test.ts` (`pnpm test:integration:up`, then `pnpm test:integration`).
New domain logic ships with a unit test; new cross-context wiring with a fake-port
unit test.

### Lint

`pnpm lint` runs ESLint (`eslint.config.js`: `eslint-plugin-boundaries` layer rules,
`no-restricted-imports` for `src/*` / relative imports) and `pnpm lint:boundaries`
(`apps/api/.dependency-cruiser.cjs`: cross-context via `contract/` only, no foreign
repository, infrastructure/presentation direction, kernel/platform isolation, no Drizzle
schema in domain, no barrels, no cycles). All `error`. Rules: [03 §8](03-layering.md#8-enforcement).
`schema-ownership` (infrastructure imports only its own `apps/migrations/src/schema/<ctx>/`)
is added in 7.3.

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
