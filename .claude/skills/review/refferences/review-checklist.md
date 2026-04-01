# Review Checklist — NestJS + Drizzle ORM + PostgreSQL

This is the detailed checklist the review skill uses. Each item explains
**what** to look for and **why** it matters.

---

## Bugs & Logic

- **Missing `await`**: Any async function call (service methods, DB queries,
  external API calls) used without `await` silently returns a Promise instead
  of the value. Check every call to `.query()`, `.insert()`, `.update()`,
  `.delete()`, `.findFirst()`, and service methods.

- **Null/undefined access**: When a DB query can return `null` (e.g.,
  `.findFirst()`), is there a guard before accessing properties? The pattern
  should be: query → check → throw NotFoundException if null.

- **Off-by-one in pagination**: `offset` should be `(page - 1) * limit`,
  not `page * limit`. Total pages should be `Math.ceil(total / limit)`.

- **Race conditions**: Two requests modifying the same resource concurrently.
  Look for read-then-write patterns without transactions or optimistic locking.

- **Boolean logic**: Watch for `||` vs `&&` mixups, especially in guards and
  permission checks. `if (!isAdmin || !isOwner)` vs `if (!isAdmin && !isOwner)`
  are very different.

## Security

- **Raw SQL**: Even with Drizzle, developers sometimes use `.execute()` with
  string interpolation. Grep for `` `...${` `` inside `.execute()` calls.

- **Auth guard coverage**: Every new `@Controller` method should have either
  a class-level `@UseGuards(AuthGuard)` or a method-level guard. Check for
  endpoints that are accidentally public.

- **Sensitive data exposure**: Error messages should not include stack traces,
  DB column names, or internal IDs in production. Check `HttpException`
  messages and log statements.

- **Input validation**: Every `@Body()` parameter should reference a DTO class
  with class-validator decorators. Bare `@Body() body: any` is a red flag.

- **IDOR**: When an endpoint accesses a resource by ID (e.g., `GET /resource/:id`),
  does it verify the requesting user owns or has permission to access it?

## Error Handling

- **Silent catches**: `catch (e) {}` or `catch (e) { console.log(e) }` that
  swallow errors without rethrowing or returning an error response.

- **Generic 500s**: Service methods that throw generic `Error` instead of
  NestJS-specific exceptions (`NotFoundException`, `BadRequestException`, etc.).

- **Transaction rollback**: If a service method uses a transaction, does the
  error path properly rollback? With Drizzle: `db.transaction(async (tx) => { ... })`
  automatically rolls back on throw, but watch for manual transaction management.

- **Promise rejection**: Async functions in event handlers or background jobs
  that don't have `.catch()` — unhandled rejections crash Node.

## Database

- **N+1 queries**: A loop that calls a DB query per iteration. Example:

  ```typescript
  // Bad
  for (const user of users) {
    const posts = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.userId, user.id));
  }
  // Good
  const posts = await db
    .select()
    .from(postsTable)
    .where(inArray(postsTable.userId, userIds));
  ```

- **Missing indexes**: If the diff adds a new `.where(eq(column, value))` or
  `.orderBy(column)`, check if that column has an index. Especially important
  for columns used in pagination or filtering.

- **Schema without migration**: If Drizzle schema files changed, there should
  be a corresponding migration file. `npx drizzle-kit generate` should have
  been run.

- **Missing `.returning()`**: `db.insert().values(data)` returns nothing useful
  by default. If the service method needs the created row (and it usually does),
  it should use `.returning()`.

## Tests

- **Coverage of changed logic**: If the diff modifies a service method's
  behavior, there should be a test that exercises the new path.

- **Unhappy path**: Tests shouldn't only cover the success case. Check for
  tests that verify: invalid input is rejected, missing resources return 404,
  unauthorized access is blocked.

- **Test isolation**: Tests that depend on other tests' side effects (shared
  mutable state, DB rows from a previous test) are fragile. Each test should
  set up its own data.
