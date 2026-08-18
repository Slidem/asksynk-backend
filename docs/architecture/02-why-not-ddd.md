# 02 — Why this is not DDD yet

The codebase has DDD _vocabulary_ — entities, repositories, services, mappers,
domain errors. What it does not have is the _properties_ those words are supposed to
buy: enforced boundaries, protected invariants, and a domain layer that could be
reasoned about without a database.

This document makes that argument concretely. Each finding names the source it is
measured against, so the claim can be checked rather than taken on faith.

A note on tone before starting: **none of this means the code is bad.** It is
coherent, consistent and clearly written by someone paying attention. The gap is
between "well-organised layered app" and "domain-driven" — a real gap, but a much
smaller one than most codebases face.

---

## Finding 1 — These are feature folders, not bounded contexts

**Measured against:** Grzybek, [Modular Monolith: A Primer](https://www.kamilgrzybek.com/blog/posts/modular-monolith-primer)
and [Integration Styles](https://www.kamilgrzybek.com/blog/posts/modular-monolith-integration-styles).

A module is only a module if it has three properties: it is independent, it
encapsulates its internals, and **it has a defined interface**. Grzybek is blunt about
the third:

> We can't talk about modular architecture if our modules don't have a _Contract_
> […] everything that we share outside **becomes the public API of the module**.
> Therefore, **encapsulation is an inseparable element of modularity**.

Here, nothing is deliberately shared. `TagsModule` exports `TagsService` and nothing
else, so three other modules import `TagRepository` directly and re-provide it —
producing four instances of the same repository and four independent write paths to
the `tags` table.

That is the shape of the whole system: 16 cross-module repository imports across 13
files. The modules are namespaces, not boundaries.

**Why it matters for asksynk specifically.** Gmail, Slack and WhatsApp channels are
next. Each is a new module that must reach the attention core. With no contract to
reach _through_, each new channel will do what the existing ones did — inject
whatever repository it needs. Three channels from now, the coupling graph is
unrecoverable.

---

## Finding 2 — The database is the integration layer

**Measured against:** Grzybek, _Integration Styles_, on the _Shared Database Data_
style:

> its biggest disadvantage is a **very high coupling**. By sharing data, modules
> share their state which couples them together. […] one little change to database
> structure or even data itself can break another module without notice.

And on the alternative:

> Not sharing the data implies that each module has its own data set. It can be the
> same database broken down by schemas […] **it is important to keep the data really
> in isolation. It means no constrains between tables from separate modules and no
> transactions between them.**

asksynk today is squarely in the first category: one flat schema, nine foreign keys
crossing module boundaries, and two modules issuing queries against tables they do
not own — one of them in raw SQL with a Postgres extension call.

The single clean counter-example proves the team already knows the answer:
`calendar_event_links.asksynk_event_id` is a plain `uuid` with no FK, precisely so the
link table does not bind to the other side.

**Why it matters.** A foreign key is a permanent, database-enforced statement that
two things must exist together. Nine of them across five boundary pairs means the
boundaries cannot move without a data migration — so in practice, they never move,
and the code drifts to match the schema rather than the domain.

---

## Finding 3 — The core subdomain is the least-modelled part of the system

**Measured against:** Khononov, _Learning Domain-Driven Design_, ch. 6 —
core / supporting / generic subdomains, and the rule that **modelling investment
should track subdomain type**. Core subdomains are complex _and_ are the competitive
advantage; they get the richest model. Generic subdomains get bought or kept simple.

asksynk's core is: _a tag decides when the thing behind it deserves attention._

Here is where that rule lives today:

```ts
// apps/api/src/attention-items/attention-due-date.service.ts:75
private pickEarliestCandidate(
  tags: Tag[],
  immediateBase: Date,
  occurrenceMap: Map<string, { date: Date; eventId: string }>,
): { dueDate: Date | null; sourceCalendarEventId: string | null } {
```

A **private method** on a class that only exists to be dependency-injected. The logic
inside is pure — no I/O, no framework, fully deterministic — and it is the single most
important algorithm in the product. It cannot be called, tested, reused or reasoned
about on its own.

Its other half is worse. The timeblock lookup — "when is this user's next calendar
occurrence carrying this tag" — is a raw SQL CTE at
[`attention-items.repository.ts:370-411`](../../apps/api/src/attention-items/attention-items.repository.ts):
it names `calendar_events`, `calendar_event_tags` and `calendar_event_exceptions`
directly, calls a `rrule.between(...)` Postgres extension, hardcodes a 365-day
window, and **duplicates recurrence expansion that already exists in TypeScript** in
`calendar-events/utils/recurrence.utils.ts`.

So the product's differentiator is: half a private method, half a raw SQL string, in
a module that owns neither of the concepts involved, with two independent
implementations of recurrence.

Meanwhile the generic subdomains — attachments, user settings, profile — have the
same full folder ceremony as everything else.

**The investment is inverted.**

---

## Finding 4 — The domain model is anemic

**Measured against:** Fowler, [Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html).

Fowler's description, written in 2003, describes the entity layer here almost exactly:

> There are objects, many named after the nouns in the domain space, and these
> objects are connected with the rich relationships and structure that true domain
> models have. The catch comes when you look at the behavior, and you realize that
> there is hardly any behavior on these objects, making them little more than bags of
> getters and setters. […] Instead there are a set of service objects which capture
> all the domain logic […] These services live on top of the domain model and use the
> domain model for data.

The audit in [01-current-state.md §4.3](01-current-state.md) lists every public method
on all 20 entities. **Every one is a predicate or a getter. Zero mutators. Zero state
transitions. Zero constructors that reject an invalid state.**

The consequence is visible in the services:

```ts
// apps/api/src/attention-items/attention-items.service.ts:73-75
if (input.status !== undefined) item.status = input.status;
```

Any caller can put an `AttentionItem` into any status, from anywhere, without passing
a rule. The status transition — _the user deciding they have dealt with something_,
which is the product's central action — is an assignment.

Same story elsewhere:

- `timers.service.ts:163-274` implements a five-state machine with string-compare
  guards (`"Timer not paused"`).
- `task-status.util.ts` aggregates batch status as a free function on raw enums.
- `calendar-sync.service.ts` mutates events with `applyFields(event, fields)`.

Ownership checks by layer: **services 49, entities 16**. The entity knows _how to
answer_ the question; the service decides _what the rule is_.

Fowler also anticipates the defence — "the service layer holds the logic" — and
quotes Evans against it: the application layer _"is kept thin. It does not contain
business rules or knowledge."_ Here it contains nearly all of them.

**Caveat, and it is an important one.** Anemic models are not universally wrong.
Khononov's decision tree explicitly endorses transaction script and active record for
_simple_ business logic, and warns that patterns become anti-patterns only when
misapplied. That is why this plan makes entities rich **only where there is a genuine
state machine** — see [04-layering.md §5](04-layering.md). `UserSettings` should stay
a record forever.

---

## Finding 5 — There are no ports, so there is no hexagon

**Measured against:** Cockburn's Ports & Adapters, and the concrete reference
implementation at [Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon).

Hexagonal architecture is one rule: **the application core defines interfaces; the
outside world implements them.** The arrow points inward.

In `apps/api`, 21 repositories are concrete `@Injectable()` Drizzle classes, and every
service injects them by concrete type. The arrow points outward — the "domain"
depends on the adapter. There is no hexagon, only a layered app with a naming
convention.

The proof that this is a gap rather than a philosophy: `packages/shared` **does** use
ports — `abstract class EventsPublisher` / `EventsPublisherImpl`, and
`abstract class ScheduledJobService` / `PgBossScheduledJobService`. The pattern is
already in the codebase, already understood, just never applied to persistence.

**The immediate cost is testability**, which is Finding 6.

---

## Finding 6 — The domain cannot be tested without Postgres

```ts
// apps/api/jest.config.ts:6
testMatch: ["**/*.integration.test.ts"],
```

A `*.spec.ts` file is not merely absent — it would be **silently ignored** if written.
There are currently zero of them.

Combined with Finding 5, the result is that no business rule in this system can be
tested without booting Nest, running `drizzle-kit push`, and truncating a live
database. Every test costs seconds and a Docker container.

The irony: roughly **700 lines of pure, dependency-free logic already exist** — all 20
entities, `recurrence.utils.ts`, `task-status.util.ts`, `oauth-state.util.ts`, the
due-date algorithm — and none of it is tested, purely because of one line of
configuration.

Coverage today: 5 integration tests. Nothing at all covers `messaging` (the largest
service in the app at 683 lines), `calendar-integrations` (2,135 LOC), `networks`,
`tags`, `public-views`, `auth`, or the WebSocket gateway.

**This is why Wave 0 of the roadmap is the test configuration, not the architecture.**
Refactoring 16,000 lines with no safety net is how refactors fail.

---

## Finding 7 — The published language lives outside every context

**Measured against:** Evans' _Published Language_ and _Open Host Service_ context-map
patterns.

`packages/shared/src/event-registry/events.registry.ts` — 347 lines — defines all 24
domain events for all contexts in one file: tags, messaging, calendar, timers, tasks,
suggestions, attention.

A domain event is a context's _statement about itself_. Centralising all of them
means no context owns its own contract, and every change to any event is a change to
a file every context imports.

It also forces a known duplication, acknowledged in a comment in the file:
`AttentionItemUpserted`'s zod schema is a hand-maintained copy of
`AttentionItemResponse` in `apps/api`, because `packages/shared` may not depend on
`apps/api`. Two definitions of the same payload, kept in sync by hand.

Symptoms of the missing ownership are already visible: `tag.created` is defined but
has **no publisher and no consumer**, and the `email` delivery group has **no handler
anywhere** — yet the dispatcher faithfully creates the `tag.updated.email` queue and
enqueues jobs into it that nothing will ever process.

---

## Finding 8 — The hub of the system is the least typed thing in it

`attention_items` is where the product's value converges, and it is modelled as a
polymorphic bag:

- `type` names the **source context** (`tagged_message | incoming_email |
slack_message | whatsapp_message | suggested_timeblock | suggested_task | task`) —
  three of those values have no producer yet, which tells you the column is really an
  extension point.
- Source identity lives in an untyped `metadata jsonb` and is retrieved with
  `metadata->>'messageId'`, `metadata->>'taskId'`, `metadata->>'taskBatchId'`,
  `metadata->>'suggestionId'` — **four query paths, no supporting index**.
- `source_calendar_event_id` is a `uuid` with no FK.
- `upsertFromSource` hardcodes `type: "task"` for both tasks and batches.

**Measured against:** Vernon's [Effective Aggregate Design, Part II](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_2.pdf)
— _reference other aggregates by identity_. That is exactly the right instinct here,
and the code has it. But "by identity" means a **typed, indexed identity**, not a
JSON key probe. What exists is the coupling cost of a reference with none of the
benefit.

**Why it matters for growth.** Adding Gmail today means: a new enum value, a new arm
on the `AttentionItemMetadata` union, a new bespoke handler, a new
`metadata->>'emailId'` query path, and a new unindexed scan. Four channels in, the
table has eight jsonb probe paths and the union type has eight arms.
[07-attention-core.md](07-attention-core.md) fixes this so adding a channel is one
adapter and one enum value.

---

## What follows from all this

The eight findings reduce to three actual problems:

1. **No contracts** — so callers reach into internals, and the DB pins the boundaries.
   → [03-context-map.md](03-context-map.md), [05-integration.md](05-integration.md),
   [06-persistence.md](06-persistence.md)
2. **No ports and no unit tests** — so nothing can be changed with confidence.
   → [04-layering.md](04-layering.md), and Wave 0 of [08-roadmap.md](08-roadmap.md)
3. **The core is modelled least** — so the part most likely to change is the part
   hardest to change.
   → [07-attention-core.md](07-attention-core.md)

Everything else in these documents is a consequence of fixing those three.

---

Next: [03-context-map.md](03-context-map.md) — where the boundaries actually belong.
