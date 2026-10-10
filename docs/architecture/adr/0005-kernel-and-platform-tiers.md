# ADR 0005 — Two shared tiers: `kernel/` (pure) and `platform/` (framework-aware)

**Status:** Accepted (2026-08-07) · executed

## Context

Shared code mixed pure predicates, ports + Nest adapters, transport helpers and
framework wiring. A single shared folder that `domain/` may import would let
`domain/` reach Nest and class-validator transitively — making "domain is
framework-free" unenforceable.

## Options

- **A. One `kernel/`, purity by convention.** No linter can express the carve-out.
- **B. One `kernel/`, `domain/` may not import it.** Then each context redeclares
  `Actor`, `DomainError`, etc.
- **C. Two tiers _(chosen)_.**

## Decision

|               | `kernel/`                                         | `platform/`                                                   |
| ------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| Contains      | pure domain vocabulary                            | framework-aware shared infrastructure                         |
| Imports       | nothing outside itself; plain libs only (`uuidv7`, `lodash`) | `kernel/` + frameworks; **never a context**        |
| Importable by | everything, **including `domain/`**               | `application/`, `infrastructure/`, `presentation/` — never `domain/` |

**Placement test for `kernel/` — both yes:** (1) pure, transitively; (2) referenced
by `domain/` code. Q2 stops `kernel/` turning back into `common/`. When in doubt, a
thing belongs to a context.

**Ports don't split along this seam.** A port lives with the layer that declares the
need, both halves together: `EventsPublisher`, `JobScheduler`, `Clock` are entirely in
`platform/` (their signatures use platform/zod types, and only application code calls
them; time reaches domain as `now: Date`). Repository ports split within a context
(`domain/ports/` → `infrastructure/`).

`platform/email` stays whole (one template switch) until a context needs its own
template without editing `platform/`.

## As built

- `kernel/`: `id.ts`, `actor/actor.ts`, `time/iso.ts`,
  `errors/{domain-errors,error-catalog,kernel.errors}.ts`.
- `platform/`: clock, config, db, decorators, email, errors, events, http, jobs,
  logger, mappers. `common/`, `infrastructure/`, `packages/shared` are gone.
- The error catalog list lives in the composition root `src/error-catalogs.root.ts`
  and is handed to `ErrorsModule.forRoot()`, so `platform/` never imports a context.

## Consequences

- **+** Domain purity is enforceable by two lint rules: `domain` may not import
  `platform`; `kernel` gets the same external-import ban as `domain`.
- **−** Two shared folders to explain; `platform → context` is now prevented by lint
  only (no package boundary) — until Wave 3.1 lands, by review.

## Verification

```bash
grep -rn 'from "@/' apps/api/src/kernel/ | grep -v '@/api/kernel/'          # → empty
grep -rn '@/api/' apps/api/src/platform/ | grep -vE '@/api/(kernel|platform)/'  # → empty
grep -rn '@/api/platform' apps/api/src/*/domain/                            # → empty
```
