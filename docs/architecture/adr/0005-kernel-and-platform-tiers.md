# ADR 0005 — Two shared tiers: `kernel/` (pure) and `platform/` (framework-aware)

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Mihai Alexandru
**Supersedes:** the single-`kernel/` sketch in the first draft of
[03-context-map.md §6](../03-context-map.md)

---

## Context

`apps/api/src/common/` (10 files) and `apps/api/src/infrastructure/` (3 files) hold
code shared across every context. The first draft of this plan proposed folding both
into one `kernel/` folder that `domain/` would be allowed to import.

The first move made under that plan exposed the flaw immediately.
`common/decorators/param.decorators.ts` and `common/decorators/validators.ts` were
merged into `kernel/time/decorators.ts` — a file that imports:

```ts
import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { registerDecorator, ValidationOptions } from "class-validator";
import { AsksynkError } from "src/common/errors/errors.model";
```

If `domain/` may import `kernel/`, then `domain/` can transitively reach
`@nestjs/common` and `class-validator` — and _"`domain/` is framework-free"_, the
single most important rule in [04-layering.md](../04-layering.md), becomes
unenforceable.

Two supporting observations:

- **All 27 importers of that file are controllers or DTOs.** A check for any consumer
  outside a `rest/` folder returned nothing. It was never kernel material — it is
  transport-layer validation.
- `common/` contains at least four genuinely different kinds of thing: pure predicates
  called by domain code (`isValidIanaTimezone`), an abstract port plus its Nest adapter
  that only the application layer uses (`Clock` / `SystemClock`), pure-but-transport
  helpers (query-string parsers), and outright framework wiring (the exception filter,
  Swagger config, CORS).

Calling all of that "kernel" reproduces the `common/` dumping ground under a better
name.

## Options considered

### A. One `kernel/`, with a purity convention

Keep a single folder and rely on review to keep framework-dependent files out of the
paths that `domain/` imports.

**Against:** no linter can express "this folder is pure, except these files, which are
only importable from these layers." The rule would be documentation, not enforcement —
and the very first move under it already violated it.

### B. One `kernel/`, and forbid `domain/` from importing it at all

**Against:** then `domain/` cannot use `Actor`, `DomainError` or `isValidIanaTimezone`,
which are exactly the things a shared kernel exists to provide. Each context would
re-declare them.

### C. Two tiers — `kernel/` pure, `platform/` framework-aware _(chosen)_

---

## Decision

**Option C.**

|               | `kernel/`                                                   | `platform/`                                                                                                         |
| ------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Contains      | pure domain vocabulary                                      | framework-aware shared infrastructure                                                                               |
| Imports       | **nothing** — no context, no `platform/`, no framework      | `kernel/`, plus any framework                                                                                       |
| Importable by | everything, **including `domain/`**                         | `application/`, `infrastructure/`, `presentation/` — **never `domain/`**                                            |
| Examples      | `Actor`, `generateId`, `DomainError`, `isValidIanaTimezone` | `Clock` + `SystemClock`, `EventsPublisher`, `AllExceptionsFilter`, `IsUuidV7`, db/tx modules, `RealtimeBroadcaster` |

`common/`, `infrastructure/` **and `packages/shared`** all disappear. The per-file
mapping is in [04-layering.md §1a and §1b](../04-layering.md).

**The test for which tier a file belongs to — two questions, both must be yes for
`kernel/`:**

1. **Is it pure?** No framework import, directly or transitively.
2. **Does `domain/` actually reference it?** In a signature, an invariant, or a factory.

Question 2 is the one that gets forgotten, and it is what keeps `kernel/` from becoming
`common/` again: purity alone would admit every dependency-free file in the codebase.

**Corollary — ports do not split along this seam.** The instinct "abstract class →
`kernel/`, implementation → `platform/`" is the wrong axis. A port lives with the layer
that declares the need, and both halves live together. `EventsPublisher` fails _both_
questions: its signature depends on `EventDef`/`EventOf`, which are zod types
(`EventOf<T> = z.infer<T["schema"]>`), and all 14 of its injectors are services, not
entities. `ScheduledJobService` is the sharper case — its abstract is entirely
import-free, so it passes question 1, and still belongs in `platform/` because no domain
code calls it. The abstract/adapter split runs **port vs adapter** (and for repositories,
`<ctx>/domain/ports/` → `<ctx>/infrastructure/`), never kernel vs platform. Worked
through in [04-layering.md §1a](../04-layering.md).

### `packages/shared` dissolves into the same two tiers

Same question, wider scope: `packages/shared` (36 files, ~2.2k LOC) holds the outbox
machinery, the pg-boss wrapper, email, the logger config and `id.ts`. All of it is
shared code, so all of it is subject to this ADR — and none of it needs to be a separate
workspace package:

- No `src/index.ts`. `main` points at `dist/index.js`, which nothing imports — consumers
  go through the `@/shared/*` path alias into `src/`.
- `apps/api/tsconfig.json` already `include`s `../../packages/shared/src/**/*.ts`, so
  the two already compile as one program.
- `apps/api/package.json` already declares **12 of its 15 dependencies**. Only
  `nodemailer`, `pg-boss` and `zod` are unique to it.
- There is one application. Nothing else consumes it.

It becomes `platform/events/`, `platform/jobs/`, `platform/email/`, `platform/logger/`,
`platform/db/` — plus **`kernel/id.ts`**, the one file domain code needs (aggregates
generate their own ids in `static open()`; `uuidv7` is a library, not a framework, so it
passes the purity ban).

Two things deliberately do **not** simply move:

- **`event-registry/events.registry.ts` (348 LOC)** is not infrastructure — it is every
  context's published language in one file. It splits into
  `<ctx>/contract/<ctx>.events.ts`. Only `defineEvent` and the event types are platform.
- **`email/` stays whole in `platform/email/`.** Splitting the three templates to their
  contexts would cost ~40 lines of registry inversion to relocate 51 lines of HTML.
  Revisit when a context needs a template without editing `platform/`.

**What is lost:** `packages/shared/tsconfig.json` has no `@/api/*` path, so today shared
_cannot_ import a context — a compiler-enforced directional guarantee that currently
holds. After the merge only lint enforces it. Accepted because the
`platform-imports-no-context` rule states exactly that constraint, and because the
shared tsconfig's guarantee was already undercut by `apps/api` compiling those sources
into its own program.

### Why two folders is simpler, not more complex

Two folders means **two lint rules**, both one line each:

```js
{ from: "kernel",   allow: ["kernel"] },              // kernel imports nothing else
{ from: "domain",   allow: ["kernel", ...ownContext] } // note: no "platform"
```

plus the external-import ban applied to `kernel` alongside `domain`. One folder means a
carve-out that cannot be stated at all. The apparently-simpler option is the one that
does not work.

### `kernel/` should stay small

Four files is the expectation, not a starting point: `actor.ts`, `id.ts`,
`errors/domain-error.ts`, `time/iso.ts`. Each one is referenced by domain code — that is
question 2, and it is what keeps the folder honest. Anything larger is a sign that
context-specific vocabulary, or a port nobody in `domain/` calls, is leaking in.

**When in doubt, a thing belongs to a context, not to `kernel/`.** The prior art here is
`tags`: it looked like shared-kernel material and is instead a bounded context with a
published `TagPolicy` value object ([03 §3.3](../03-context-map.md)).

---

## Consequences

### Positive

- _"`domain/` is framework-free"_ becomes mechanically enforceable, by two rules that
  cannot be satisfied accidentally.
- `AsksynkError`'s split falls out naturally: the error _type_ is domain vocabulary
  (`kernel/errors/domain-error.ts`); the _status code_ is transport
  (`platform/errors/http-status.ts`). That was already the recommendation in
  [04 §7](../04-layering.md); this ADR gives each half a home.
- `infrastructure/db/` stops being a third top-level shared folder.
- The one-line `common/logger/logger.config.ts` re-export — a barrel, which
  `CLAUDE.md` forbids — is deleted rather than carried forward.

### Negative

- Two shared folders to explain to a newcomer instead of one. Mitigated by the
  one-sentence test above.
- Dissolving `packages/shared` rewrites 80 import statements and touches five config
  files, and gives up a compiler-enforced "shared cannot import a context" guarantee in
  exchange for a lint-enforced one.
- The `kernel/time/decorators.ts` file already created has to move again, and its 27
  import sites rewritten. Mechanical, and they need rewriting anyway — the IDE
  generated them as non-aliased `"@/api/kernel/...`, which `CLAUDE.md` forbids.

### Neutral

- Naming. `platform/` was chosen over `infrastructure/` because the latter is already
  the name of a _per-context_ layer, and over `shared/` because `packages/shared`
  exists. The name is not load-bearing; the dependency rule is.

---

## Verification

```bash
# kernel imports nothing but kernel and libraries (no framework, no context)
grep -rn 'from "@/' apps/api/"@/api/kernel/ | grep -v 'from "@/api/kernel/'  # → empty

# no domain layer reaches platform
grep -rn '@/api/platform' apps/api/src/*/domain/                          # → empty

# platform never reaches a context
grep -rn '@/api/' apps/api/src/platform/ | grep -vE '@/api/(kernel|platform)/'  # → empty

# common/, infrastructure/ and packages/shared are gone
ls apps/api/src/common apps/api/src/infrastructure packages/shared 2>&1   # → No such file
grep -rn '@/shared/' apps/api/ --include='*.ts'                           # → empty
```

Plus `pnpm lint:boundaries` passing with the four rules added in
[08-roadmap.md](../08-roadmap.md).

## References

- [04-layering.md §1a](../04-layering.md) — the tiers and the per-file mapping
- Grzybek, [Modular Monolith: Domain-Centric Design](https://www.kamilgrzybek.com/blog/posts/modular-monolith-domain-centric-design)
  — _"Domain Model should have Persistence Ignorance… and be completely testable"_
- Evans, _Domain-Driven Design_ — Shared Kernel, and the warning that it is the
  pattern most easily abused into a dumping ground
