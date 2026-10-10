# Errors (as built)

One data-driven error class plus per-context catalogs. The error knows nothing about
HTTP; the status is decided at the edge.

## Pieces

| Piece                                  | Where                                  | What                                                                                                                         |
| -------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `DomainError`, `DomainErrorCategory`   | `kernel/errors/domain-errors.ts`       | `new DomainError(code, message?, options?)`. Categories: `NOT_FOUND`, `INVALID_VALUE`, `FORBIDDEN`, `CONFLICT`, `RULE_VIOLATION`, `INTERNAL` |
| `defineCatalog(namespace, defs)`       | `kernel/errors/error-catalog.ts`       | defs `{ category, message, exposable }` → `{ catalog, createError(key, params?, options?) }`. Code = `namespace.key`; message is a template with `{ param }` |
| `core` catalog                         | `kernel/errors/kernel.errors.ts`       | `invalidValueError(message)` — generic validation from pure code                                                            |
| `<ctx>.errors.ts`                      | each context                           | e.g. `throw tagsError("tag_not_found", { tagId })`                                                                           |
| `ERROR_CATALOGUES`                     | `src/error-catalogs.root.ts`           | composition root: every catalog, passed to `ErrorsModule.forRoot` in `app.module.ts`                                         |
| `ErrorsModule.forRoot(catalogs)`       | `platform/errors/errors.module.ts`     | `@Global`; provides `DomainErrorsTranslator`, registers `AllExceptionsFilter` as `APP_FILTER`                                |
| `DomainErrorsTranslator`               | `platform/errors/errors.translator.ts` | code → definition map; **throws at boot on duplicate namespace/code**; `translate(err)` → `{ category, statusCode, message }` |
| `AllExceptionsFilter`                  | `platform/errors/errors.filter.ts`     | `DomainError` → `{ statusCode, error: code, message }`; `HttpException` → as-is; else 500 `internal`                        |
| `ApiErrorDto`, `@ApiStandardErrors()`  | `platform/errors/swagger.decorator.ts` | Swagger docs for 400/401/403/404/409/422/500                                                                                 |

Status map: `INVALID_VALUE` 400, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409,
`RULE_VIOLATION` 422, `INTERNAL` 500. **Fails closed:** an unregistered code → 500;
the message goes to the client only if the definition is `exposable`, otherwise
`"A domain error occurred"`.

WebSockets: the HTTP filter doesn't apply. `ws.gateway.ts` injects the translator and
acks `{ ok: false, error: translate(e).message }` for a `DomainError`,
`"internal_error"` otherwise.

`platform/` receives the catalogs; it never imports them, so it depends only on
`kernel/`.

## Catalogs

12 namespaces: `core`, `attention-items`, `calendar-events`, `calendar-integrations`,
`dead_letters` (in `platform/events/dead-letters/`), `messaging`, `networks`,
`public-views`, `tags`, `tasks`, `timers`, `user-profile`. None yet for `auth`,
`storage`, `user-settings`, `websockets`.

## Rules

- Throw only from your own context's catalog. Register a new catalog in
  `src/error-catalogs.root.ts`.
- A caller of another context's port lets its `DomainError` propagate — the code is
  already namespaced and registered.
- Mark a definition `exposable: true` only if its message is safe for clients.
- No Nest `HttpException` outside transport code. Remaining: 11 in
  `storage/attachments/services/attachments.service.ts` (Wave 8.5); the rest (auth
  guard/decorators, param validators) are transport and fine.
- Unique-violation (`23505`, `platform/db/pg-error-codes.ts`) must be mapped to a
  `CONFLICT` code by the repository/service that can hit it — tags currently doesn't.
