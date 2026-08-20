# asksynk backend — architecture

An analysis of the current backend and a plan to restructure it around pragmatic
Domain-Driven Design.

Written 2026-08-07 against commit `fcd9922`. All metrics and file references were
derived mechanically from the tree at that commit.

---

## The product, in one paragraph

Asksynk gives a user control over their attention. **Input channels** deliver
notifications (today: in-app messages; next: gmail, slack, whatsapp). The user puts
**tags** on things — and a tag is not a label, it is a _policy_: it says _when_ the
thing behind it deserves an answer, either "within N minutes" or "in the next
timeblock I have booked for this". Tagged input becomes an **attention item** with a
derived due date. The user's **calendar** is the surface where they decide when to
act. Public links let outsiders see a schedule and start a conversation.

**Tag as the barrier between input and attention** is the product. Everything else is
supporting machinery.

---

## Read in this order

| Doc                                          | What it answers                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| [01-current-state.md](01-current-state.md)   | What is actually in the repo today, with numbers                                 |
| [02-why-not-ddd.md](02-why-not-ddd.md)       | Why the current shape is not DDD, argued against named sources                   |
| [03-context-map.md](03-context-map.md)       | The target bounded contexts and why each boundary sits where it does             |
| [04-layering.md](04-layering.md)             | The layer template, the `kernel/` vs `platform/` tiers, and the NestJS mechanics |
| [05-integration.md](05-integration.md)       | How contexts talk — decision table plus a verdict for every current violation    |
| [06-persistence.md](06-persistence.md)       | Schema-per-context, foreign key policy, repository ports, read models            |
| [07-attention-core.md](07-attention-core.md) | The heart of the product, designed for the channels that are coming              |
| [08-roadmap.md](08-roadmap.md)               | Eight waves, each independently shippable                                        |
| [09-references.md](09-references.md)         | Every source, and what specifically it justifies                                 |
| [adr/](adr/)                                 | The five decisions that are expensive to reverse                                 |

---

## TL;DR

**The good news first.** This is not a rescue job. The codebase already has things
many NestJS apps never get right:

- Controllers are clean — none touch a repository or Drizzle, none leak
  `$inferSelect` into a DTO.
- No service imports Drizzle or a schema table. Persistence really does go through
  repositories.
- Transactions are uniform and correct: `TransactionHost` everywhere, re-entrant
  `@Transactional()`, exactly one raw `db.transaction()` in the whole repo.
- There is a working transactional outbox with two delivery legs.
- WebSocket broadcasting is _already_ decoupled — no domain service can reach the
  gateway.
- One textbook context seam already exists (the attachment permission resolver).

**The problem is not layering inside a module. It is that the modules are not
boundaries.**

Eight findings, in descending order of how much they will cost as the app grows:

1. **Modules have no contract, so callers reach into internals.** 16 cross-module
   imports of another module's _repository_, across 13 files. `TagRepository` is
   provided four separate times because `TagsModule` exports only its service.
2. **The database is the real integration layer.** Nine foreign keys cross module
   boundaries. Two modules query tables they do not own — one of them in raw SQL.
3. **The core domain is the least-modelled part of the system.** The tag → due-date
   policy is a private method on a DI-injected class, and its calendar lookup is a
   raw SQL CTE living in the wrong module.
4. **The domain model is anemic.** All 20 entity classes are field bags with
   read-only predicates. Not one enforces an invariant or owns a state transition.
   49 ownership checks live in services; 16 in entities.
5. **There are no ports.** 21 concrete Drizzle repositories, injected by concrete
   type. The dependency arrow is never inverted.
6. **Unit tests cannot run.** `testMatch` only matches `*.integration.test.ts`, so a
   `*.spec.ts` would be silently ignored. Roughly 700 lines of already-pure logic is
   untested and untestable by configuration.
7. **The published language lives outside every context** — one 347-line event
   registry in `packages/shared` holding all 24 event contracts.
8. **`attention_items` is a projection wearing an aggregate's clothes** — source
   identity hides in an unindexed `metadata` jsonb, probed with `metadata->>'key'`.

**The plan.** Ten bounded contexts, each with the same four-layer template, talking
only through declared contracts. One Postgres schema per context, no foreign keys
across them. Rich aggregates only where there is a real state machine. Eight waves,
starting with the one that makes everything else safe: turning unit tests on.

---

## The decisions

Five choices shape everything else. Each has an ADR.

| Decision              | Choice                                                              | ADR                                                                 |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Persistence isolation | Postgres schema per context; no cross-schema FKs                    | [0001](adr/0001-schema-per-context.md)                              |
| Repository ports      | `abstract class` as both contract and DI token                      | [0002](adr/0002-repository-ports-as-abstract-classes.md)            |
| Calendar boundary     | `calendar-events` + `calendar-integrations` merge into `scheduling` | [0003](adr/0003-merge-calendar-events-and-calendar-integrations.md) |
| Attention shape       | Aggregate whose _content_ is a projection; typed source columns     | [0004](adr/0004-attention-as-projection-with-typed-source.md)       |
| Shared code           | Two tiers — `kernel/` (pure) and `platform/` (framework-aware)      | [0005](adr/0005-kernel-and-platform-tiers.md)                       |

Code structure stays **in place** — `apps/api/src/<context>/` with layered
subfolders — enforced by `eslint-plugin-boundaries` and `dependency-cruiser` rather
than by extracting packages. Domain models get rich **only where a state machine
exists**; everything else stays a typed record. Both choices follow the `YAGNI` rule
in `CLAUDE.md`.

---

## What this plan deliberately does _not_ do

Worth stating, so nobody re-opens them later:

- **No microservices.** A modular monolith is the target and the end state. The
  boundaries exist to keep the code understandable, not to prepare a split.
- **No CQRS framework, no event sourcing.** The outbox already gives what is needed.
  Read models are plain queries in the application layer.
- **No Value Object for every primitive.** Only where a rule attaches
  (`AnswerMode`, `RecurrenceRule`, `AttentionSource`).
- **No rewrite.** Every wave in [08-roadmap.md](08-roadmap.md) ships on its own and
  leaves the app working.
- **`messaging → tasks` stays a direct call.** It is a genuine same-transaction
  command. See [05-integration.md](05-integration.md).
