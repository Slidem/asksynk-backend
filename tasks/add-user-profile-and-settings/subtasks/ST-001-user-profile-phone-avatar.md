---
id: ST-001
task: add-user-profile-and-settings
title: User profile (phone + avatar)
status: done
source: overview
depends_on: []
owns:
  - apps/api/src/user-profile/
  - apps/migrations/src/schema/users.ts
branch: feat/ST-001-user-profile-phone-avatar
created: 2026-06-08
---

## Context

Slice of the overview note: let users manage their profile — specifically **phone**
and **avatar**. Avatar is a public attachment (overview: "displayed for all users …
use the attachments module"), so the profile stores a reference to a public,
finalized attachment rather than raw bytes. Address already exists on the `users`
table; phone is the new field here.

## Plan

1. `users` schema: add `phone` (text) + `avatarAttachmentId` (uuid FK → attachments,
   `on delete set null`).
2. New `user-profile` Nest module (mirrors the `tags` module layout): entity, models,
   repository, service, REST controller/dto/response/mapper.
3. Singleton "me" resource: `GET /profile`, `PATCH /profile` (auth'd user).
4. Avatar set: validate the attachment is public + active + owned by the caller
   (via `AttachmentsRepository`); resolve to a public url on read (via
   `AttachmentsService.resolveMany`). Both are global (StorageModule is `@Global`).

## Changes contained

- `apps/migrations/src/schema/users.ts` — `phone`, `avatarAttachmentId` columns.
- `apps/api/src/user-profile/**` — full module (10 files).

## Out of scope

- User settings / notification prefs (ST-002).
- Wiring `UserProfileModule` into `app.module.ts` (ST-003).
- Migration SQL generation: output dir `apps/migrations/migrations/` + `_journal.json`
  are shared with ST-002, so generation is deferred to post-merge (see Verification).
- Address editing, other-user profile views — YAGNI for this slice.

## Verification

Commands need manual run (project rule). Run after the schema change is in place:

```sh
# 1. typecheck the api
pnpm --filter @asksynk/api exec tsc --noEmit
# 2. generate migration from the schema change
pnpm --filter @asksynk/migrations exec drizzle-kit generate
# 3. apply it
pnpm dev:migrate
```

Then, with the api running and an authed session:

- `GET /profile` → 200 with `{ id, email, phone, avatar, … }`.
- `PATCH /profile { "phone": "+40..." }` → phone persisted.
- Upload a public attachment (POST /attachments placement=public → finalize), then
  `PATCH /profile { "avatarAttachmentId": "<id>" }` → `avatar.url` populated on read.
- `PATCH /profile { "avatarAttachmentId": "<not-owned/private/pending id>" }` → 400.

## Implementation output

New `user-profile` module under `apps/api/src/user-profile/`:

- `entities/user-profile.entity.ts` — `UserProfile` (id, name, first/last, email,
  image, phone, avatarAttachmentId, timestamps).
- `models/user-profile.model.ts` — `ResolvedUserProfile` (profile + resolved avatar url).
- `models/update-user-profile.model.ts` — `UpdateUserProfileInput` (null clears, undefined leaves).
- `repositories/user-profile.repository.ts` — `getById`, `update` over the `users` table.
- `services/user-profile.service.ts` — `getProfile`, `updateProfile`; validates avatar
  (public + active + owned) and resolves the public url.
- `rest/` — controller (`GET`/`PATCH /profile`), `UpdateUserProfileRequestDto`,
  response dto, mapper.
- `user-profile.module.ts` — providers/controller/exports; relies on `@Global`
  StorageModule for `AttachmentsService` + `AttachmentsRepository`.

Schema: `apps/migrations/src/schema/users.ts` gains `phone` and `avatarAttachmentId`
(FK → `attachments.id`, `on delete set null`).

## API changes

Base path: `/profile` (auth required).

- **GET `/profile`** → `200 UserProfileResponseDto`
  ```jsonc
  { "id", "name", "firstName", "lastName", "email", "image", "phone",
    "avatar": { "id": "<uuid>", "url": "<public-url>" } | null }
  ```
- **PATCH `/profile`** → `200 UserProfileResponseDto`. Body (all optional):
  ```jsonc
  { "phone": "string|null (max 32)", "avatarAttachmentId": "uuid|null" }
  ```
  `null` clears a field; omitted leaves it untouched. `avatarAttachmentId` must be a
  public, finalized attachment owned by the caller, else `400`.

## Notes/decisions

- Avatar stored as a FK to `attachments` (public placement) instead of a raw url, per
  the overview's "use the attachments module". `on delete set null` so deleting the blob
  silently clears the avatar; read-resolution omits a non-active attachment → `avatar: null`.
- `users.ts` now imports `attachments.ts` (which imports `users.ts`): a circular schema
  FK, resolved by drizzle's `() =>` reference thunks — the documented pattern.
- Did **not** generate migration SQL: the migrations output dir + `_journal.json` are
  shared with ST-002 and would conflict in parallel worktrees. Generate once post-merge.
- Profile is a singleton `me` resource (no verb routes); other-user views deferred.
