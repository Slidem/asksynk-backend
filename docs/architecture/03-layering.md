# 03 — Layering

Every context gets the same layers and dependency rule, over two shared tiers
(`kernel/`, `platform/`). Enforced by lint (Wave 3), not discipline.

## 1. The rule

```
  presentation/   rest · ws · events · jobs     inbound adapters
        │
  application/    use cases · facade            orchestration, @Transactional
        │
  domain/         aggregates · policies · ports pure TS, no framework
        ▲ implements
  infrastructure/ drizzle · acl · clients       outbound adapters
```

| Layer             | May import                                                                              |
| ----------------- | --------------------------------------------------------------------------------------- |
| `domain/`         | own `domain/`, `kernel/`                                                                |
| `contract/`       | `kernel/`, other `contract/`, `platform/events/registry` (`defineEvent`) + zod          |
| `application/`    | own `domain/` + `application/`, `kernel/`, `platform/`, **other contexts' `contract/`** |
| `infrastructure/` | own `domain/` + `application/`, `kernel/`, `platform/`, Drizzle, SDKs                   |
| `presentation/`   | own `application/` + `domain/` (types), `kernel/`, `platform/`                          |
| `kernel/`         | nothing outside itself; plain libraries only (`uuidv7`, `lodash`), no framework         |
| `platform/`       | `kernel/`, frameworks — never a context                                                 |

**No context imports another context's `domain/`, `application/`, `infrastructure/`
or `presentation/` — only `contract/`.** `domain/` imports no `@nestjs/*`,
`drizzle-orm`, `class-validator`, `zod`, `socket.io`, `pg-boss`. Controllers never
touch repositories (already true).

## 2. `kernel/` vs `platform/`

|                   | `kernel/`                                                                       | `platform/`                                                                       |
| ----------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Contains          | pure domain vocabulary                                                          | framework-aware shared infra                                                      |
| Imported by       | everything, **including `domain/`**                                             | `application/`, `infrastructure/`, `presentation/` — never `domain/`              |
| Today             | `id.ts`, `time/iso.ts`, `errors/{domain-errors,error-catalog,kernel.errors}.ts` | clock, config, db, decorators, email, errors, events, http, jobs, logger, mappers |
| Planned additions | `actor/` (Wave 1.1)                                                             | `realtime/realtime-broadcaster.ts` (Wave 4.1)                                     |

**Placement test for `kernel/` — both must be yes:** (1) it is pure, transitively;
(2) `domain/` code actually references it. Q2 keeps `kernel/` from becoming the old
`common/`. When in doubt, a thing belongs to a context.

**Ports don't split along this seam.** A port lives with the layer that declares the
need, both halves together:

| Port                                                              | Abstract              | Adapter                             |
| ----------------------------------------------------------------- | --------------------- | ----------------------------------- |
| `TagRepository`, `AttentionItemsRepository`, …                    | `<ctx>/domain/ports/` | `<ctx>/infrastructure/persistence/` |
| published ports (`CalendarOccurrencePort`, …)                     | `<ctx>/contract/`     | owning context's `infrastructure/`  |
| `EventsPublisher`, `JobScheduler`, `Clock`, `RealtimeBroadcaster` | `platform/<area>/`    | `platform/<area>/`                  |

`EventsPublisher` / `JobScheduler` signatures depend on zod/platform types, and only
the application layer calls them — aggregates _return_ what happened, the application
publishes. `Clock` is platform too: time reaches the domain as a plain `now: Date`.

Composition-root files (`app.module.ts`, `main.ts`, `error-catalogs.root.ts`) sit at
`src/` and may import every context.

## 3. Folder template

```
apps/api/src/<context>/
  <context>.module.ts              # the only file with wiring
  <context>.errors.ts              # error catalog (defineCatalog)

  contract/                        # the public API; other contexts import ONLY this
    <name>.port.ts                 # abstract class: callable surface + DI token
    <context>.events.ts            # events this context publishes
    <name>.public.ts               # public value types, declared here (not re-exported)

  domain/
    <aggregate>.ts                 # invariants + transitions
    <name>.vo.ts                   # value objects (only where a rule attaches)
    <name>.policy.ts               # pure functions
    ports/<name>.repository.ts     # abstract class
    ports/<name>.query.ts          # read-side port

  application/
    <verb>-<noun>.usecase.ts       # or one service per aggregate; @Transactional here
    read/<name>.view.ts            # view types

  infrastructure/
    persistence/drizzle-<name>.repository.ts, <name>.query.ts, <name>.mapper.ts
    acl/<external>.adapter.ts

  presentation/
    rest/    controller, dto/, responses/, mapper
    ws/      <name>.broadcaster.ts, <name>.gateway.ts
    events/  <name>.handler.ts, <group>.consumer-group.ts
    jobs/    <name>.job.ts, <name>.job-handler.ts
```

`contract/` is a directory of first-class declarations, not a re-export file —
`CLAUDE.md` forbids barrels. Consumers import the exact file.

## 4. Nest DI with a framework-free domain

An `abstract class` is a runtime value, so it is a DI token with no framework import
([ADR 0002](adr/0002-repository-ports-as-abstract-classes.md)):

```ts
// domain/ports/attention-items.repository.ts — zero framework imports
export abstract class AttentionItemsRepository {
  abstract findById(id: string): Promise<AttentionItem | null>;
  abstract save(item: AttentionItem): Promise<void>;
}

// infrastructure/persistence/drizzle-attention-items.repository.ts
@Injectable()
export class DrizzleAttentionItemsRepository extends AttentionItemsRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {
    super();
  }
}

// attention.module.ts
providers: [
  {
    provide: AttentionItemsRepository,
    useClass: DrizzleAttentionItemsRepository,
  },
];
```

Injection sites name the abstract type; no `@Inject()`, no `Symbol`.

## 5. What goes where

- **domain** — pure, deterministic. Never calls `new Date()`; `now` is an argument.
  Example: `decideDueDate` in [06 §6](06-attention-core.md#6-the-tag--due-date-policy).
- **application** — loads, calls the aggregate, saves, publishes. **No business
  rules.** `@Transactional()` lives here.

  ```ts
  @Transactional()
  async execute(cmd: { itemId: string; actor: Actor; status: AttentionStatus }) {
    const item = await this.repo.findById(cmd.itemId);
    if (!item || !item.belongsTo(ownerUserIdOf(cmd.actor))) throw attentionError("not_found");
    if (item.transitionTo(cmd.status, this.clock.now())) {   // the rule is in the aggregate
      await this.repo.save(item);
      await this.events.publish(AttentionItemUpserted, { item: toResponse(item) });
    }
  }
  ```

- **infrastructure** — maps rows ↔ aggregates; never returns a raw row upward.
- **presentation** — thin: validate → command → use case → map. Current violations:
  `task-suggestions.controller.ts` (status-vs-payload rule, `kind === 'batch'` rule);
  `calendar-events.controller.ts` (wall-clock → instant conversion, also done in
  `calendar-sync.service.ts`); `threads.controller.ts` (stitches messaging + storage
  — read-model assembly).

## 6. `ws.gateway.ts` split (Wave 4)

Transport stays in `websockets/` and implements one port:

```ts
// platform/realtime/realtime-broadcaster.ts
export abstract class RealtimeBroadcaster {
  abstract toUser(userId: string, event: string, payload: unknown): void;
  abstract toGuest(guestId: string, event: string, payload: unknown): void;
  abstract toThread(threadId: string, event: string, payload: unknown): void;
}
```

Each context owns a `presentation/ws/<ctx>.broadcaster.ts` with its realtime
`@EventHandler`s, and its own gateway for inbound commands calling the same use case
as REST. Nest allows several `@WebSocketGateway()`s on one namespace sharing
`socket.data`. Keep: `MessageCreated` resolves attachment URLs at emit time (signed
URLs expire) — via the files contract.

## 7. Rich vs not

Rich only where an invariant would otherwise be enforced in several places:

| Aggregate             | Methods                                                                                | Replaces                      |
| --------------------- | -------------------------------------------------------------------------------------- | ----------------------------- |
| `Timer`               | `start`, `pause`, `resume`, `stop`, `complete`                                         | `timers.service.ts` guards    |
| `TaskSuggestion`      | `accept`, `reject`, `rescind`, `editPayload`                                           | `requirePending()`            |
| `Invite`              | `accept`, `reject`                                                                     | `networks.service.ts` guards  |
| `AttentionItem`       | `transitionTo`, `pinDueDate`, `applyDueDateDecision`, `applyMirror`                    | field assignment in service   |
| `Task` / `TaskBatch`  | `changeStatus`; batch status derived from tasks                                        | `domain/task-batch-status.ts` |
| `CalendarEvent`       | `reschedule`, `addException`, `splitSeriesAt`, `detachInstance`, `applyProviderFields` | service logic + `applyFields` |
| `CalendarIntegration` | `markError`, `revoke`, `withRefreshedCredentials`                                      | status mutated externally     |

Stay typed records: `UserSettings`, `UserProfile`, `Attachment`, `Calendar`,
`PublicView`, `Thread`, `NetworkConnection`, `CalendarEventLink`, `PublicViewGuest`.

Value objects only where a rule attaches: `AnswerMode` (tagging), `RecurrenceRule`
(scheduling — rejects `COUNT=`, requires `UNTIL` + `TZID=`, caps `UNTIL`),
`AttentionSource` (attention).

## 8. Enforcement (Wave 3)

`eslint-plugin-boundaries` for in-editor layer rules; `dependency-cruiser` for
cross-context rules ([07 §Guardrails](07-roadmap.md#guardrails)).

```js
// eslint.config.js (additions) — verify option shape against the installed v7 first
settings: {
  "boundaries/elements": [
    { type: "kernel",         pattern: "apps/api/src/kernel/**" },
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
      { from: "kernel",   allow: ["kernel"] },
      { from: "platform", allow: ["kernel", "platform"] },
      { from: "contract", allow: ["kernel", "platform", "contract"] }, // platform: defineEvent only
      { from: "domain",   allow: ["kernel", ["domain", { context: "${from.context}" }]] }, // no platform
      { from: ["application", "infrastructure", "presentation"], allow: [
        "kernel", "platform", "contract",
        ["domain",      { context: "${from.context}" }],
        ["application", { context: "${from.context}" }],
      ]},
    ],
  }],
  "boundaries/external": ["error", {
    default: "allow",
    rules: [
      { from: ["domain", "kernel"],
        disallow: ["@nestjs/*", "drizzle-orm", "drizzle-orm/*", "class-validator",
                   "class-transformer", "zod", "socket.io", "pg-boss", "@nestjs-cls/*"] },
      { from: ["contract"], // event schemas need zod; nothing else framework-y
        disallow: ["@nestjs/*", "drizzle-orm", "drizzle-orm/*", "class-validator",
                   "class-transformer", "socket.io", "pg-boss", "@nestjs-cls/*"] },
    ],
  }],
},
```

The two rules that carry the weight: `domain` does not list `platform`, and `kernel`
gets the same external ban as `domain`. `contract/` is looser only because
`<ctx>.events.ts` needs `defineEvent` + zod. Roll out per context: `warn` → clean →
`error`.
