# ADR 0002 — Ports are abstract classes

**Status:** Accepted (2026-08-07) · repositories converted in Wave 2

## Context

21 concrete `@Injectable()` Drizzle repositories, injected by concrete type. No seam
for a fake, and nothing stops another context importing the class (16 times today).
`platform/` already uses the port pattern: `EventsPublisher`, `JobScheduler`, `Clock`,
`ObjectStorage`, `EmailProvider`, `CalendarProvider`.

## Options

- **A. `interface` + `Symbol` token.** Structural, zero runtime — but every injection
  site needs `@Inject(TOKEN)`, and a forgotten one fails at runtime.
- **B. `abstract class` as contract + token _(chosen)_.** A runtime value, so
  `emitDecoratorMetadata` makes it the DI token with no decorator. Matches `platform/`.
  Cost: nominal typing (fakes must `extends`), a tiny runtime class.

## Decision

**B.** Rules:

1. Ports declare `abstract` members only.
2. Adapters `extends` the port: `Drizzle<X>Repository`, `Google<X>Provider`, …
3. Only `<context>.module.ts` imports an adapter
   (`{ provide: XRepository, useClass: DrizzleXRepository }`).
4. Repository ports live in `<ctx>/domain/ports/` and import only own `domain/` +
   `kernel/`. Published ports live in `<ctx>/contract/`.
5. Repositories return aggregates; queries return views — separate ports.
6. Prefer `useExisting` when a published port already matches a needed shape.

## Consequences

- **+** Services are unit-testable with `new` and a fake that `extends` the port.
- **+** With "exports only `contract/`", foreign repository imports become impossible.
- **−** One more file and a `super()` per repository; adding a port method breaks every
  fake until implemented (usually what you want).

Migration per repository: add the abstract class with the current signatures, rename
the concrete one to `Drizzle…` and `extends` it, switch the provider to
`{ provide, useClass }`. Injection sites don't change.
