# 03 — Layering

Every context gets the same layers and dependency rule, over two shared tiers
(`kernel/`, `platform/`). Enforced by lint, not discipline.

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
| `domain/`         | own `domain/` + own `contract/` types + own `<ctx>.errors.ts`, `kernel/`                 |
| `contract/`       | `kernel/`, other `contract/`, `platform/` types (`defineEvent`, `RequestHeaders`) + zod |
| `application/`    | own `domain/` + `application/`, `kernel/`, `platform/`, **other contexts' `contract/`** |
| `infrastructure/` | own `domain/` + `application/`, `kernel/`, `platform/`, Drizzle, SDKs                   |
| `presentation/`   | own `application/` + `domain/` (types), `kernel/`, `platform/`, other `contract/`       |
| `kernel/`         | nothing outside itself; plain libraries only (`uuidv7`, `lodash`), no framework         |
| `platform/`       | `kernel/`, frameworks — never a context                                                 |

**No context imports another context's `domain/`, `application/`, `infrastructure/`
or `presentation/` — only `contract/`.** `domain/` imports no `@nestjs/*`,
`drizzle-orm`, `class-validator`, `zod`, `socket.io`, `pg-boss`. Controllers never
touch repositories.

## 2. `kernel/` vs `platform/`

|                   | `kernel/`                                                                       | `platform/`                                                                       |
| ----------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Contains          | pure domain vocabulary                                                          | framework-aware shared infra                                                      |
| Imported by       | everything, **including `domain/`**                                             | `application/`, `infrastructure/`, `presentation/` — never `domain/`              |
| Today             | `id.ts`, `actor/actor.ts`, `time/iso.ts`, `errors/{domain-errors,error-catalog,kernel.errors}.ts` | clock, config, db, decorators, email, errors, events, http (incl. `http/auth/` request decorators + principal types), jobs, logger, mappers, realtime (`RealtimeBroadcaster` port + WS command plumbing) |

**Placement test for `kernel/` — both must be yes:** (1) it is pure, transitively;
(2) `domain/` code actually references it. Q2 keeps `kernel/` from becoming the old
`common/`. When in doubt, a thing belongs to a context.

**Ports don't split along this seam.** A port lives with the layer that declares the
need, both halves together:

| Port                                                              | Abstract              | Adapter                             |
| ----------------------------------------------------------------- | --------------------- | ----------------------------------- |
| `TagRepository`, `AttentionItemsRepository`, …                    | `<ctx>/domain/ports/` | `<ctx>/infrastructure/persistence/` |
| published ports (`CalendarOccurrencePort`, …)                     | `<ctx>/contract/`     | owning context's `infrastructure/`  |
| `EventsPublisher`, `JobScheduler`, `Clock`, `RealtimeBroadcaster` | `platform/<area>/`    | `platform/<area>/` (`RealtimeBroadcaster`: `websockets/ws.gateway.ts` — needs auth) |

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
    read/<name>.view.ts            # view types (+ mapper when it is also an event payload)
    jobs/<name>.job.ts             # defineJob — the application schedules it

  infrastructure/
    persistence/drizzle-<name>.repository.ts, <name>.query.ts, <name>.mapper.ts
    acl/<external>.adapter.ts

  presentation/
    rest/    controller, dto/, responses/, mapper
    ws/      <name>.broadcaster.ts, <name>.gateway.ts
    events/  <name>.handler.ts, <group>.consumer-group.ts
    jobs/    <name>.job-handler.ts
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
  `tasks/presentation/rest/task-suggestions.controller.ts` (status-vs-payload rule, `kind === 'batch'` rule);
  `scheduling/presentation/rest/calendar-events.controller.ts` (wall-clock → instant
  conversion, also done in `scheduling/application/calendar-sync.service.ts`);
  `conversations/presentation/rest/{threads,guest-messaging}.controller.ts`
  (stitch messages + attachment URLs — read-model assembly).

## 6. Realtime (WS)

`websockets/` is transport only and implements one port:

```ts
// platform/realtime/realtime-broadcaster.ts
export type RealtimeTarget =
  | { kind: "user"; id: string }
  | { kind: "guest"; id: string }
  | { kind: "thread"; id: string };

export abstract class RealtimeBroadcaster {
  abstract emit(targets: RealtimeTarget[], event: string, payload: unknown): void;
}
```

- **One `emit(targets[])`**, not `toUser/toGuest/toThread`: socket.io dedupes a socket
  across rooms only within one `.to([...])`, so split calls would double-deliver.
- `WebsocketsModule` is `@Global()` and exports only `RealtimeBroadcaster`
  (`useExisting: WsGateway`) — contexts inject the port without importing the module
  (→ `AuthModule`). `WsGateway` authenticates on connect via `ActorAuthenticator`
  (`auth/contract/`), sets `socket.data.identity`, joins `user:`/`guest:` rooms.
- Each context owns `presentation/ws/<name>.broadcaster.ts` with its realtime
  `@EventHandler`s. `MessageCreated` resolves attachment URLs at emit time (signed URLs
  expire) via `AttachmentCatalogPort`.
- Inbound commands: the context's own `@WebSocketGateway(WS_GATEWAY_OPTIONS)` (several
  gateways share one server and `socket.data`). Each handler is `@WsCommand(event)` =
  `@SubscribeMessage` + payload-only `ValidationPipe` + `WsAckInterceptor`; the actor
  comes from `@WsActor()` (param decorator, not a guard — guard errors bypass
  interceptors). The interceptor maps `DomainError` → translated message, validation →
  first message, `WsException` → its message, else `"internal_error"`, all as
  `{ ok: false, error }`. Shared bits live in `platform/realtime/`.

## 7. Rich vs not

Rich only where an invariant would otherwise be enforced in several places:

| Aggregate             | Methods                                                                                | Replaces                      |
| --------------------- | -------------------------------------------------------------------------------------- | ----------------------------- |
| `Timer`               | `start`, `pause`, `resume`, `stop`, `complete`                                         | done: `focus/domain/timer.ts` |
| `TaskSuggestion`      | `accept`, `reject`, `rescind`, `editPayload`                                           | `requirePending()`            |
| `Invite`              | `accept`, `reject`                                                                     | `network/application/networks.service.ts` guards |
| `AttentionItem`       | `transitionTo`, `pinDueDate`, `applyDueDateDecision`, `applyMirror`                    | field assignment in service   |
| `Task` / `TaskBatch`  | `changeStatus`; batch status derived from tasks                                        | `tasks/domain/task-batch-status.ts` |
| `CalendarEvent`       | `reschedule`, `addException`, `splitSeriesAt`, `detachInstance`, `applyProviderFields` | service logic + `applyFields` |
| `CalendarIntegration` | `markError`, `revoke`, `withRefreshedCredentials`                                      | status mutated externally     |

Stay typed records: `UserSettings`, `UserProfile`, `Attachment`, `Calendar`,
`PublicView`, `Thread`, `NetworkConnection`, `CalendarEventLink`, `PublicViewGuest`.

Value objects only where a rule attaches: `AnswerMode` (tagging), `RecurrenceRule`
(scheduling — rejects `COUNT=`, requires `UNTIL` + `TZID=`, caps `UNTIL`),
`AttentionSource` (attention).

## 8. Enforcement

`eslint-plugin-boundaries` (v7, `eslint.config.js`) for in-editor layer rules;
`dependency-cruiser` (`apps/api/.dependency-cruiser.cjs`) for cross-context rules
([07 §Guardrails](07-roadmap.md#guardrails)). Both run in `pnpm lint`; both `error`.

ESLint:

- **Elements** (v7 patterns match folders only): `kernel`, `platform`, one per layer
  `apps/api/src/*/<layer>` capturing `context`, and `root` (`apps/api/src/*` — the
  context root: `<ctx>.module.ts`, `<ctx>.errors.ts`). File categories `module` /
  `errors` distinguish root files. Composition-root `src/*.ts` is excluded.
- **`boundaries/dependencies`**, `default: "disallow"`, last matching policy wins:
  externals allowed; then the §1 table per layer (plus same-layer imports); `root` may
  import its own everything, other contexts' `contract/` and `*.module.ts`; finally the
  framework bans (`@nestjs/*`, `@nestjs-cls/*`, `drizzle-orm`, `class-validator`,
  `class-transformer`, `zod`, `socket.io`, `pg-boss`) for `domain` and `kernel`, and
  the same minus `zod` for `contract`.
- One exception: auth's application/presentation may import `auth/better-auth*.ts`
  (better-auth `Auth` type + `BETTER_AUTH` token; library boundary).

The two rules that carry the weight: `domain` does not list `platform`, and `kernel`
gets the same external ban as `domain`. `contract/` is looser only because
`<ctx>.events.ts` needs `defineEvent` + zod.
