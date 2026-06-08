---
id: ST-002
task: add-user-profile-and-settings
title: User settings (notification prefs)
status: in-progress
source: overview
depends_on: []
owns:
  - apps/api/src/user-settings/
  - apps/migrations/src/schema/userSettings.ts
branch: feat/ST-002-user-settings-notification-prefs
created: 2026-06-08
---

## Context
Overview note: users need account settings, starting with notification prefs
("attention items notifications, timer notifications etc."). This slice adds a
`user_settings` table + a `user-settings` NestJS module exposing get/update of a
user's notification preferences. Mirrors the existing timer-settings slice.

## Plan
1. `userSettings` Drizzle schema — one row per user (unique `user_id` FK,
   cascade delete), two boolean prefs defaulting to `true`, timestamps.
2. `user-settings` module mirroring the timers settings pattern: entity, model
   input, repository (txHost upsert + lazy ensure), service (`@Transactional`,
   Clock), controller (`@Controller("user-settings")` GET + PUT), DTO, response,
   mapper.

## Changes contained
- `apps/migrations/src/schema/userSettings.ts` — `user_settings` table.
- `apps/api/src/user-settings/entities/user-settings.entity.ts`
- `apps/api/src/user-settings/models/user-settings.model.ts`
- `apps/api/src/user-settings/user-settings.repository.ts`
- `apps/api/src/user-settings/user-settings.service.ts`
- `apps/api/src/user-settings/rest/user-settings.controller.ts`
- `apps/api/src/user-settings/rest/user-settings.mapper.ts`
- `apps/api/src/user-settings/rest/dto/update-user-settings.dto.ts`
- `apps/api/src/user-settings/rest/responses/user-settings.response.ts`
- `apps/api/src/user-settings/user-settings.module.ts`

## Out of scope
- Registering `UserSettingsModule` in `apps/api/src/app.module.ts` — ST-003.
- Generating the SQL migration (`apps/migrations/migrations/**`, shared journal)
  — deferred to integration; can't run in parallel worktrees. Schema file only.
- `db.ts` schema registration — not needed; repos use `.select().from()`, not
  the relational query API (timers tables aren't registered there either).
- User profile fields (phone/avatar) — ST-001.

## Verification
- API typecheck/build: `pnpm --filter @asksynk/api build` (or `nest build`).
- Migration generation (integration step, run from a merged branch):
  `pnpm --filter @asksynk/migrations db:generate` → review SQL → `db:migrate`.
- `taskflow check ST-002`.

## Implementation output
Added a `user-settings` module + `user_settings` table for per-user notification
preferences, following the timer-settings slice exactly.

- Schema `user_settings`: `id` (uuidv7), `user_id` (text FK → users, cascade,
  unique), `attention_item_notifications` bool default true,
  `timer_notifications` bool default true, `created_at`/`updated_at`.
- Repository (`UserSettingsRepository`): injects `TransactionHost<TxAdapter>`;
  `ensure()` lazily inserts a defaults row (`onConflictDoNothing`) then reads it;
  `update()` upserts via `onConflictDoUpdate`. No direct DB in the service.
- Service (`UserSettingsService`): `@Transactional()` `getSettings` /
  `updateSettings`, stamps `updatedAt` via `Clock`.
- Controller `@Controller("user-settings")`: `GET` + `PUT`, auth via
  `@AuthUser()`, returns `UserSettingsResponse` through the mapper.

## API changes
Base path `/user-settings` (authenticated, current user).

- `GET /user-settings` → `200` `UserSettingsResponse`
  (lazily creates defaults on first read).
- `PUT /user-settings` — body `UpdateUserSettingsDto` (full replace) →
  `200` `UserSettingsResponse`.

`UpdateUserSettingsDto` / `UserSettingsResponse`:
```
attentionItemNotifications: boolean
timerNotifications: boolean
```

## Notes/decisions
- PUT (full replace) over PATCH to match the timer-settings convention; both
  prefs are always present, no partial-update need (YAGNI).
- Kept to the two named prefs (attention-item + timer); no channels/per-type
  granularity yet (YAGNI).
- Migration not generated here on purpose — parallel sub-tasks share drizzle's
  `meta/_journal.json`; generate once after ST-001/ST-002 land.
