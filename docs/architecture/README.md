# asksynk backend — architecture

How the backend is shaped today, the pragmatic-DDD shape it is moving to, and the
order to get there. Audited against the code at `5129fc8` (2026-10-10).

**Status:** Wave 0 (safety net, `kernel/` + `platform/` split, typed errors, events,
jobs) is done. **Next: [Wave 1 — extract the pure core](07-roadmap.md#wave-1--extract-the-pure-core).**

---

## The product, in one paragraph

Asksynk gives a user control over their attention. **Input channels** deliver things
to respond to (today: in-app messages and tasks; next: gmail, slack, whatsapp). The
user puts **tags** on them — and a tag is a _policy_, not a label: it says _when_ the
thing deserves an answer, either "within N minutes" or "in the next timeblock booked
for this tag". Tagged input becomes an **attention item** with a derived due date.
The **calendar** is where the user decides when to act. Public links let outsiders see
a schedule and start a conversation.

**Tag as the barrier between input and attention** is the product. The spine is
_input → tagging → attention → scheduling_; everything else supports it.

---

## Where we are going

Ten bounded contexts ([02](02-context-map.md)), each with the same layer template
([03](03-layering.md)), talking only through declared contracts ([04](04-integration.md)),
each owning its own Postgres schema with no cross-context FKs ([05](05-persistence.md)).
Rich aggregates only where a real state machine exists. Code stays in place under
`apps/api/src/<context>/`, enforced by lint, not by packages.

## Decisions

| Decision              | Choice                                                                  | Record                                                              |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Persistence isolation | Postgres schema per context; no cross-schema FKs except `users`         | [ADR 0001](adr/0001-schema-per-context.md)                          |
| Repository ports      | `abstract class` = contract + DI token; no `Symbol` tokens              | [ADR 0002](adr/0002-repository-ports-as-abstract-classes.md)        |
| Calendar boundary     | `calendar-events` + `calendar-integrations` merge into `scheduling`     | [ADR 0003](adr/0003-merge-calendar-events-and-calendar-integrations.md) |
| Attention shape       | Aggregate with a projected slice; typed `source_*` columns              | [ADR 0004](adr/0004-attention-as-projection-with-typed-source.md)   |
| Shared code           | `kernel/` (pure, domain may import) + `platform/` (framework-aware)     | [ADR 0005](adr/0005-kernel-and-platform-tiers.md)                   |
| Event delivery        | One `key_strict_fifo` queue per consumer group; own dead-letter table   | [ADR 0006](adr/0006-group-ordered-event-delivery.md)                |
| Background jobs       | One typed jobs API; caller-derived ids, nothing stored                  | [ADR 0007](adr/0007-unified-typed-jobs.md)                          |
| Domain errors         | One `DomainError` + per-context catalogs; HTTP status decided at edge  | [platform/errors](../platform/errors.md)                            |

## Deliberately not doing

- **Microservices.** A modular monolith is the end state.
- **CQRS framework / event sourcing / `@nestjs/cqrs`.** The outbox is enough; read
  models are plain queries.
- **A value object per primitive.** Only `AnswerMode`, `RecurrenceRule`,
  `AttentionSource`.
- **Workspace packages per context.** Lint gives most of the benefit.
- **A rewrite.** Every wave ships alone and leaves the app working.

---

## Docs

| Doc                                          | Answers                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| [01-current-state.md](01-current-state.md)   | What is solid, what is still wrong, with numbers                   |
| [02-context-map.md](02-context-map.md)       | The target contexts and why each boundary sits where it does       |
| [03-layering.md](03-layering.md)             | Layer template, `kernel/` vs `platform/`, Nest mechanics, lint     |
| [04-integration.md](04-integration.md)       | How contexts talk; every current violation and its fix             |
| [05-persistence.md](05-persistence.md)       | Schema per context, FK policy, repositories vs queries             |
| [06-attention-core.md](06-attention-core.md) | The core domain, designed for the channels that are coming         |
| [07-roadmap.md](07-roadmap.md)               | Waves 1–8, guardrails, what to leave alone                         |
| [adr/](adr/)                                 | Decisions that are expensive to reverse                            |
| [../platform/](../platform/)                 | As-built reference: events, jobs, errors                           |

Key references: Grzybek, [Modular Monolith: A Primer](https://www.kamilgrzybek.com/blog/posts/modular-monolith-primer)
and [Integration Styles](https://www.kamilgrzybek.com/blog/posts/modular-monolith-integration-styles);
Vernon, [Effective Aggregate Design II](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_2.pdf);
Fowler, [Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html);
[Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon) (TS/Nest code reference).
