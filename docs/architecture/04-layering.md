# 04 — Layering

Every context has the same four layers and the same dependency rule, over two shared
tiers (`kernel/` and `platform/`). The rule is enforced by lint, not by discipline.

---

## 1. The rule

```
        ┌──────────────────────────────────────────────┐
        │  presentation/   rest · ws · events · jobs   │  inbound adapters
        └───────────────────────┬──────────────────────┘
                                │
        ┌───────────────────────▼──────────────────────┐
        │  application/    use cases · facade          │  orchestration, @Transactional
        └───────────────────────┬──────────────────────┘
                                │
        ┌───────────────────────▼──────────────────────┐
        │  domain/         aggregates · policies       │  pure. no framework.
        │                  ports/ (interfaces)         │
        └───────────────────────▲──────────────────────┘
                                │ implements
        ┌───────────────────────┴──────────────────────┐
        │  infrastructure/ drizzle · acl · clients     │  outbound adapters
        └──────────────────────────────────────────────┘
```

| Layer             | May import                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `domain/`         | `kernel/` only                                                                             |
| `contract/`       | `kernel/` only                                                                             |
| `application/`    | own `domain/`, own `application/`, `kernel/`, `platform/`, **other contexts' `contract/`** |
| `infrastructure/` | own `domain/`, own `application/`, `kernel/`, `platform/`, Drizzle, SDKs                   |
| `presentation/`   | own `application/`, own `domain/` (types), `kernel/`, `platform/`                          |
| `kernel/`         | **nothing** — not a context, not `platform/`                                               |
| `platform/`       | `kernel/` only — never a context                                                           |

**No context ever imports another context's `domain/`, `application/`,
`infrastructure/` or `presentation/`. Only `contract/`.**

Three corollaries worth spelling out:

- `domain/` imports no `@nestjs/*`, no `drizzle-orm`, no `class-validator`, no
  `socket.io`, no `pg-boss`. It is plain TypeScript that would run in a browser.
- **`domain/` may import `kernel/` but never `platform/`** — that is the whole reason
  the two are separate. See §1a.
- `presentation/` never talks to `infrastructure/` directly. A controller does not
  touch a repository — which is already true today and must stay true.

---

## 1a. `kernel/` vs `platform/` — the two shared tiers

Today's `common/` and `infrastructure/` hold two genuinely different kinds of thing,
and merging them into one shared folder breaks the rule above.

|                   | `kernel/`                                                   | `platform/`                                                                                                                       |
| ----------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Contains          | pure domain vocabulary                                      | framework-aware shared infrastructure                                                                                             |
| Imports           | nothing                                                     | `kernel/`, plus any framework                                                                                                     |
| Who may import it | **everything, including `domain/`**                         | `application/`, `infrastructure/`, `presentation/` — **never `domain/`**                                                          |
| Examples          | `Actor`, `generateId`, `DomainError`, `isValidIanaTimezone` | `Clock` + `SystemClock`, `EventsPublisher`, the exception filter, DTO validation decorators, the db module, `RealtimeBroadcaster` |

### The placement test — two questions, both must be yes

For `kernel/`:

1. **Is it pure?** No framework import, directly or transitively.
2. **Does `domain/` actually reference it?** In a method signature, a constructor
   invariant, or a factory.

Question 2 is the one that gets forgotten. Purity is _necessary_ but not _sufficient_ —
otherwise `kernel/` slowly accumulates every dependency-free file in the codebase and
becomes `common/` again.

Applying it to the four kernel files: `Actor` appears in domain signatures
(`message.changeManagedStatus(actor, …)`); `generateId` is called by aggregate
factories; `DomainError` is thrown by aggregates; `isValidIanaTimezone` is called by
`RecurrenceRule`'s constructor. All four pass both questions.

### Ports: the abstract/impl split does **not** run along the kernel/platform seam

The natural instinct is: _abstract class → `kernel/`, implementation → `platform/`._
That is the wrong axis. **A port lives with the layer that declares the need**, and both
halves live together.

Worked example — `EventsPublisher`, the port that most invites the split:

```ts
// today: packages/shared/src/event-publisher/events-publisher.ts
export abstract class EventsPublisher {
  abstract publish<T extends EventDef>(
    def: T,
    payload: EventOf<T>,
  ): Promise<void>;
}
```

Both questions fail:

1. **Not pure.** `EventDef` and `EventOf` come from `events.types.ts`, which is
   `import z from "zod"` — `EventOf<T> = z.infer<T["schema"]>`. The abstract class's
   _signature_ depends on zod, so moving it to `kernel/` would drag zod in and trip the
   `boundaries/external` rule in §8.
2. **Domain does not need it.** All 14 files injecting `EventsPublisher` are services.
   Zero are entities. Aggregates _return_ what happened (`timer.pause(now)` returns a
   `TimerTransition`; `item.transitionTo(…)` returns a boolean) and the **application
   layer** publishes it. That is the design in §4 — and it is why the domain never needs
   a publisher.

So **both halves go to `platform/events/publisher/`.** Same for `ScheduledJobService`
(whose abstract is, notably, 100% import-free — it passes question 1 and still fails
question 2), `RealtimeBroadcaster`, and `ObjectStorage`.

The abstract/impl split is real and valuable — it is [ADR 0002](adr/0002-repository-ports-as-abstract-classes.md).
It just runs **port vs adapter**, not **kernel vs platform**:

| Port                                                                     | Abstract lives in     | Adapter lives in                       |
| ------------------------------------------------------------------------ | --------------------- | -------------------------------------- |
| `TagRepository`, `AttentionItemsRepository`, …                           | `<ctx>/domain/ports/` | `<ctx>/infrastructure/persistence/`    |
| `TagCatalogPort`, `CalendarOccurrencePort`, …                            | `<ctx>/contract/`     | the owning context's `infrastructure/` |
| `EventsPublisher`, `ScheduledJobService`, `RealtimeBroadcaster`, `Clock` | `platform/<area>/`    | `platform/<area>/`                     |

Repository ports **do** split by layer — but _within a context_, `domain/ports/` →
`infrastructure/`. That is the split the instinct is reaching for; it just does not
involve `kernel/`.

**`Clock` is the instructive borderline.** Its abstract is trivially pure, so question 1
passes — but no domain signature takes a `Clock`. Time reaches the domain as a plain
`now: Date` argument passed down by the application layer (§4), which is precisely what
makes the policies deterministic and testable. So `Clock` is `platform/`, both halves.
If a domain signature ever genuinely needs a clock, that is the signal to revisit — and
also a signal the design has drifted.

**Why this is not over-engineering.** `kernel/time/decorators.ts` — the file created
when `common/decorators/*` was first moved — imports `@nestjs/common` and
`class-validator`. If `domain/` may import `kernel/`, then `domain/` can transitively
reach Nest, and the most important rule in this document is unenforceable. All 27 of
that file's consumers are controllers and DTOs, so it was never kernel material.

Two folders means two lint rules, both trivially expressible. One folder means a
purity carve-out that no linter can state.

### Target contents

```
apps/api/"@/api/kernel/                # pure. four files — this is what domain/ can see.
  actor.ts                          # Actor VO — appears in domain method signatures
  id.ts                             # generateId — called by aggregate factories
  errors/domain-error.ts            # DomainError base — thrown by aggregates
  time/iso.ts                       # isValidIanaTimezone — called by RecurrenceRule's ctor

apps/api/src/platform/              # framework-aware. domain/ may NOT import this.
  clock/clock.ts                    # abstract Clock  — see §1a "ports"
  clock/system-clock.ts             # @Injectable
  clock/clock.module.ts
  db/{db.ts,db.module.ts,tx.module.ts}
  db/pg-error-codes.ts              # ex packages/shared
  errors/errors.filter.ts           # AllExceptionsFilter
  errors/http-status.ts             # DomainError -> HTTP status
  errors/api-error-responses.decorator.ts
  validation/decorators.ts          # IsUuidV7, IsIanaTimezone, UuidV7Param, …
  http/query-parsers.ts             # toOptionalBoolean, toOptionalDate, …
  http/bearer-token.ts
  realtime/realtime-broadcaster.ts  # the port the WS transport implements
  logger/logger.config.ts           # ex packages/shared
  config/{cors,swagger}.config.ts
  events/                           # ex packages/shared — the outbox machinery
    publisher/                      #   abstract EventsPublisher + impl
    dispatcher/                     #   outbox -> pg-boss drain
    consumer/                       #   @EventHandler decorator, discovery, realtime listener
    registry/                       #   defineEvent + event types  (NOT the event catalogue)
  jobs/                             # ex packages/shared
    message-bus/                    #   pg-boss wrapper
    scheduled-job/                  #   abstract port + pg-boss impl
  email/                            # ex packages/shared — sender, providers, templates
```

`common/`, `infrastructure/` **and `packages/shared` all disappear.** See §1b.

### Where each current file lands

| Today                                            | Goes to                                                                        | Why                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `kernel/time/iso.ts`                             | **stays**                                                                      | pure predicates, zero imports                                                          |
| `kernel/time/decorators.ts`                      | `platform/validation/decorators.ts`                                            | Nest + class-validator; 27/27 consumers are `rest/`                                    |
| `common/clock/clock.ts` → `abstract Clock`       | `platform/clock/clock.ts`                                                      | pure, but no domain signature takes a `Clock` — time reaches domain as `now: Date`     |
| `common/clock/clock.ts` → `SystemClock`          | `platform/clock/system-clock.ts`                                               | `@Injectable`                                                                          |
| `common/clock/clock.module.ts`                   | `platform/clock/`                                                              | Nest module                                                                            |
| `common/errors/errors.model.ts`                  | **split** → `kernel/errors/domain-error.ts` + `platform/errors/http-status.ts` | `AsksynkError.statusCode` is an HTTP concern — see §7                                  |
| `common/errors/errors.filter.ts`                 | `platform/errors/`                                                             | Nest exception filter                                                                  |
| `common/errors/api-error-responses.decorator.ts` | `platform/errors/`                                                             | Swagger                                                                                |
| `common/config/{cors,swagger}.config.ts`         | `platform/config/`                                                             | bootstrap wiring                                                                       |
| `common/utils/inputs.ts`                         | `platform/http/query-parsers.ts`                                               | every function takes `string \| undefined` — query-string parsing                      |
| `common/utils/token.ts`                          | `platform/http/bearer-token.ts`                                                | reads HTTP headers                                                                     |
| `common/logger/logger.config.ts`                 | **delete**                                                                     | a one-line re-export of `@/shared/logger.config` — a barrel, which `CLAUDE.md` forbids |
| `infrastructure/db/*`                            | `platform/db/*`                                                                | same tier; no reason for a third folder                                                |

---

## 1b. `packages/shared` dissolves into the same two tiers

`packages/shared` (36 files, 2,180 LOC) is a package in name only:

- **It has no `src/index.ts`.** `package.json` declares `main: "dist/index.js"`, but
  nothing imports the built artifact — every consumer goes through the `@/shared/*`
  path alias straight into `src/`.
- **`apps/api/tsconfig.json` already `include`s `../../packages/shared/src/**/\*.ts`\*\*,
  so the two compile as one TypeScript program. There is no compile-time boundary today.
- **`apps/api/package.json` already declares 12 of its 15 dependencies.** The only ones
  unique to it are `nodemailer`, `pg-boss` and `zod` (plus `@types/nodemailer`). That is
  the entire extent of the "sharing".
- **There is only one application.** Nothing else consumes it.

So it is 2,180 lines of framework infrastructure behind a workspace boundary that costs
configuration and buys nothing. It becomes `platform/` — and one file becomes `kernel/`.

### Where each piece lands

| `packages/shared/src/…`                                     | LOC | Goes to                                                   |
| ----------------------------------------------------------- | --: | --------------------------------------------------------- |
| `id.ts`                                                     |  10 | **`kernel/id.ts`** — see below                            |
| `event-consumer/`                                           | 508 | `platform/events/consumer/`                               |
| `event-dispatcher/`                                         | 285 | `platform/events/dispatcher/`                             |
| `event-publisher/`                                          |  63 | `platform/events/publisher/`                              |
| `event-registry/events.registration.ts` + `events.types.ts` | 134 | `platform/events/registry/`                               |
| `event-registry/events.registry.ts`                         | 348 | **splits per context** → `<ctx>/contract/<ctx>.events.ts` |
| `message-bus/`                                              | 278 | `platform/jobs/message-bus/`                              |
| `scheduled-job/`                                            | 154 | `platform/jobs/scheduled-job/`                            |
| `email/`                                                    | 340 | `platform/email/` — kept whole, see below                 |
| `logger.config.ts`                                          |  44 | `platform/logger/`                                        |
| `pg-error-codes.ts`                                         |  16 | `platform/db/`                                            |

**`id.ts` is the one file that must be `kernel/`, not `platform/`.** Domain aggregates
generate their own ids in `static open()` / `static schedule()`, so `generateId` has to
be importable from `domain/`. It imports only `uuidv7` — a library, not a framework — so
it passes the purity ban in §8.

**`events.registry.ts` goes to neither tier.** The 348-line catalogue of 24 event
definitions is not infrastructure; it is every context's published language collected in
one file. It splits into `<ctx>/contract/<ctx>.events.ts` — see
[05-integration.md §4](05-integration.md). Only the `defineEvent` machinery is platform.

### `email/` stays whole — a deliberate exception

`renderTemplate` in `email.templates.ts` is a `switch` over a three-arm discriminated
union, one arm per consuming context (`magic-link` and `verify-email` → identity,
`network-invite` → network). Purist DDD says each context should own its template and
register it, inverting the switch — the `AttachmentPermissionResolver` pattern.

**Don't.** That is roughly 40 lines of registry machinery to relocate 51 lines of HTML
strings. `platform/email/` is a fine home for all of it.

_The trigger to revisit:_ when a context needs to add a template without editing
`platform/`. Invert it then, not now. This is `YAGNI` applied honestly — the same
reasoning that makes the `attention` source columns worth changing makes this one not.

### What dissolving it costs

| File                                               | Change                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| `apps/api/tsconfig.json`                           | drop the `@/shared/*` path and the `include` entry                              |
| `apps/api/jest.config.ts`                          | drop `^@/shared/(.*)$` from `moduleNameMapper` (both projects)                  |
| `apps/api/package.json`                            | drop `@asksynk/shared`; add `nodemailer`, `pg-boss`, `zod`, `@types/nodemailer` |
| `eslint.config.js`                                 | drop `./packages/shared/tsconfig.json` from `parserOptions.project`             |
| `pnpm-workspace.yaml`                              | the `packages/*` glob becomes empty — keep it for future packages, or remove it |
| 76 imports in `apps/api/src`, 4 in `apps/api/test` | `@/shared/x` → `@/api/platform/x`, or `@/api/kernel/id`                         |

**The one genuine loss, stated plainly.** Today `packages/shared/tsconfig.json` has no
`@/api/*` path, so shared _cannot_ import a bounded context — a directional guarantee
the compiler enforces, and one that currently holds (zero `@/api` imports from shared).
After the merge, `platform/ → context` is prevented only by lint.

Two things make that acceptable: the `platform-imports-no-context` rule in
[08-roadmap.md](08-roadmap.md) states exactly that constraint, and the guarantee was
already weaker than it looked — `apps/api/tsconfig.json` compiles shared's sources into
the same program, so this was never real isolation.

---

## 2. The folder template

```
apps/api/src/<context>/
  <context>.module.ts              # composition root — the only file with wiring

  contract/                        # the public API. other contexts import ONLY this.
    <context>.facade.ts            # abstract class: callable surface + DI token
    <context>.events.ts            # domain events this context publishes
    <name>.public.ts               # public value types, DECLARED here

  domain/
    <aggregate>.ts                 # entity/aggregate with invariants
    <name>.vo.ts                   # value objects
    <name>.policy.ts               # pure functions — the interesting part
    errors.ts                      # context-specific domain errors
    ports/
      <name>.repository.ts         # abstract class = contract AND DI token
      <name>.port.ts               # other outbound needs

  application/
    <verb>-<noun>.usecase.ts       # one use case per file; @Transactional lives here
    <context>.facade.impl.ts       # implements contract/<context>.facade.ts
    read/<name>.query.ts           # read models — separate from the write side

  infrastructure/
    persistence/
      drizzle-<name>.repository.ts # implements domain/ports/<name>.repository.ts
      <name>.mapper.ts             # row <-> aggregate
    acl/
      <external>.adapter.ts        # third-party translation

  presentation/
    rest/    <name>.controller.ts, dto/, responses/, <name>.mapper.ts
    ws/      <name>.broadcaster.ts
    events/  <name>.handler.ts     # @EventHandler classes
    jobs/    <name>.worker.ts      # pg-boss workers and schedulers
```

### On `contract/` and the no-barrel-exports rule

`CLAUDE.md` forbids barrel exports, and a single `<context>.contract.ts` that
re-exports internals would be exactly that. So **`contract/` is a directory of
first-class declarations, not a re-export file.** The facade is _declared_ there; its
implementation lives in `application/`. Public value types are _declared_ there, not
re-exported from `domain/`.

Consumers import the precise file:

```ts
import { TagPolicy } from "@/api/tagging/contract/tag-policy.public";
```

never a barrel. This also gives the boundary lint a precise, greppable allow-target.

---

## 3. Keeping `domain/` framework-free while still using Nest DI

This is the mechanical question that usually kills hexagonal architecture in NestJS.
The answer is one line: **an `abstract class` is a runtime value, so it works as a DI
token with no framework import.**

```ts
// domain/ports/attention-items.repository.ts
// Zero imports from @nestjs/*, drizzle, or anything else.
import { AttentionItem } from "@/api/attention/domain/attention-item";
import { AttentionSource } from "@/api/attention/domain/attention-source.vo";

export abstract class AttentionItemsRepository {
  abstract findBySource(source: AttentionSource): Promise<AttentionItem[]>;
  abstract findById(id: string): Promise<AttentionItem | null>;
  abstract save(item: AttentionItem): Promise<void>;
}
```

```ts
// infrastructure/persistence/drizzle-attention-items.repository.ts
@Injectable()
export class DrizzleAttentionItemsRepository extends AttentionItemsRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {
    super();
  }

  async findBySource(source: AttentionSource): Promise<AttentionItem[]> {
    /* ... */
  }
  async findById(id: string): Promise<AttentionItem | null> {
    /* ... */
  }
  async save(item: AttentionItem): Promise<void> {
    /* ... */
  }
}
```

```ts
// attention.module.ts — the only place that knows both sides exist
@Module({
  providers: [
    {
      provide: AttentionItemsRepository,
      useClass: DrizzleAttentionItemsRepository,
    },
  ],
})
export class AttentionModule {}
```

```ts
// application/resolve-attention-item.usecase.ts — injects the ABSTRACT type
@Injectable()
export class ResolveAttentionItemUseCase {
  constructor(private readonly repo: AttentionItemsRepository) {}
}
```

No `@Inject()`, no `Symbol` token, no string constant. TypeScript's
`emitDecoratorMetadata` emits the abstract class as the design-time type, and Nest
resolves it.

**This is not a new pattern for this codebase.** `packages/shared` already does it —
`abstract class EventsPublisher` / `EventsPublisherImpl`, and
`abstract class ScheduledJobService` / `PgBossScheduledJobService`. → [ADR 0002](adr/0002-repository-ports-as-abstract-classes.md)

### Why abstract classes rather than `interface` + `Symbol`

An `interface` disappears at compile time, so it cannot be a DI token — you would need
`@Inject(ATTENTION_REPO)` at every injection site plus a separate token constant.
Abstract classes cost one `extends` and one `super()` and remove all of that
ceremony. The trade is a nominal-typing constraint on implementations, which is fine
because implementations are ours.

---

## 4. Where each layer's concerns actually go

### `domain/` — pure

```ts
// domain/due-date.policy.ts
// No DI. No I/O. No Date.now(). Fully deterministic — `base` is passed in.
import { TagPolicy } from "@/api/tagging/contract/tag-policy.public";

export type OccurrenceMap = ReadonlyMap<
  string,
  { date: Date; eventId: string }
>;
export type DerivedDueDate = {
  dueDate: Date | null;
  sourceCalendarEventId: string | null;
};

export function deriveDueDate(
  tags: readonly TagPolicy[],
  base: Date,
  occurrences: OccurrenceMap,
): DerivedDueDate {
  let dueDate: Date | null = null;
  let sourceCalendarEventId: string | null = null;

  for (const tag of tags) {
    if (tag.answerMode.type === "immediately") {
      const candidate = new Date(
        base.getTime() + tag.answerMode.responseTimeMillis,
      );
      if (!dueDate || candidate < dueDate) {
        dueDate = candidate;
        sourceCalendarEventId = null;
      }
    } else {
      const occurrence = occurrences.get(tag.id);
      if (occurrence && (!dueDate || occurrence.date < dueDate)) {
        dueDate = occurrence.date;
        sourceCalendarEventId = occurrence.eventId;
      }
    }
  }
  return { dueDate, sourceCalendarEventId };
}
```

This is the same algorithm as
[`attention-due-date.service.ts:75`](../../apps/api/src/attention-items/attention-due-date.service.ts)
today, lifted out of a private method on a DI class. It is now a function anyone can
call and anyone can test:

```ts
// domain/due-date.policy.spec.ts — no Nest, no Postgres, milliseconds
it("prefers the earliest candidate across mixed tag modes", () => {
  const base = new Date("2026-01-01T09:00:00Z");
  const result = deriveDueDate(
    [
      {
        id: "t1",
        answerMode: { type: "immediately", responseTimeMillis: 3_600_000 },
      },
      { id: "t2", answerMode: { type: "timeblock" } },
    ],
    base,
    new Map([
      ["t2", { date: new Date("2026-01-01T09:30:00Z"), eventId: "e1" }],
    ]),
  );
  expect(result.dueDate).toEqual(new Date("2026-01-01T09:30:00Z"));
  expect(result.sourceCalendarEventId).toBe("e1");
});
```

**Clock rule:** the domain never calls `new Date()`. Time is an argument. The existing
`Clock` and `SystemClock` both move to `platform/clock/`, and `Clock` is injected in the
**application** layer, which passes `now` down as a plain `Date`. This is what makes the
policies deterministic — and why the domain never needs the `Clock` port itself (§1a).

### `application/` — orchestration

The use case is where `@Transactional()` lives, where ports are called, and where
domain events are published. It contains **no business rules** — it directs the
aggregate.

```ts
// application/resolve-attention-item.usecase.ts
@Injectable()
export class ResolveAttentionItemUseCase {
  constructor(
    private readonly repo: AttentionItemsRepository,
    private readonly events: EventsPublisher,
    private readonly clock: Clock,
  ) {}

  @Transactional()
  async execute(cmd: {
    itemId: string;
    actor: UserId;
    status: AttentionStatus;
  }): Promise<AttentionItem> {
    const item = await this.repo.findById(cmd.itemId);
    if (!item || item.isDeleted || !item.belongsTo(cmd.actor)) {
      throw new AttentionItemNotFound(cmd.itemId);
    }

    // the RULE lives in the aggregate, not here
    const changed = item.transitionTo(cmd.status, this.clock.now());

    await this.repo.save(item);
    for (const event of changed)
      await this.events.publish(event.def, event.payload);
    return item;
  }
}
```

Compare with today's [`attention-items.service.ts:64-94`](../../apps/api/src/attention-items/attention-items.service.ts),
where the same method assigns three fields directly and decides inline whether to
publish a reverse-sync event.

### `infrastructure/` — adapters out

Repositories, third-party clients, and ACLs. The repository maps rows to aggregates
and back; it never returns a raw row upward and never leaks a query builder. This is
already true in the current codebase and stays true.

### `presentation/` — adapters in

Four inbound adapter kinds, **all of them thin, all calling the same use cases**:

| Adapter   | Job                                                                     |
| --------- | ----------------------------------------------------------------------- |
| `rest/`   | HTTP: validate DTO → build command → call use case → map response       |
| `ws/`     | Realtime: broadcast on domain events; translate inbound socket commands |
| `events/` | Subscribe to other contexts' domain events → call use case              |
| `jobs/`   | pg-boss workers and schedulers → call use case                          |

**No business logic in any of them.** Three current violations to fix:

- [`task-suggestions.controller.ts:79-102`](../../apps/api/src/tasks/rest/task-suggestions.controller.ts)
  implements "you may not change status and edit payload in the same request" and
  encodes "`tasks` is only meaningful for `kind === 'batch'`" — the latter duplicated
  in the service.
- [`calendar-events.controller.ts`](../../apps/api/src/calendar-events/rest/calendar-events.controller.ts)
  calls `parseIsoWallClockInTimezone` in four places. Wall-clock → instant conversion
  is a calendar-domain invariant, not a transport concern — and the same function is
  called again inside `calendar-sync.service.ts`, so the rule already has two homes.
- [`threads.controller.ts`](../../apps/api/src/messaging/rest/threads.controller.ts)
  stitches messaging + storage after every list call. That is read-model assembly; it
  moves to `application/read/`.

---

## 5. Fixing `ws.gateway.ts` — one file doing three jobs

[`ws.gateway.ts`](../../apps/api/src/websockets/ws.gateway.ts) is 555 lines and is
simultaneously:

1. **transport** — connection, auth, room membership;
2. **an inbound command surface** — 5 `@SubscribeMessage` handlers, one of which
   (`message.send`) is 128 lines duplicating the REST path;
3. **an event-consumer surface** — 7 realtime `@EventHandler`s spanning messaging,
   timers, attention and tasks.

Job 1 stays in a `websockets/` transport module. Jobs 2 and 3 move into the contexts
they belong to.

**The transport exposes one narrow port:**

```ts
// platform/realtime/realtime-broadcaster.ts
export abstract class RealtimeBroadcaster {
  abstract toUser(userId: string, event: string, payload: unknown): void;
  abstract toGuest(guestId: string, event: string, payload: unknown): void;
  abstract toThread(threadId: string, event: string, payload: unknown): void;
}
```

**Each context owns its own broadcaster:**

```ts
// attention/presentation/ws/attention.broadcaster.ts
@Injectable()
export class AttentionBroadcaster {
  constructor(private readonly rt: RealtimeBroadcaster) {}

  @EventHandler(AttentionItemUpserted)
  onUpserted({ item }: AttentionItemUpsertedPayload): void {
    this.rt.toUser(item.userId, "attention.upserted", item);
  }

  @EventHandler(AttentionItemRemoved)
  onRemoved({ id, userId }: AttentionItemRemovedPayload): void {
    this.rt.toUser(userId, "attention.removed", { id });
  }
}
```

**Inbound commands collapse to a call:**

```ts
// conversations/presentation/ws/message-commands.gateway.ts
@SubscribeMessage("message.send")
async onSendMessage(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
  const cmd = toSendMessageCommand(body, socket.data.actor);   // same command REST builds
  const message = await this.sendMessage.execute(cmd);          // same use case REST calls
  return { ok: true, id: message.id };
}
```

The 128-line duplicate disappears. REST and WebSocket become two adapters over one
use case, which is the whole point of the layering.

**One real constraint to preserve.** The gateway currently calls
`attachmentsService.resolveMany()` at emit time, because the persisted outbox payload
carries only attachment ids and signed URLs expire. That is correct and must stay —
it moves into `conversations/presentation/ws/message.broadcaster.ts` and calls the
`files` facade rather than the service directly.

---

## 6. Where to be rich, and where not to

The `YAGNI` rule in `CLAUDE.md` applies. A rich aggregate is worth its ceremony only
when there is an invariant that would otherwise be enforced in several places, or
forgotten in one.

### Rich — real state machines

| Aggregate             | Methods                                                         | Replaces                                                 |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| `Timer`               | `start`, `pause`, `resume`, `stop`, `complete`                  | `timers.service.ts:163-274`, string-compare guards       |
| `TaskSuggestion`      | `accept`, `reject`, `rescind`, `editPayload`                    | `task-suggestions.service.ts:258-284` `requirePending()` |
| `Invite`              | `accept`, `reject`                                              | `networks.service.ts:106,140`                            |
| `AttentionItem`       | `transitionTo`, `pinDueDate`, `retag`, `projectFrom`            | direct field assignment in the service                   |
| `Task` / `TaskBatch`  | `changeStatus`; `TaskBatch.deriveStatus(tasks)`                 | `task-status.util.ts`                                    |
| `CalendarEvent`       | `reschedule`, `addException`, `splitSeriesAt`, `detachInstance` | scattered service logic + `applyFields` mutation         |
| `CalendarIntegration` | `markError`, `revoke`, `withRefreshedCredentials`               | status enum mutated externally                           |

Example of what that buys:

```ts
// focus/domain/timer.ts
export class Timer {
  private constructor(private props: TimerProps) {}

  static idle(userId: UserId): Timer {
    return new Timer({ userId, status: "idle", sessionType: null /* ... */ });
  }

  pause(now: Date): TimerEvent[] {
    if (this.props.status !== "running") {
      throw new TimerNotRunning(this.props.status); // typed, not a string compare
    }
    this.props.status = "paused";
    this.props.remainingAtTransition = this.remainingSecondsAt(now);
    this.props.transitionedAt = now;
    return [
      { def: TimerLifecycle, payload: { eventType: "paused" /* ... */ } },
    ];
  }
}
```

The state machine is now in one place, exhaustively testable, and impossible to bypass.

### Not rich — leave as typed records

`UserSettings`, `UserProfile`, `Attachment`, `Calendar`, `PublicView`, `Thread`,
`NetworkConnection`, `CalendarEventLink`, `PublicViewGuest`.

None has an invariant worth protecting. Adding a private constructor and accessors to
`UserSettings` is pure ceremony.

### Value objects — only where a rule attaches

Three earn their keep:

- **`AnswerMode`** (tagging) — the core policy. `immediately | timeblock`, with the
  validation that `responseTimeMillis > 0`.
- **`RecurrenceRule`** (scheduling) — `validateAndNormalizeRrule` currently lives in
  `recurrence.utils.ts:162-201` and rejects `COUNT=`, requires `UNTIL` and `TZID=`,
  and caps `UNTIL`. Those are constructor invariants.
- **`AttentionSource`** (attention) — `{ channel, sourceId }`, replacing the untyped
  `metadata` probe. See [07-attention-core.md](07-attention-core.md).

Everything else stays a primitive. `Sairyss/domain-driven-hexagon` notes that in
TypeScript a VO per primitive adds real boilerplate and runtime cost for little gain
on smaller projects; that applies here.

---

## 7. Errors

`AsksynkError` currently carries HTTP status codes via a `statusCode` getter, which
makes the "domain" error type HTTP-aware by construction.

Split it:

```ts
// kernel/errors/domain-error.ts — no HTTP
export abstract class DomainError extends Error {
  abstract readonly code: string;
}
export class NotFoundError extends DomainError {
  readonly code = "not_found"; /* ... */
}
export class RuleViolation extends DomainError {
  readonly code = "rule_violation"; /* ... */
}
```

Contexts subclass with meaningful names — `TimerNotRunning`, `SuggestionNotPending`,
`ThreadFrozen`, `AttentionItemNotFound`. The status mapping moves to
`platform/errors/http-status.ts`, and the existing `AllExceptionsFilter` — itself
moving to `platform/errors/` — applies it at the edge, where that translation belongs.

This is the concrete reason `AsksynkError` splits across the two shared tiers: the
error _type_ is domain vocabulary (`kernel/`), the _status code_ is transport
(`platform/`).

The one genuinely leaky file is
[`attachments.service.ts`](../../apps/api/src/storage/attachments/services/attachments.service.ts):
**11 of the 17 Nest HTTP exceptions in the whole codebase live there.** The other 6
are at the auth boundary, where they are fine.

---

## 8. Enforcement

Nothing above survives without lint. `eslint-plugin-boundaries`, added in Wave 3:

```js
// eslint.config.js (additions)
settings: {
  "boundaries/elements": [
    { type: "kernel",         pattern: "apps/api/"@/api/kernel/**" },
    { type: "platform",       pattern: "apps/api/src/platform/**" },
    { type: "contract",       pattern: "apps/api/src/*/contract/**",       capture: ["context"] },
    { type: "domain",         pattern: "apps/api/src/*/domain/**",         capture: ["context"] },
    { type: "application",    pattern: "apps/api/src/*/application/**",    capture: ["context"] },
    { type: "infrastructure", pattern: "apps/api/src/*/infrastructure/**", capture: ["context"] },
    { type: "presentation",   pattern: "apps/api/src/*/presentation/**",   capture: ["context"] },
  ],
},
rules: {
  "boundaries/element-types": ["error", {
    default: "disallow",
    rules: [
      { from: "kernel",   allow: ["kernel"] },                       // kernel imports NOTHING else
      { from: "platform", allow: ["kernel", "platform"] },           // platform may use kernel, never a context
      { from: "contract", allow: ["kernel", "contract"] },
      { from: "domain",   allow: ["kernel", ["domain", { context: "${from.context}" }]] },
                                                                     // ^ note: no "platform"
      { from: "application", allow: [
        "kernel", "platform", "contract",
        ["domain",      { context: "${from.context}" }],
        ["application", { context: "${from.context}" }],
      ]},
      { from: "infrastructure", allow: [
        "kernel", "platform", "contract",
        ["domain",      { context: "${from.context}" }],
        ["application", { context: "${from.context}" }],
      ]},
      { from: "presentation", allow: [
        "kernel", "platform", "contract",
        ["domain",      { context: "${from.context}" }],
        ["application", { context: "${from.context}" }],
      ]},
    ],
  }],

  // the domain stays framework-free — kernel is held to the same bar,
  // which is exactly what stops it drifting back into a `common/` dumping ground
  "boundaries/external": ["error", {
    default: "allow",
    rules: [{
      from: ["domain", "contract", "kernel"],
      disallow: ["@nestjs/*", "drizzle-orm", "drizzle-orm/*", "class-validator",
                 "class-transformer", "socket.io", "pg-boss", "@nestjs-cls/*"],
    }],
  }],
},
```

The two rules that carry the weight: **`domain` does not list `platform`**, and
**`kernel` is subject to the same external-import ban as `domain`**. Together they
make it impossible for a framework import to reach `domain/` by any path.

> **Pin this to the installed version.** `eslint-plugin-boundaries` v7 reworked parts
> of the options object — the docs show both `rules` and `policies` as the key for
> `boundaries/external`, and v7 adds entity selectors (`from: { element: { type } }`)
> alongside the legacy shorthand. Check `node_modules/eslint-plugin-boundaries` after
> installing and adjust before committing.

Roll out per context: add the context's folders, set the rule to `warn`, clean it,
then promote to `error`. `dependency-cruiser` is a viable alternative if more
expressive rules are needed later; it is not needed for this ruleset.

**Also required, and it is one line** — split the jest config so unit tests run:

```ts
// apps/api/jest.unit.config.ts   (no globalSetup — no Postgres)
testMatch: ["**/*.spec.ts"],
```

leaving `jest.config.ts` as the integration runner.

---

Next: [05-integration.md](05-integration.md) — how contexts talk, and what happens to
every current violation.
