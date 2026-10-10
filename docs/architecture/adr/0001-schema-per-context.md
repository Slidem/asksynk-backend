# ADR 0001 — One Postgres schema per bounded context

**Status:** Accepted (2026-08-07) · executed in Wave 7

## Context

All tables live in `public`. Ten FKs cross module boundaries, and modules query
tables they don't own — the worst in raw SQL (`attention-items.repository.ts`
reading three calendar tables through `rrule.between`). That is Grzybek's _Shared
Database Data_ style: _"one little change to database structure … can break another
module without notice."_

## Options

- **A. One schema, boundaries enforced in TypeScript only.** Zero migration risk,
  keeps every cascade, ~2h of dependency-cruiser config. But lint can't see table
  names inside raw `sql` strings — exactly where the real violations live.
- **B. One schema per context _(chosen)_.** `tagging.tags`, `scheduling.calendar_events`, …
  No cross-schema FKs or queries; a cross-context query _errors_, even from raw SQL.
- **C. Table prefixes.** Renames everything, buys less than schemas. Rejected.

## Decision

**B**, with one exception: FKs to `identity.users(id)` stay (it's the tenant key;
dropping it turns account deletion into a ten-context saga).

The counter-argument for A is fair (`search_path` friction, pg-boss / better-auth /
`rrule` already add schemas, YAGNI). B wins because raw SQL is where violations live,
the cost is one-time and sequenced last, and boundaries are cheapest before the new
channels land.

**Exit:** if Wave 7.1's SQL audit shows more friction than expected, stop after
dropping the cross-context FKs (7.2) — most of the benefit, fraction of the cost.

## Consequences

- **+** Cross-schema queries fail loudly; the rrule CTE is forced into `scheduling`;
  `\dn` prints the context map.
- **−** Every raw `sql` template (33 in context repositories) must be audited for
  unqualified table names.
- **−** Nine FKs dropped (`calendars.integration_id` stays — both sides in
  `scheduling`). Mitigated by `tag.deleted` handlers per tagged context, the proven
  FK-less `attention_item_tags`, and an orphan-count cron.
- **−** `drizzle.config.ts` needs `schemaFilter`.
- **=** Still one DB, one pool, one migration history. Transactions may still span
  contexts — that's a code rule, not a DB one.

## Verification

`drizzle-kit push` on a fresh DB + full integration suite; same on a copy of real
data; every `sql\`` hit reviewed; orphan job clean for a week.

Detail: [05-persistence.md](../05-persistence.md).
