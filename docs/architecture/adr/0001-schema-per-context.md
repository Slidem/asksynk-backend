# ADR 0001 — One Postgres schema per bounded context

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Mihai Alexandru

---

## Context

All 33 tables live in `public`. Nine foreign keys cross module boundaries, and two
modules issue queries against tables they do not own — one of them raw SQL naming
three foreign tables plus a Postgres extension function.

That is Grzybek's _Shared Database Data_ integration style, the highest-coupling
option available. Its stated cost: _"one little change to database structure or even
data itself can break another module without notice."_

The question is whether to enforce the boundary in the database, in the code, or both.

## Options considered

### A. Keep one schema; enforce boundaries only in TypeScript

Add `dependency-cruiser` rules, reorganise `apps/migrations/src/schema/` into
per-context folders (zero DDL), and forbid a context's infrastructure from importing
another context's tables.

**For:** zero migration risk. No `search_path` friction. Keeps every
`ON DELETE CASCADE`. Roughly two hours of config.

**Against:** the enforcement is advisory. A raw `sql\`\`` template — and there are 19
of them — sidesteps the linter entirely, because table names in a template string are
just text. The two worst existing violations are exactly of this kind.

### B. One Postgres schema per context _(chosen)_

`tagging.tags`, `scheduling.calendar_events`, `attention.attention_items`, and so on.
No cross-schema foreign keys, no cross-schema queries.

**For:** the boundary becomes physical. A cross-context query does not lint-fail — it
_errors_, including from inside a raw SQL string. Table ownership becomes visible at a
glance in `psql`. It also makes the eventual "could this context move out?" question
answerable rather than theoretical.

**Against:** see Consequences. This is not free.

### C. Table name prefixes (`attn_`, `cal_`)

**Against:** renames every table, breaks every hand-written SQL string and every
existing migration, and buys strictly less than schemas — a prefix is still just a
naming convention. Rejected quickly.

---

## Decision

**Option B.** One schema per context, with a single sanctioned exception for foreign
keys to `identity.users(id)`.

### The counter-argument, stated fairly

An independent design review of this codebase recommended **Option A**, and its
reasoning deserves recording rather than burying:

> drizzle-kit supports `pgSchema()`, but you inherit `search_path` friction in every
> raw `sql\`\``(you have several), plus pg-boss, better-auth and the`rrule`
> extension already add schemas. The one benefit — a physical, greppable boundary — is
> fully achievable in TypeScript for ~2h of dependency-cruiser config. YAGNI.

That is a good argument and it may turn out to be right. Three things tip the decision
to B anyway:

1. **The linter cannot see into raw SQL, and raw SQL is where both real violations
   live.** `attention-items.repository.ts:355-423` is not an accident of import
   hygiene; it is a string. Option A would not have prevented it and would not detect
   the next one.
2. **The cost is front-loaded and bounded.** It is one migration and one audit of 19
   SQL templates, sequenced last, after the code boundaries are already clean. It does
   not recur.
3. **`YAGNI` cuts both ways here.** The project is explicitly planning four new
   integration surfaces. The moment where boundaries are cheapest to establish is
   before those exist.

**If Wave 7.1's SQL audit reveals materially more friction than expected, stopping
after the FK removal (7.2) captures most of the benefit at a fraction of the cost.**
That is a legitimate exit, not a failure.

---

## Consequences

### Positive

- Cross-schema queries fail loudly, including from raw SQL.
- `attention`'s recurrence CTE is _forced_ into `scheduling`, where it belongs and
  where its test coverage already is.
- Table ownership is self-documenting.
- `\dn` in `psql` prints the context map.

### Negative

- **19 raw `sql\`\`` templates must be audited** for unqualified table names —
  concentrated in `attention-items.repository.ts` (8),
  `calendar-events.repository.ts` (7), `messaging.repository.ts` (4). This is the
  main risk and the reason the step is sequenced last.
- **Nine foreign keys are dropped**, so the database no longer prevents orphaned
  `message_tags` or a `messages.suggestion_id` pointing at a deleted suggestion.
  Mitigated by: existing event-driven cleanup (`tag.deleted` already fans out), the
  proven precedent of `attention_item_tags` living without an FK by design, and a new
  periodic orphan-count job.
- One more thing to remember when adding a table.
- `drizzle.config.ts` needs a `schemaFilter` so drizzle-kit does not try to manage
  `pgboss` or the extension schemas.

### Neutral

- Still one database, one connection pool, one migration history, one `drizzle-kit`
  invocation. Transactions still span contexts freely — that is a code-level rule, not
  a database-level one.
- pg-boss and better-auth already coexist with extra schemas, so multi-schema is not
  new territory for this deployment.

---

## The `identity.users` exception

`user_id` appears on 17 tables with `ON DELETE CASCADE`. Those foreign keys **stay**.

It is not really a cross-context reference — it is the tenant key. No context
_queries_ another's data through `users`; they merely share an identifier. Dropping
the FKs would turn "delete my account" into a ten-context saga that must be written,
tested and kept correct forever, in exchange for autonomy that will not be spent.

This is a deliberate, documented, bounded exception. It is recorded here so that a
future reader recognises it as a decision rather than an oversight.

---

## Verification

1. `drizzle-kit push` against a fresh database, then the full integration suite.
2. The same against a restored copy of production data.
3. `grep -rn 'sql\`' apps/api/src` — every hit reviewed for unqualified table names.
4. The orphan-consistency job runs clean for a week before the FK drop is considered
   settled.

## References

- Grzybek, [Modular Monolith: Integration Styles](https://www.kamilgrzybek.com/blog/posts/modular-monolith-integration-styles)
- [Sharing data between modules in a modular monolith](https://dev.to/lukaszreszke/sharing-data-between-modules-in-modular-monolith-50on)
- [Drizzle — SQL schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration),
  [drizzle.config.ts](https://orm.drizzle.team/docs/drizzle-config-file)
