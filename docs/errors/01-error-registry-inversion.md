# 01 — Error registry inversion (roadmap 0.3e)

**Status:** done (2026-10-08). **Behaviour:** unchanged. Same responses, same status
codes, same fail-closed rule.

Fixed the one violation of [ADR 0005](../architecture/adr/0005-kernel-and-platform-tiers.md)
left after Wave 0.3b: `platform/` depended on every bounded context through the error
registry.

---

## 1. The problem (before)

`platform/` is shared infrastructure. Its rule (ADR 0005, `platform-imports-no-context`
in [08 §Guardrails](../architecture/08-roadmap.md#guardrails)): it may import `kernel/`
and `platform/`, **never a context**.

The import chain was:

```
platform/errors/errors.filter.ts
  └─ import { resolveDomainError } from "@/api/errors/resolve-domain-error"
       errors/resolve-domain-error.ts
         └─ import { ERROR_REGISTRY } from "@/api/errors/error-registry.root"
              errors/error-registry.root.ts
                └─ every context's <ctx>.errors.ts
```

`AllExceptionsFilter` could not be compiled, loaded or unit-tested without every context.
The root cause was that **`resolveDomainError` fetched the registry itself** through a
module-level import, so whoever imported the resolver inherited every context.

Two smaller problems were on the same path:

- `kernel/errors/error-registry.ts` (`buildErrorRegistry`) failed ADR 0005's placement
  test 2: no domain code builds a registry, only the composition root does.
- `errors/` looked like a bounded context (`apps/api/src/<name>/`) but was a composition
  root, so the boundary rules needed an exemption for it.

Moving the resolver into `platform/` and keeping its `ERROR_REGISTRY` import would only
have moved the violation. The fix was to change **who supplies the data**.

---

## 2. The fix: platform receives the catalogs, it does not fetch them

Dependency inversion at the composition root:

- `platform/` takes `ErrorCatalog[]`, a `kernel/` type, and builds its own lookup map.
  It never names a context.
- The **composition root** (`src/error-catalogs.root.ts`, beside `app.module.ts` and
  `main.ts`) lists every catalog. `app.module.ts` hands that list to platform once, at
  bootstrap, through `ErrorsModule.forRoot()`.

```
                 compile-time imports (arrows)              runtime data

 kernel/errors/           ◀── platform/errors/                      ▲
   DomainError,                DomainErrorsTranslator               │ ERROR_CATALOGUES
   ErrorCatalog,               ErrorsModule.forRoot(catalogs)       │ handed in via
   ErrorCode,                  AllExceptionsFilter                  │ ErrorsModule.forRoot()
   defineCatalog                     ▲                              │
                                     │                              │
 <ctx>/<ctx>.errors.ts ◀─── src/error-catalogs.root.ts ─────────────┘
   (every context)              ERROR_CATALOGUES: ErrorCatalog[]
                                     ▲
                                     │
                             src/app.module.ts
                               imports: [ErrorsModule.forRoot(ERROR_CATALOGUES), …]
```

From `platform/`, compile-time imports now point only at `kernel/`. Knowledge of every
context sits in the composition root, the layer whose job is to know everything.
`app.module.ts` already imports every context module, so this adds no new coupling.

The root file is plain data: a typed array, with no logic. Building the map,
checking for duplicates and mapping category to status all live in one platform class.

---

## 3. What landed

### 3.1 `kernel/errors/error-catalog.ts`

Gains `ErrorCode`, next to `NameSpaceKey` and `ErrorKey`. This is the file that defines
the `namespace.key` format.

```ts
/** Full error code: "namespace.key". */
export type ErrorCode = string;
```

### 3.2 `platform/errors/errors.translator.ts` (new)

`DomainErrorsTranslator` replaces both `buildErrorRegistry` and `resolveDomainError`.

- **Constructor** `(catalogs: ErrorCatalog[])` builds a `ReadonlyMap<ErrorCode, ErrorDefinition>`.
  It throws on a duplicate namespace or a duplicate code.
- **`translate(error: DomainError): TranslatedDomainError`** returns
  `{ category, statusCode, message }`.
  - category → status: `INVALID_VALUE` 400, `FORBIDDEN` 403, `NOT_FOUND` 404,
    `CONFLICT` 409, `RULE_VIOLATION` 422, `INTERNAL` 500.
  - **Fails closed:** an unregistered code is treated as `INTERNAL` with a generic message.
  - The message is sent only when the catalog marks it `exposable`.

It is not `@Injectable()`. It is provided with `useValue`, and the class itself is the
DI token (the project rule: a class as the token, no `Symbol`).

The name is protocol-neutral on purpose. The HTTP filter and the WebSocket gateway
both call it.

### 3.3 `platform/errors/errors.module.ts` (new)

A `@Global` dynamic module, the same idiom as `ConfigModule.forRoot()` and
`EventsDispatcherModule.forRootAsync()`.

```ts
@Module({})
export class ErrorsModule {
  static forRoot(errorCatalogues: ErrorCatalog[]): DynamicModule {
    return {
      module: ErrorsModule,
      global: true,
      providers: [
        {
          provide: DomainErrorsTranslator,
          useValue: new DomainErrorsTranslator(errorCatalogues),
        },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
      exports: [DomainErrorsTranslator],
    };
  }
}
```

- `global: true` lets `WsGateway` inject the translator without `WebsocketsModule`
  importing anything.
- `APP_FILTER` is registered here. One import wires everything, and the filter cannot
  be installed without its translator.
- The translator is constructed while `AppModule`'s decorator is evaluated. A
  misconfigured catalog (duplicate namespace or code) still stops the app from booting.

### 3.4 `platform/errors/errors.filter.ts`

Injects the translator instead of importing a function:

```ts
constructor(private readonly translator: DomainErrorsTranslator) {}
// …
const { category, statusCode, message } = this.translator.translate(exception);
```

### 3.5 `src/error-catalogs.root.ts` (moved from `errors/error-registry.root.ts`)

```ts
/** Composition root: every context's catalog. Register new catalogs here. */
export const ERROR_CATALOGUES: ErrorCatalog[] = [
  coreErrorsCatalog,
  attentionItemsCatalog,
  // …every context's catalog
];
```

The `errors/` folder is gone. Nothing at `apps/api/src/<name>/` is a non-context
composition root any more, so the boundary rule needs no `errors/` exemption. A
root-level file is naturally exempt, just like `app.module.ts`.

### 3.6 `app.module.ts`

```diff
-  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
+  imports: [ …, ErrorsModule.forRoot(ERROR_CATALOGUES) ],
```

### 3.7 `websockets/ws.gateway.ts`

Injects `DomainErrorsTranslator` and calls
`this.errorTranslator.translate(error).message` at its three ack sites. The gateway is
not `platform/`, so it was never a rule violation. It changed only because the free
function no longer exists.

### 3.8 Tests

- `test/timers/timers.integration.test.ts` and
  `test/events/dead-letters-admin.integration.test.ts` import
  `ErrorsModule.forRoot(ERROR_CATALOGUES)` instead of declaring `APP_FILTER` by hand. They
  use the **full** list, so test status codes match prod; a partial list would turn
  any unlisted code, `core.invalid_value` for example, into a 500.
- `test/platform/errors.translator.unit.test.ts` (new) checks the translator in
  isolation, with no context loaded:
  - category → status for every category
  - exposable vs hidden message
  - fail closed on an unknown code
  - throw on a duplicate namespace

---

## 4. Result

| Before                                             | After                                                         |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `kernel/errors/error-registry.ts` (fails Q2)        | **deleted**; logic folded into `DomainErrorsTranslator`       |
| `errors/resolve-domain-error.ts` imports the root   | **deleted**; `platform/errors/errors.translator.ts`           |
| `errors/error-registry.root.ts`                     | **moved**: `src/error-catalogs.root.ts` exports catalogs, not a map |
| filter imports the root                             | filter injects `DomainErrorsTranslator`                       |
| `app.module.ts` `APP_FILTER` provider               | `ErrorsModule.forRoot(ERROR_CATALOGUES)`                      |
| `ws.gateway.ts` free function, 3 sites              | injected translator, 3 sites                                  |
| 2 integration tests declare `APP_FILTER` by hand    | `ErrorsModule.forRoot(ERROR_CATALOGUES)`                      |

`kernel/errors/` is down to three files: `domain-errors.ts`, `error-catalog.ts` and
`kernel.errors.ts`. All of them pass both placement tests.

---

## 5. Alternatives considered

| Option                                                                                                     | Verdict                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Catalogs in, translator builds the map** (landed)                                                        | Chosen. One platform class instead of three pieces (`ErrorRegistry` type, `buildErrorRegistry`, resolver). The root file is plain data. Duplicate checks still run at boot. The unit test is just `new DomainErrorsTranslator([catalog])`.                         |
| **Registry in**: root calls `buildErrorRegistry`, platform takes a `ReadonlyMap`                            | The first draft. It works, but it adds a public `ErrorRegistry` type and a free function that only one caller needs.                                                                                                                                                         |
| **Move `resolve-domain-error.ts` into `platform/` as-is**                                                  | Rejected. It still imports the root, so the violation would move into `platform/` instead of being removed.                                                                                                                                                                 |
| **`app.useGlobalFilters(new AllExceptionsFilter(…))` in `main.ts`**                                        | Rejected. It covers HTTP only. The gateway still needs the translator, and tests never run `main.ts`, so they would silently lose the filter.                                                                                                                           |
| **Each context registers its own catalog at bootstrap** (`onModuleInit`)                                   | Rejected for now. A context that forgets to register gets no error at boot, only 500s at runtime, and duplicate detection becomes order-dependent. Revisit if catalogs ever need to be added without editing a central list.                                                |
| **Carry `category` / `exposable` on the `DomainError` instance**                                           | Simpler at runtime, since no lookup is needed. But it changes the error model rather than the dependency direction, and it reverses the 04 §7 choice to keep the category in the catalog. A valid follow-up, not part of this fix.                                           |

---

## 6. Verification

```bash
# platform reaches no context
grep -rn '@/api/' apps/api/src/platform/ | grep -vE '@/api/(kernel|platform)/'   # → empty

# nothing left of the old layout
ls apps/api/src/errors 2>&1                                                       # → No such file
grep -rnE 'resolveDomainError|@/api/errors/|ERROR_REGISTRY|buildErrorRegistry' apps/api/src apps/api/test   # → empty
```

Then:

- `pnpm test:unit`, including `errors.translator.unit.test.ts`
- `pnpm test:integration`: `timers` and `dead-letters-admin` exercise the filter's
  DomainError → status path over HTTP
- manually, on a running API:
  - a known domain error over HTTP (e.g. `DELETE /tags/<unknown-uuidv7>` → 404
    `tags.tag_not_found`)
  - a WebSocket `message.send` with a bad thread id → `{ ok: false, error }`
