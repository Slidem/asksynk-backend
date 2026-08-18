# 09 — References and further reading

Every recommendation in these documents traces to something public. This page says
which source justifies what, so any claim can be checked rather than taken on trust.

Sources marked ✔ were read directly while writing this analysis (2026-08-07).

---

## Read in this order

If you read nothing else, read these four, in this sequence. Roughly two hours total.

1. ✔ **Grzybek — [Modular Monolith: A Primer](https://www.kamilgrzybek.com/blog/posts/modular-monolith-primer)** (~15 min)
   What makes a module a module. The "modules must have a defined interface" argument
   is the single most load-bearing idea in this plan.
2. ✔ **Grzybek — [Modular Monolith: Integration Styles](https://www.kamilgrzybek.com/blog/posts/modular-monolith-integration-styles)** (~20 min)
   The three ways modules can integrate and what each costs. Read the comparison
   diagrams; they are the decision table in [05](05-integration.md).
3. ✔ **Fowler — [Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html)** (~10 min)
   Short, and it describes the current entity layer almost word for word.
4. ✔ **Vernon — [Effective Aggregate Design, Part II](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_2.pdf)** (~45 min)
   "Reference other aggregates by identity" and "use eventual consistency outside the
   boundary" are why [07](07-attention-core.md) looks the way it does.

Then, when you get to implementation, keep
[Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon)
open as a code reference.

---

## Strategic design — boundaries and context maps

| Source                                                                                                                                      | Justifies                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✔ Kamil Grzybek — [Modular Monolith: A Primer](https://www.kamilgrzybek.com/blog/posts/modular-monolith-primer)                             | Modules need a **contract**; encapsulation is inseparable from modularity. This is the direct argument for `contract/` folders and the "`exports` may only contain contract classes" rule ([04](04-layering.md), [05](05-integration.md)).                                       |
| ✔ Kamil Grzybek — [Modular Monolith: Integration Styles](https://www.kamilgrzybek.com/blog/posts/modular-monolith-integration-styles)       | The Shared Database Data / Direct Call / Messaging comparison, and the rule _"no constraints between tables from separate modules and no transactions between them"_ — the basis for the FK policy in [06](06-persistence.md) and the decision table in [05](05-integration.md). |
| ✔ Kamil Grzybek — [Modular Monolith: Domain-Centric Design](https://www.kamilgrzybek.com/blog/posts/modular-monolith-domain-centric-design) | The four-layer template and _"Domain Model should have Persistence Ignorance… and be completely testable"_ ([04](04-layering.md)).                                                                                                                                               |
| ✔ Kamil Grzybek — [modular-monolith-with-ddd](https://github.com/kgrzybek/modular-monolith-with-ddd)                                        | A complete reference implementation. C#, but the structure maps directly. Worth browsing the module folder layout.                                                                                                                                                               |
| Eric Evans — _Domain-Driven Design_ (2003), ch. 14                                                                                          | Bounded Context, Context Map, Anti-Corruption Layer, Published Language, Open Host Service, Shared Kernel, Conformist — the vocabulary used throughout [03](03-context-map.md).                                                                                                  |
| [Context Mapper — Anticorruption Layer](https://contextmapper.org/docs/anticorruption-layer/)                                               | A compact, free summary of the context-map relationship patterns if you do not have the book.                                                                                                                                                                                    |
| ✔ Microsoft — [Anti-Corruption Layer pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer)          | _"the core purpose of an anti-corruption layer is to protect the domain model."_ Justifies naming `GoogleCalendarProvider` an ACL and keeping it at the edge of `scheduling` ([03 §3.1](03-context-map.md)).                                                                     |

---

## Tactical design — aggregates, models, and how deep to go

| Source                                                                                                                                                                             | Justifies                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✔ Vaughn Vernon — [Effective Aggregate Design, Part I](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_1.pdf)                                       | Model true invariants in consistency boundaries; design small aggregates. Why `AttentionItem`, `Timer` and `TaskSuggestion` are separate small aggregates rather than one graph.                                                                                                                                                                                    |
| ✔ Vaughn Vernon — [Part II](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_2.pdf)                                                                  | **Reference other aggregates by identity**, and _"any rule that spans Aggregates will not be expected to be up-to-date at all times."_ The direct justification for typed `source_id` soft references ([07 §3](07-attention-core.md)) and for the event-driven sync between attention and its sources.                                                              |
| ✔ Vaughn Vernon — [Part III](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_3.pdf)                                                                 | Discovering aggregate boundaries by asking the domain expert what may be stale.                                                                                                                                                                                                                                                                                     |
| ✔ Martin Fowler — [Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html)                                                                                     | Finding 4 in [02](02-why-not-ddd.md). Also the Evans quote that the service layer _"is kept thin. It does not contain business rules"_ — measured against 49 ownership checks in services vs 16 in entities.                                                                                                                                                        |
| ✔ Vlad Khononov — _Learning Domain-Driven Design_ (O'Reilly, 2021), [ch. 6](https://www.oreilly.com/library/view/learning-domain-driven-design/9781098100124/ch06.html) and ch. 10 | Core / supporting / generic subdomains, and the decision tree for transaction script vs active record vs domain model. **The justification for being rich only where a state machine exists** ([04 §6](04-layering.md)) and for the investment table in [03 §2](03-context-map.md). Also the important caveat that these "anti-patterns" are just tools misapplied. |
| [Is an ANEMIC Domain Model really that BAD? — CodeOpinion](https://codeopinion.com/is-an-anemic-domain-model-really-that-bad/)                                                     | The counter-argument, worth reading before committing to Wave 5. Short.                                                                                                                                                                                                                                                                                             |

---

## Architecture style — hexagonal, layering, testability

| Source                                                                                                        | Justifies                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✔ [Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon)                           | The closest TypeScript/NestJS reference implementation of everything in [04](04-layering.md). Also the pragmatic warning that a value object per primitive _"adds some extra complexity and boilerplate… For less complex and smaller projects it's definitely an overkill"_ — why only three VOs are proposed. |
| Alistair Cockburn — [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)            | The original ports-and-adapters article. The one rule: the application core defines the interfaces.                                                                                                                                                                                                             |
| Gary Bernhardt — [Boundaries](https://www.destroyallsoftware.com/talks/boundaries) (talk, ~35 min)            | Functional core / imperative shell. Why `decideDueDate` is a pure function taking `base: Date` rather than a service calling `new Date()` ([07 §7](07-attention-core.md)).                                                                                                                                      |
| ✔ [Functional Core with Ports and Adapters](https://dev.to/siy/functional-core-with-ports-and-adapters-3m0g)  | The same idea applied at function rather than service granularity.                                                                                                                                                                                                                                              |
| ✔ [NestJS — Custom providers](https://docs.nestjs.com/fundamentals/custom-providers)                          | `{ provide: AbstractClass, useClass: Impl }` and `useExisting`. The mechanics behind [ADR 0002](adr/0002-repository-ports-as-abstract-classes.md).                                                                                                                                                              |
| ✔ [NestJS DI with abstract classes](https://dev.to/ef/nestjs-dependency-injection-with-abstract-classes-4g65) | Why an abstract class works as a DI token where an interface cannot.                                                                                                                                                                                                                                            |

---

## Data patterns

| Source                                                                                                                                    | Justifies                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✔ Chris Richardson — [Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html)                             | Validates the existing outbox as a correct implementation, and states the obligation it creates: _"a message consumer must be idempotent."_ The current handlers already are — worth keeping that way.                                 |
| ✔ Microsoft — [CQRS pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs)                                          | Separate read and write models over **a single data store** as the practical middle ground. The justification for splitting `ThreadRepository` from `ConversationQuery` in [06 §5](06-persistence.md) without adopting event sourcing. |
| [Designing Read Models in DDD×CQRS](https://zenn.dev/135yshr/articles/60293061fe34dd?locale=en)                                           | Projections vs eventual consistency trade-offs — relevant to the `attention` projected-slice decision.                                                                                                                                 |
| ✔ [Sharing data between modules in a modular monolith](https://dev.to/lukaszreszke/sharing-data-between-modules-in-modular-monolith-50on) | The practical "queries shouldn't touch more than one schema" rule, from teams running Grzybek's approach. Directly behind [06 §4](06-persistence.md).                                                                                  |

---

## Tooling

| Source                                                                                                                                                 | Justifies                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| ✔ [Drizzle — SQL schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration)                                                             | `pgSchema("name")` and `schema.table(...)` — the mechanics of [06 §2](06-persistence.md).                                                        |
| ✔ [Drizzle — drizzle.config.ts](https://orm.drizzle.team/docs/drizzle-config-file)                                                                     | `schemaFilter: ["public", "schema1", …]`, and `migrations.schema` for the journal's location.                                                    |
| ✔ [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)                                                                                 | The cross-boundary rules in [08](08-roadmap.md). Resolves tsconfig path aliases natively.                                                        |
| ✔ [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) / [jsboundaries.dev](https://www.jsboundaries.dev/docs/overview/) | The in-editor layer rules in [04 §8](04-layering.md). **Note:** v7 changed parts of the options shape — pin the config to the installed version. |
| [Three ways to enforce module boundaries in an Nx monorepo](https://www.stefanos-lignos.dev/posts/nx-module-boundaries)                                | Useful comparison of enforcement approaches, if the current choice ever needs revisiting.                                                        |

---

## Things deliberately _not_ adopted, and where to read why

Worth knowing what was considered and rejected, so it does not get re-proposed.

| Not adopted                                     | Why                                                                                                                                                                                                                  | If you want to reconsider                                                                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Event sourcing**                              | The outbox already provides reliable integration events. Event sourcing solves auditability and temporal queries — neither is a current requirement, and it would make the attention projection considerably harder. | Vernon, _Implementing DDD_ ch. 4; [DDD.EventSourcing.PortsAndAdapters.TypeScript.NestJS.Chess](https://github.com/nowakprojects/DDD.EventSourcing.PortsAndAdapters.TypeScript.NestJS.Chess) |
| **`@nestjs/cqrs`**                              | It would add a command bus and handler indirection over an application layer that is already explicit. The use-case classes give the same separation with less machinery.                                            | [NestJS CQRS docs](https://docs.nestjs.com/recipes/cqrs)                                                                                                                                    |
| **Extracting contexts into workspace packages** | Would give compile-time boundary enforcement, but as a big-bang move with more build config. `dependency-cruiser` gets ~90% of the benefit for a few hours of setup.                                                 | Revisit if a second application (an admin app, a worker service) starts consuming these contexts.                                                                                           |
| **Microservices**                               | A modular monolith is the target _and_ the end state. The boundaries exist to keep the code comprehensible, not to prepare a split.                                                                                  | Grzybek's primer covers exactly this framing.                                                                                                                                               |
| **A value object per primitive**                | Boilerplate and runtime cost in TypeScript for little gain at this size. Only `AnswerMode`, `RecurrenceRule` and `AttentionSource` earn it.                                                                          | The `domain-driven-hexagon` note on primitive obsession, linked above.                                                                                                                      |

---

## Where these documents may be wrong

Stated plainly, because a design document that sounds certain about everything is
not trustworthy.

- **Schema-per-context is the most contestable decision in the plan.** The case
  against it is real and is argued in [ADR 0001](adr/0001-schema-per-context.md). If
  the raw-SQL audit in Wave 7.1 turns up more friction than expected, stopping after
  the FK removal (7.2) captures most of the benefit at a fraction of the cost.
- **The `identity.users` FK exception is a judgement call.** A purist would drop those
  17 foreign keys too. The reasoning is in [06 §3](06-persistence.md); the cost of
  being wrong is a future migration, not a design dead-end.
- **`conversations` and `sharing` staying separate** could go the other way. The FK
  density between them is the highest in the schema. The argument for separating them
  is conceptual (identity vs participation) rather than measured.
- **Wave 6's data migration has no rollback.** That is acceptable under the MVP
  policy in `CLAUDE.md`, but it is the one step that genuinely cannot be undone.
- **All effort estimates are guesses.** They are there to convey relative size, not to
  be planned against.
