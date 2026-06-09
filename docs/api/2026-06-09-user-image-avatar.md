# API Changes — 2026-06-09 — User image / avatar

> Generated from git diff. Review for accuracy before distributing.

## Summary

- **0 new endpoints**, **5 modified endpoints** (response shape and/or `image` semantics).
- **Breaking change:** `GET /profile` and `PATCH /profile` no longer return the
  `avatar: { id, url }` object. The user's avatar is now exposed **only** through
  the existing `image` string field.

### What changed conceptually

A user's displayed picture is now a **single `image` URL field**, used consistently
everywhere a user is shown (profile, network connections, thread participants,
public-view owner).

When a user sets an avatar (`PATCH /profile { avatarAttachmentId }`), the backend
computes the attachment's **stable public URL once, at write time**, and stores it
into `users.image`. Reads never re-resolve — they just return the stored string.

- `image` is a public, non-expiring URL (no signature, safe to cache) when the
  user has uploaded an avatar.
- `image` may be `null` (no avatar / cleared).
- The `avatar_attachment_id` column was **removed** (migration `0010`).
  `avatarAttachmentId` survives only as a transient request input on `PATCH /profile`.

No route paths or auth changed. There is no global path prefix or API versioning;
routes are served at the root (e.g. `GET /profile`).

---

## Modified endpoints

### `GET /profile`

**Description**: Returns the authenticated user's profile.

**Auth**: Authenticated user (session/bearer).

**Success Response** `200` (`UserProfileResponseDto`):
| Field | Type | Notes |
|-------|------|-------|
| id | string | |
| name | string \| null | |
| firstName | string \| null | |
| lastName | string \| null | |
| email | string | |
| image | string \| null | **Public avatar URL** (or null). Was previously accompanied by an `avatar` object — now removed. |
| phone | string \| null | |

```json
{
  "id": "usr_8f2c1a90",
  "name": "Ada Lovelace",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "email": "ada@example.com",
  "image": "https://cdn.asksynk.app/019200ab-7c4d-7000-8000-aaaabbbbcccc",
  "phone": "+15551234567"
}
```

**Removed field** (breaking): `avatar: { id: string; url: string } | null` — read
`image` instead.

---

### `PATCH /profile`

**Description**: Updates the authenticated user's profile. Setting `avatarAttachmentId`
materializes that attachment's public URL into `image`. Passing `null` clears `image`.

**Auth**: Authenticated user (session/bearer).

**Request Body** (`UpdateUserProfileRequestDto`) — all fields optional; omitted = untouched:
| Field | Type | Required | Constraints | Effect |
|-------|------|----------|-------------|--------|
| phone | string \| null | no | maxLength: 32 | Sets/clears phone. |
| avatarAttachmentId | string (uuid) \| null | no | valid UUID | **Transient input** (not stored). Non-null → validate the attachment and store its public URL into `image`. `null` → set `image` to `null`. |

The attachment referenced by `avatarAttachmentId` must be:
owned by the caller, `placement: "public"`, and finalized (`status: "active"`) —
otherwise `400 Invalid avatar attachment`.

**Example Request** (set avatar):

```json
{ "avatarAttachmentId": "019200ab-7c4d-7000-8000-aaaabbbbcccc" }
```

**Example Request** (clear avatar):

```json
{ "avatarAttachmentId": null }
```

**Success Response** `200`: same shape as `GET /profile` (with `image` reflecting the change).

**Error Responses**:
| Status | Condition | Body |
|--------|-----------|------|
| 400 | `avatarAttachmentId` not owned / not public / not finalized | `{ "message": "Invalid avatar attachment" }` |
| 400 | Validation failed | `{ "message": ["avatarAttachmentId must be a UUID"] }` |
| 401 | No/invalid auth | `{ "message": "Unauthorized" }` |
| 404 | Profile missing | `{ "message": "User profile not found" }` |

**Removed field** (breaking): `avatar` object — read `image` instead.

---

### `GET /network`

**Description**: Lists the caller's active network connections. **Shape unchanged**;
documented because `image` now carries the connection's uploaded-avatar public URL.

**Auth**: Authenticated user (session/bearer).

**Success Response** `200` (`NetworkConnectionResponseDto[]`):
| Field | Type | Notes |
|-------|------|-------|
| userId | string | The connected user's id. |
| name | string \| null | |
| firstName | string \| null | |
| lastName | string \| null | |
| email | string | |
| image | string \| null | **Public avatar URL** (or null). |
| connectedAt | string (ISO) | |

```json
[
  {
    "userId": "usr_3b91",
    "name": "Grace Hopper",
    "firstName": "Grace",
    "lastName": "Hopper",
    "email": "grace@example.com",
    "image": "https://cdn.asksynk.app/01920100-aaaa-7000-8000-111122223333",
    "connectedAt": "2026-06-01T09:30:00.000Z"
  }
]
```

---

### `GET /threads`

**Description**: Lists the caller's message threads. **Shape unchanged**; documented
because the user participant's `image` now carries the uploaded-avatar public URL.

**Auth**: Authenticated user (session/bearer).

**Success Response** `200` (`ThreadListItemResponseDto[]`). The `other` participant is a
discriminated union on `kind`:

`other.kind === "user"`:
| Field | Type | Notes |
|-------|------|-------|
| kind | `"user"` | |
| userId | string | |
| name | string \| null | |
| firstName | string \| null | |
| lastName | string \| null | |
| email | string | |
| image | string \| null | **Public avatar URL** (or null). |
| isActiveConnection | boolean | |

`other.kind === "guest"`: `{ kind, guestId, displayName, publicViewId, publicViewName, publicViewExpired }` (no image — guests have no avatar).

```json
[
  {
    "threadId": "01920200-bbbb-7000-8000-444455556666",
    "publicViewId": null,
    "other": {
      "kind": "user",
      "userId": "usr_3b91",
      "name": "Grace Hopper",
      "firstName": "Grace",
      "lastName": "Hopper",
      "email": "grace@example.com",
      "image": "https://cdn.asksynk.app/01920100-aaaa-7000-8000-111122223333",
      "isActiveConnection": true
    },
    "lastMessage": {
      "body": "See you at 3pm",
      "createdAt": "2026-06-08T14:05:00.000Z",
      "senderKind": "user"
    },
    "frozen": false,
    "createdAt": "2026-06-01T09:30:00.000Z"
  }
]
```

---

### `GET /public/views/:slug`

**Description**: Public (guest-facing) metadata for a shared schedule view. **Added the
schedule owner's `image`** so guests can see whose schedule they're viewing.

**Auth**: Public — no authentication.

**Path Params**: `slug` — the public view slug.

**Success Response** `200` (`PublicViewMetadataResponseDto`):
| Field | Type | Notes |
|-------|------|-------|
| slug | string | |
| ownerUserId | string | |
| ownerImage | string \| null | **NEW** — owner's public avatar URL (or null). |
| name | string \| null | View name. |
| expiresAt | string (ISO) | |

```json
{
  "slug": "spring-hours",
  "ownerUserId": "usr_8f2c1a90",
  "ownerImage": "https://cdn.asksynk.app/019200ab-7c4d-7000-8000-aaaabbbbcccc",
  "name": "Spring office hours",
  "expiresAt": "2026-07-01T00:00:00.000Z"
}
```

**Error Responses**:
| Status | Condition | Body |
|--------|-----------|------|
| 404 | View missing, expired, or revoked | `{ "message": "Public view not found or expired" }` |

---

## How to set an avatar (end-to-end)

The avatar upload endpoints (`/attachments`) are **unchanged** — included here so this
doc is a complete integration reference. An avatar is a `placement: "public"`
attachment whose id is then handed to `PATCH /profile`.

1. **Create the upload** — `POST /attachments` (auth required)

   Body (`CreateAttachmentDto`): `placement` `"public"`, `contentType` (one of the
   allowed image types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`),
   `sizeBytes` (1 … 10 MB), optional `fileName` (≤255).

   Response `AttachmentUploadResponseDto`:

   ```json
   {
     "attachmentId": "019200ab-7c4d-7000-8000-aaaabbbbcccc",
     "storageKey": "019200ab-7c4d-7000-8000-aaaabbbbcccc",
     "upload": {
       "url": "https://...",
       "fields": { "...": "..." },
       "expiresAt": "2026-06-09T..."
     }
   }
   ```

2. **Upload the bytes** — `POST` the file directly to `upload.url` with the returned
   `upload.fields` as multipart form fields (browser → object storage; not via the API).

3. **Finalize** — `PATCH /attachments/:attachmentId` with body `{ "status": "ready" }`
   (auth required). Validates the stored object and flips it to `active`.

4. **Attach to profile** — `PATCH /profile { "avatarAttachmentId": "<attachmentId>" }`.
   The response `image` is now the public avatar URL.

Constraints: max **10 MB**; allowed types `image/png`, `image/jpeg`, `image/webp`,
`image/gif` (plus the non-image document types the attachments API also supports).
Public avatar URLs are stable and do not expire (`expiresAt: null`).
