---
id: ST-003
task: add-user-profile-and-settings
title: Wire modules into app
status: done
source: overview
depends_on: [ST-001, ST-002]
owns:
  - apps/api/src/app.module.ts
branch: feat/ST-003-wire-modules-into-app
created: 2026-06-08
---

## Context

ST-001 (`UserProfileModule`) and ST-002 (`UserSettingsModule`) each built a module but
deliberately left it unregistered to avoid colliding on `app.module.ts` in parallel
worktrees. This sub-task is the integration step: register both modules so their
controllers/routes are actually served.

## Plan

1. Import `UserProfileModule` and `UserSettingsModule` (via `@/api/...` aliases).
2. Add both to the `AppModule` `imports` array.

## Changes contained

- `apps/api/src/app.module.ts` — two imports + two `imports[]` entries.

## Out of scope

- The modules themselves (ST-001 / ST-002).
- Migration SQL generation (`apps/migrations/migrations/**`, shared journal) — both
  source sub-tasks deferred it to post-merge; not in this sub-task's `owns:`. Must be
  run before the API will boot against the DB (see Notes).

## Verification

API typecheck/build (manual, project rule):

```sh
pnpm --filter @asksynk/api exec tsc --noEmit
# or: pnpm --filter @asksynk/api build
```

## Implementation output

`apps/api/src/app.module.ts`: added `UserProfileModule` and `UserSettingsModule`
imports and registered both in the `imports` array. No other changes.

## Notes/decisions

- Strictly within `owns:` (only `app.module.ts`).
- **Follow-up before runtime**: the `users.phone` / `users.avatarAttachmentId` columns
  (ST-001) and the `user_settings` table (ST-002) still need a generated + applied
  drizzle migration. Both deferred it to post-merge to avoid `_journal.json` conflicts;
  it's outside this sub-task's `owns:` so it isn't done here.
