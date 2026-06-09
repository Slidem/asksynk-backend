# API Reference — Attachments, User Profile & Settings

> Client integration reference. Base URL: server root (no path prefix), e.g. `https://api.asksynk.app`.

## Authentication

All endpoints below require authentication. Send the better-auth session, either:

- the session cookie (browser), or
- `Authorization: Bearer <session-token>`

Unauthenticated requests return `401 { "message": "Unauthorized" }`.

Validation failures return `400 { "message": ["<field> ..."] }` (array of messages).

---

## Attachments

Uploads are **direct-to-storage** using a presigned POST. Three steps:

1. `POST /attachments` — register the file, get a presigned upload form.
2. Upload the bytes straight to storage using the returned `upload.url` + `upload.fields`.
3. `PATCH /attachments/:id` — finalize (server verifies the object, marks it ready).

Then reference the attachment id wherever it's used (e.g. `avatarAttachmentId`, message attachments).

**Placements**
| placement | use | url type | expiry |
|-----------|-----|----------|--------|
| `public` | publicly viewable assets (e.g. avatars) | stable, cacheable | never (`expiresAt: null`) |
| `message` | private message attachments | short-lived signed url | ~5 min (`expiresAt` set) |

**Constraints**
- Max size: **10 MB** (`10485760` bytes).
- Allowed `contentType`: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

---

### `POST /attachments`

Register an attachment and receive a presigned upload grant. The file is **not** uploaded yet.

**Request Body**
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| placement | `"public" \| "message"` | yes | — |
| contentType | string | yes | one of the allowed types above |
| fileName | string | no | maxLength 255 |
| sizeBytes | int | yes | 1 … 10485760 |

```json
{
  "placement": "public",
  "contentType": "image/png",
  "fileName": "avatar.png",
  "sizeBytes": 20480
}
```

**Success `201`**
```json
{
  "attachmentId": "01977e1b-2a4c-7b3d-9f10-0a1b2c3d4e5f",
  "storageKey": "01977e1b-2a4c-7b3d-9f10-0a1b2c3d4e5f",
  "upload": {
    "url": "https://storage.example.com/public",
    "fields": {
      "key": "01977e1b-2a4c-7b3d-9f10-0a1b2c3d4e5f",
      "Content-Type": "image/png",
      "policy": "<base64-policy>",
      "x-amz-signature": "<sig>"
    },
    "expiresAt": "2026-06-09T12:02:00.000Z"
  }
}
```

**Uploading the bytes (step 2):** POST `multipart/form-data` to `upload.url`. Append **every** key in `upload.fields` first, then the file last as the `file` field. Do this before `upload.expiresAt` (~2 min window). `storageKey` is opaque — keep it only if you need it; the client normally just uses `attachmentId`.

```js
const form = new FormData();
Object.entries(upload.fields).forEach(([k, v]) => form.append(k, v));
form.append("file", fileBlob);
await fetch(upload.url, { method: "POST", body: form });
```

**Errors**
| Status | Condition |
|--------|-----------|
| 400 | unsupported content type / size out of range / validation failed |

---

### `PATCH /attachments/:id`

Finalize after the bytes are uploaded. Server validates the stored object (size + type) and marks it ready, then returns a readable view.

**Request Body**
| Field | Type | Required | Value |
|-------|------|----------|-------|
| status | string | yes | `"ready"` |

```json
{ "status": "ready" }
```

**Success `200`**
```json
{
  "id": "01977e1b-2a4c-7b3d-9f10-0a1b2c3d4e5f",
  "contentType": "image/png",
  "fileName": "avatar.png",
  "sizeBytes": 20480,
  "url": "https://cdn.example.com/01977e1b-2a4c-7b3d-9f10-0a1b2c3d4e5f",
  "expiresAt": null
}
```

> `expiresAt` is `null` for `public` urls (stable). For `message` attachments `url` is a signed url and `expiresAt` is an ISO timestamp — refetch via `GET /attachments/:id` before it elapses.

**Errors**
| Status | Condition |
|--------|-----------|
| 400 | object missing in storage / exceeds size limit / disallowed type |
| 403 | not the owner |
| 404 | attachment not found |

---

### `GET /attachments/:id`

Get a readable view of an attachment with a fresh url. Use this to refresh expired signed urls for `message` attachments.

**Success `200`** — same shape as the finalize response.

**Errors**
| Status | Condition |
|--------|-----------|
| 403 | no access to this attachment |
| 404 | not found / not yet finalized |

---

## User Profile

### `GET /profile`

Get the current user's profile.

**Success `200`**
```json
{
  "id": "usr_01977...",
  "name": "Ada Lovelace",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "email": "ada@example.com",
  "image": "https://...",
  "phone": "+15551234567",
  "avatar": {
    "id": "01977e1b-2a4c-7b3d-9f10-0a1b2c3d4e5f",
    "url": "https://cdn.example.com/01977e1b-2a4c-7b3d-9f10-0a1b2c3d4e5f"
  }
}
```

| Field | Type | Notes |
|-------|------|-------|
| id | string | user id |
| name | string \| null | |
| firstName | string \| null | |
| lastName | string \| null | |
| email | string | |
| image | string \| null | auth-provider image |
| phone | string \| null | |
| avatar | `{ id, url }` \| null | resolved from `avatarAttachmentId`; `null` if unset |

---

### `PATCH /profile`

Update profile fields. Both fields optional — only the keys you send are changed. Send `null` to clear a field.

**Request Body**
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| phone | string \| null | no | maxLength 32 |
| avatarAttachmentId | string (UUID) \| null | no | must be a finalized `public` attachment id |

```json
{
  "phone": "+15551234567",
  "avatarAttachmentId": "01977e1b-2a4c-7b3d-9f10-0a1b2c3d4e5f"
}
```

**Success `200`** — full profile (same shape as `GET /profile`).

---

## User Settings

### `GET /user-settings`

Get the current user's notification settings.

**Success `200`**
```json
{
  "attentionItemNotifications": true,
  "timerNotifications": true
}
```

---

### `PUT /user-settings`

Replace notification settings. Both fields **required** (full replace).

**Request Body**
| Field | Type | Required |
|-------|------|----------|
| attentionItemNotifications | boolean | yes |
| timerNotifications | boolean | yes |

```json
{
  "attentionItemNotifications": false,
  "timerNotifications": true
}
```

**Success `200`** — the updated settings (same shape as `GET`).
