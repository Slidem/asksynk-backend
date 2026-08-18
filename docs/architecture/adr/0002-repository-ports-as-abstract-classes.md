# ADR 0002 — Repository ports are abstract classes

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Mihai Alexandru

---

## Context

`apps/api` has 21 concrete `@Injectable()` Drizzle repositories, injected by concrete
type:

```ts
constructor(private readonly tasksRepository: TasksRepository) {}   // the Drizzle class
```

A search for `abstract class` or `interface .*Repository` across `apps/api/src` returns
nothing for repositories. The dependency arrow points from the application code
_outward_ to the adapter, which is the inverse of what ports-and-adapters requires.

Two consequences:

1. There is no seam to substitute a fake, so no service can be unit tested. Combined
   with `testMatch: ["**/*.integration.test.ts"]`, every business rule in the system
   requires a live Postgres to test.
2. Nothing prevents another context from importing the concrete class — which is
   exactly what happens 16 times.

`packages/shared` already solves this correctly, twice:
`abstract class EventsPublisher` / `EventsPublisherImpl`, and
`abstract class ScheduledJobService` / `PgBossScheduledJobService`. The pattern is
understood; it was simply never applied to persistence.

## Options considered

### A. `interface` + `Symbol` DI token

```ts
export interface TasksRepository { /* ... */ }
export const TASKS_REPOSITORY = Symbol("TasksRepository");

constructor(@Inject(TASKS_REPOSITORY) private readonly repo: TasksRepository) {}
```

**For:** interfaces are structural, so any object of the right shape satisfies them —
a plain object literal works as a test double. Zero runtime footprint.

**Against:** an interface vanishes at compile time, so it cannot be a DI token. Every
injection site needs `@Inject(TOKEN)` plus a separately maintained token constant.
Across 21 repositories and 100+ injection sites, that is a lot of ceremony, and a
forgotten `@Inject()` fails at runtime rather than at compile time.

### B. `abstract class` as both contract and token _(chosen)_

```ts
export abstract class TasksRepository {
  abstract findById(id: string): Promise<Task | null>;
}

constructor(private readonly repo: TasksRepository) {}   // no @Inject needed
```

**For:** an abstract class is a runtime value, so `emitDecoratorMetadata` records it
as the design-time type and Nest resolves it with no decorator. One declaration serves
as contract, type annotation and token. Binds cleanly with `useClass`, `useExisting`
and `useValue`. **And it matches the existing precedent in `packages/shared`.**

**Against:** it emits a small runtime class. It is nominally typed, so a test double
must `extends` it rather than merely match its shape. Someone could put an
implementation on it.

### C. Leave it as-is

Rejected. It blocks unit testing, which blocks safely doing anything else in this
plan.

---

## Decision

**Option B.** Ports are `abstract class`, declared in
`<context>/domain/ports/` (private) or `<context>/contract/` (published), with
`abstract` members only.

```ts
// domain/ports/attention-items.repository.ts — zero framework imports
export abstract class AttentionItemsRepository {
  abstract findBySource(source: AttentionSource): Promise<AttentionItem[]>;
  abstract findById(id: string): Promise<AttentionItem | null>;
  abstract save(item: AttentionItem): Promise<void>;
}

// infrastructure/persistence/drizzle-attention-items.repository.ts
@Injectable()
export class DrizzleAttentionItemsRepository extends AttentionItemsRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {
    super();
  }
  /* ... */
}

// attention.module.ts — the only file that knows both sides exist
providers: [
  {
    provide: AttentionItemsRepository,
    useClass: DrizzleAttentionItemsRepository,
  },
];
```

**Consistency with the existing `EventsPublisher` precedent is the deciding factor.**
Introducing a second, different port convention in the same codebase would be worse
than either convention chosen consistently.

### Rules

1. Ports declare **`abstract` members only.** Never put an implementation on one.
2. Adapters `extends` the port and are named `Drizzle<X>Repository`,
   `Google<X>Provider`, and so on.
3. **Only `<context>.module.ts` imports an adapter.** Everything else depends on the
   port.
4. Ports live in `domain/ports/` and import nothing but their own `domain/` and
   `kernel/`.
5. **Repositories return aggregates. Queries return views.** They are separate ports
   in separate files — `ports/<x>.repository.ts` and `ports/<x>.query.ts`.
6. Prefer `useExisting` over writing an adapter class when a published contract
   already matches a port's shape.

---

## Consequences

### Positive

- Services become unit-testable with a plain `new`, no Nest container, no Postgres:

  ```ts
  class FakeTasksRepository extends TasksRepository {
    readonly rows = new Map<string, Task>();
    async findById(id: string) {
      return this.rows.get(id) ?? null;
    }
    async save(t: Task) {
      this.rows.set(t.id, t);
    }
  }

  const service = new UpdateTaskUseCase(
    new FakeTasksRepository(),
    new RecordingPublisher(),
  );
  ```

- The `domain/` layer stops depending on Drizzle, transitively.
- Combined with the rule _"a module's `exports` may contain only `contract/`
  classes"_, cross-context repository imports become structurally impossible.
- Swapping an implementation (a cache, a read replica, a different store for one
  table) becomes a module-wiring change.

### Negative

- Every repository gains a second file and a `super()` call.
- Test doubles must `extends` the port, so adding a method to a port breaks every fake
  until implemented. This is usually a feature — it surfaces the tests that need
  updating.
- A marginal runtime cost: 21 extra class objects. Irrelevant.

### Migration

Mechanical and safe. Per repository:

1. Add `abstract class <X>Repository` in `domain/ports/` with the existing public
   signatures.
2. Rename the concrete class to `Drizzle<X>Repository` and `extends` the port.
3. Change the module provider to `{ provide, useClass }`.
4. Nothing else changes — injection sites already name the type.

Sequenced in Wave 2 of the roadmap, smallest contexts first.

---

## References

- `packages/shared/src/event-publisher/events-publisher.ts` — the in-repo precedent
- [NestJS — Custom providers](https://docs.nestjs.com/fundamentals/custom-providers)
- [NestJS DI with abstract classes](https://dev.to/ef/nestjs-dependency-injection-with-abstract-classes-4g65)
- [Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon)
