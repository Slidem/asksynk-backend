---
name: api-docs
description: >
  Analyze newly added or modified API endpoints from the git diff and generate
  concise Markdown documentation. The output is designed to be self-contained
  so it can be handed off to a frontend developer or provided to another Claude
  session. Use when the user says "document the api", "api docs", "generate
  endpoint docs", "what apis did I add", "hand off to frontend", "document
  new endpoints", or after finishing backend work that added/changed controllers.
allowed-tools: Read, Grep, Glob, Bash
---

# API Documentation Generator

Analyze recent git changes, identify new or modified API endpoints, and produce
clean Markdown docs that a frontend developer can use as a complete integration
reference.

## Step 1 — Get the Diff

Run in order, use the first with output:

1. `git diff --staged`
2. `git diff`
3. `git diff HEAD~1`

If the user specifies a commit range or branch, use that instead.

## Step 2 — Find API Changes

From the diff, identify:

- New controller methods (decorators: `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`)
- Modified controller methods (changed params, response, logic)
- New or changed DTOs that affect request/response shape
- New or changed guards/interceptors applied to endpoints

Also scan with:

```bash
git diff --staged --name-only | grep -E "(controller|dto)" || \
git diff --name-only | grep -E "(controller|dto)" || \
git diff HEAD~1 --name-only | grep -E "(controller|dto)"
```

## Step 3 — Read the Full Implementation

For each endpoint found, read the complete chain:

1. **Controller method**: decorators, parameter decorators (`@Body`, `@Param`,
   `@Query`, `@Headers`), return type
2. **DTO class**: every field, its TypeScript type, class-validator decorators
   (this determines required vs optional, constraints, enums)
3. **Service method**: understand the business logic, side effects, and what
   it returns
4. **Response type**: follow the return type chain to build a realistic example
5. **Guards**: which auth guard is applied, any role requirements
6. **Interceptors**: response transformation, serialization

## Step 4 — Generate the Documentation

````markdown
# API Changes — YYYY-MM-DD — [feature name]

> Generated from git diff. Review for accuracy before distributing.

## Summary

- X new endpoints
- X modified endpoints
- Breaking changes: none / (describe)

---

### `POST /api/v1/resource`

**Description**: Creates a new resource with the given properties.

**Auth**: Bearer token required (AuthGuard)

**Request Body** (`CreateResourceDto`):
| Field | Type | Required | Constraints | Default |
|-------|------|----------|-------------|---------|
| name | string | yes | maxLength: 100 | — |
| type | enum | no | "A" \| "B" \| "C" | "A" |

**Example Request**:

```json
{
  "name": "My Resource",
  "type": "B"
}
```
````

**Success Response** `201`:

```json
{
  "id": "01905f4e-abcd-7000-8000-000000000001",
  "name": "My Resource",
  "type": "B",
  "createdAt": "2026-03-31T12:00:00.000Z"
}
```

**Error Responses**:
| Status | Condition | Body |
|--------|-----------|------|
| 400 | Validation failed | `{ "message": ["name must be shorter than 100 chars"] }` |
| 401 | No/invalid auth token | `{ "message": "Unauthorized" }` |
| 409 | Duplicate name | `{ "message": "Resource already exists" }` |

**Notes**: Also triggers a `resource.created` event consumed by the
notification service.

---

```

Repeat for each endpoint. Group by resource/controller when multiple
endpoints belong to the same domain.

## Step 5 — Save and Summarize

Save the document to `docs/api/YYYY-MM-DD-<feature-name>.md`.

Print a summary at the end:
```

Documented N endpoints:
POST /api/v1/resource — Create resource
GET /api/v1/resource — List resources (paginated)
GET /api/v1/resource/:id — Get resource by ID
PATCH /api/v1/resource/:id — Update resource
DELETE /api/v1/resource/:id — Delete resource

Saved to: docs/api/2026-03-31-resources.md

```

```
