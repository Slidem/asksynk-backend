# 04 — Layering

Every context has the same four layers and the same dependency rule. The rule is
enforced by lint, not by discipline.

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

| Layer             | May import                                                                    |
| ----------------- | ----------------------------------------------------------------------------- |
| `domain/`         | `kernel/` only                                                                |
| `application/`    | own `domain/`, own `application/`, `kernel/`, **other contexts' `contract/`** |
| `infrastructure/` | own `domain/`, own `application/`, `kernel/`, Drizzle, SDKs                   |
| `presentation/`   | own `application/`, own `domain/` (types), `kernel/`                          |
| `contract/`       | `kernel/` only                                                                |
| `kernel/`         | **nothing from any context**                                                  |

**No context ever imports another context's `domain/`, `application/`,
`infrastructure/` or `presentation/`. Only `contract/`.**

Two corollaries worth spelling out:

- `domain/` imports no `@nestjs/*`, no `drizzle-orm`, no `class-validator`, no
  `socket.io`, no `pg-boss`. It is plain TypeScript that would run in a browser.
- `presentation/` never talks to `infrastructure/` directly. A controller does not
  touch a repository — which is already true today and must stay true.

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
`common/clock/` module becomes `kernel/clock` and is injected in the application
layer, which passes `now` down. This is what makes the policies deterministic.

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
// kernel/realtime/realtime-broadcaster.ts
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
`ThreadFrozen`, `AttentionItemNotFound`. The existing `AllExceptionsFilter` maps
`DomainError` → HTTP at the edge, where that translation belongs.

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
    { type: "kernel",         pattern: "apps/api/src/kernel/**" },
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
      { from: "kernel",   allow: ["kernel"] },
      { from: "contract", allow: ["kernel", "contract"] },
      { from: "domain",   allow: ["kernel", ["domain", { context: "${from.context}" }]] },
      { from: "application", allow: [
        "kernel", "contract",
        ["domain",      { context: "${from.context}" }],
        ["application", { context: "${from.context}" }],
      ]},
      { from: "infrastructure", allow: [
        "kernel", "contract",
        ["domain",      { context: "${from.context}" }],
        ["application", { context: "${from.context}" }],
      ]},
      { from: "presentation", allow: [
        "kernel", "contract",
        ["domain",      { context: "${from.context}" }],
        ["application", { context: "${from.context}" }],
      ]},
    ],
  }],

  // the domain stays framework-free
  "boundaries/external": ["error", {
    default: "allow",
    rules: [{
      from: ["domain", "contract"],
      disallow: ["@nestjs/*", "drizzle-orm", "drizzle-orm/*", "class-validator",
                 "class-transformer", "socket.io", "pg-boss", "@nestjs-cls/*"],
    }],
  }],
},
```

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
