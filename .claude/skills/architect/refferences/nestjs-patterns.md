# NestJS Patterns Reference

Conventions and patterns to follow when designing new features in this codebase.

---

## Module Structure

Each feature gets its own NestJS module:

```
src/
├── <feature>/
│   ├── <feature>.module.ts        # Module definition
│   ├── <feature>.controller.ts    # HTTP layer — thin, delegates to service
│   ├── <feature>.service.ts       # Business logic
│   ├── dto/
│   │   ├── create-<feature>.dto.ts
│   │   └── update-<feature>.dto.ts
│   ├── entities/                  # Drizzle schema if feature-specific
│   │   └── <feature>.schema.ts
│   └── <feature>.spec.ts          # Tests co-located with source
```

If a feature needs multiple controllers (e.g., admin vs public), put them
in the same module with different controller files.

## Controller Conventions

- Controllers handle HTTP concerns only: parse input, call service, format output
- No business logic in controllers — if there's an `if` statement about domain
  rules, it belongs in the service
- Use class-validator DTOs for all `@Body()` parameters
- Return proper HTTP status codes: 201 for creation, 204 for deletion with
  no body, 404/409/422 for domain errors
- Apply guards at the class level (`@UseGuards(AuthGuard)`) unless the
  controller mixes public and private endpoints

## Service Conventions

- Services own all business logic and data access
- One public method per use case (avoid god methods that branch on input)
- Use transactions for multi-step writes:
  ```typescript
  await this.db.transaction(async (tx) => {
    // all writes here — auto-rollback on throw
  });
  ```
- Throw NestJS HTTP exceptions (`NotFoundException`, `ConflictException`, etc.)
  for expected error conditions — the exception filter handles translation to
  HTTP responses
- For operations triggered by the current one (sending email, audit log),
  prefer event emitters over direct calls to keep the service focused

## DTO Conventions

- Every field has a class-validator decorator
- Use `@IsOptional()` for optional fields, never `?` alone
- Numeric fields that come from query strings need `@Transform` + `@IsInt()`
- Enum fields use `@IsEnum(MyEnum)`
- Nest DTOs for complex input (`@ValidateNested()` + `@Type()`)
- Extend `PartialType(CreateDto)` for update DTOs when appropriate

## Drizzle ORM Conventions

- Table names: `snake_case` plural (e.g., `events`, `calendar_entries`)
- Column names: `snake_case` in DB, camelCase in TypeScript via Drizzle's naming
- Primary key: UUIDv7 (`text('id').primaryKey().$defaultFn(() => uuidv7())`)
- Timestamps: `created_at` and `updated_at` with `defaultNow()`
- Relations: define in a separate `.relations.ts` file or alongside the schema
- Always use `.returning()` on insert/update when you need the result

## API Path Conventions

- Base: `/api/v1/<resource>`
- Plural nouns for collections: `/api/v1/events`, not `/api/v1/event`
- Nested resources: `/api/v1/calendars/:calendarId/events`
- Actions that don't fit CRUD: `POST /api/v1/events/:id/cancel`
- Pagination: `?page=1&limit=20`, max limit 100
- Filtering: query params matching field names, e.g., `?status=active`

## Error Handling Pattern

```typescript
// In service
const resource = await db.select().from(table).where(eq(table.id, id)).limit(1);
if (!resource[0]) {
  throw new NotFoundException(`Resource ${id} not found`);
}

// For uniqueness violations
try {
  return await db.insert(table).values(data).returning();
} catch (error) {
  if (error.code === "23505") {
    // unique_violation
    throw new ConflictException("Resource already exists");
  }
  throw error;
}
```

## Testing Conventions

- Tests co-located with source as `*.spec.ts`
- Use NestJS testing utilities (`Test.createTestingModule`)
- Mock external dependencies (DB, external APIs), not internal services
- Test both happy path and error paths
- For DB-heavy services, consider integration tests with a real test DB
