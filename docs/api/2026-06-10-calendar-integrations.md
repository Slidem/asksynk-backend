# API Changes — 2026-06-10 — Calendar Integrations (Google)

> Frontend integration guide. Base URL: `http://localhost:3000` (no global prefix; routes are at root).

## Summary

- **6 new endpoints** under `/calendar-integrations` (connect/list/get/update/disconnect + OAuth callback).
- **`GET /calendar-events` changed** — now returns events from **all** the user's calendars (native + imported), each tagged with `calendarId` / `source` / `readOnly`, plus an optional `calendarId` filter.
- **`PUT` / `DELETE /calendar-events/:id`** — now reject mutations on **imported** events (tags-only).
- **Breaking change** ⚠️: every `CalendarEventInstance` (list **and** single-event responses) now includes the new `calendarId`, `source`, `readOnly` fields. Additive — existing fields are unchanged.

## Concepts

- **Integration** — a connected external account (e.g. one Google account). Has a `status` and a `syncDirection`.
- **Provider calendar** — each calendar inside that account. The user opts each one in/out of sync (`syncEnabled`).
- **`syncDirection`**:
  - `readonly` (default on connect) — external events are imported into asksynk read-only; asksynk events are **not** pushed out.
  - `bidirectional` — additionally, native asksynk events are mirrored out to the account's primary calendar.
- **Sync is not instant.** Import runs on a poll (~every 5 min), not synchronously on connect. Outbound mirroring is event-driven (seconds, but async).
- **Imported events are read-only** in asksynk except for **tags** (you may attach/detach tags locally; tags never sync out).

## Auth

All endpoints require the standard authenticated session (better-auth), **except** the OAuth `callback`, which is public (it is hit by the provider's browser redirect, not by your client).

## Error shape

All errors share this body:

```json
{
  "error": "BAD_REQUEST",
  "statusCode": 400,
  "message": "Human-readable reason"
}
```

`error` ∈ `NOT_FOUND` (404) · `UNAUTHORIZED` (401) · `FORBIDDEN` (403) · `BAD_REQUEST` (400) · `INTERNAL_SERVER_ERROR` (500).

---

## Connect flow (OAuth)

```
1. FE calls   GET /calendar-integrations/auth-url?provider=google   → { url }
2. FE redirects the browser to `url` (Google consent screen).
3. Google redirects to the backend callback (GET .../google/callback).
4. Backend exchanges the code, stores the integration + its calendars (sync disabled),
   then 302-redirects the browser to CALENDAR_OAUTH_REDIRECT_URL?connected=google.
5. FE lands on that page, calls GET /calendar-integrations to show the result,
   then lets the user pick which calendars to sync via PATCH.
```

The configured landing page is `CALENDAR_OAUTH_REDIRECT_URL` (backend env) with `?connected=<provider>` appended. Point it at your integrations settings screen.

---

### `GET /calendar-integrations/auth-url`

Returns the provider consent URL to redirect the user to. State is HMAC-signed server-side (CSRF-safe).

**Auth**: required.

**Query params**:
| Param | Type | Required | Notes |
|-------|------|----------|-------|
| provider | string | yes | currently only `"google"` |

**Success** `200` (`AuthUrlResponseDto`):

```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

**Errors**: `400` if `provider` is unsupported.

---

### `GET /calendar-integrations/:provider/callback`

OAuth redirect target. **Not called by your client** — the provider's browser redirect hits it, and it 302-redirects back to your frontend. Documented for completeness only.

**Auth**: public. **Query**: `code`, `state` (provider-supplied). **Response**: `302` redirect to `CALENDAR_OAUTH_REDIRECT_URL?connected=<provider>`. Invalid/forged `state` → `400`.

---

### `GET /calendar-integrations`

Lists the current user's integrations with their calendars.

**Auth**: required.

**Success** `200` — array of `CalendarIntegrationResponseDto`:

```json
[
  {
    "id": "01905f4e-abcd-7000-8000-000000000001",
    "provider": "google",
    "status": "active",
    "syncDirection": "readonly",
    "accountEmail": "user@gmail.com",
    "lastError": null,
    "calendars": [
      {
        "id": "01905f4e-abcd-7000-8000-0000000000aa",
        "name": "user@gmail.com",
        "color": "#039BE5",
        "externalId": "user@gmail.com",
        "syncEnabled": false
      },
      {
        "id": "01905f4e-abcd-7000-8000-0000000000bb",
        "name": "Team",
        "color": "#33B679",
        "externalId": "c_abc123@group.calendar.google.com",
        "syncEnabled": false
      }
    ]
  }
]
```

**Field reference**:
| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid | integration id (use in PATCH/DELETE) |
| `provider` | string | `"google"` |
| `status` | string | `active` \| `error` \| `revoked`. `error` ⇒ token expired/revoked → prompt reconnect (see `lastError`) |
| `syncDirection` | string | `readonly` \| `bidirectional` |
| `accountEmail` | string \| null | connected account email |
| `lastError` | string \| null | populated when `status="error"` |
| `calendars[].id` | uuid | asksynk calendar id (use in PATCH `calendars[].calendarId`) |
| `calendars[].name` | string \| null | provider calendar display name |
| `calendars[].syncEnabled` | boolean | whether this calendar is being imported |

---

### `GET /calendar-integrations/:id`

Single integration (same shape as one array element above).

**Auth**: required. **Path**: `id` (uuid). **Errors**: `404` if not found / not owned. `400` if `id` is not a valid UUIDv7.

---

### `PATCH /calendar-integrations/:id`

Updates sync direction and/or selects which calendars to sync. Both fields optional; send what you change.

**Auth**: required. **Path**: `id` (uuid).

**Request body** (`UpdateIntegrationRequestDto`):
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `syncDirection` | enum | no | `"bidirectional"` \| `"readonly"` |
| `calendars` | array | no | per-calendar sync toggles |
| `calendars[].calendarId` | uuid | yes (per item) | must be a calendar **of this integration** |
| `calendars[].syncEnabled` | boolean | yes (per item) | |

**Example — enable one calendar and go bidirectional**:

```json
{
  "syncDirection": "bidirectional",
  "calendars": [
    {
      "calendarId": "01905f4e-abcd-7000-8000-0000000000aa",
      "syncEnabled": true
    }
  ]
}
```

**Success** `200` — the updated `CalendarIntegrationResponseDto`.

**Errors**:
| Status | Condition |
|--------|-----------|
| 400 | `calendarId` doesn't belong to this integration, or invalid enum/body |
| 404 | integration not found / not owned |

> Enabling a calendar does not import immediately — the next poll cycle (~5 min) performs the first import.

---

### `DELETE /calendar-integrations/:id`

Disconnects: best-effort revoke of the provider token, then deletes the integration and **cascade-deletes its imported calendars + events**.

**Auth**: required. **Path**: `id` (uuid). **Success**: `204` (no body). **Errors**: `404` if not found / not owned.

---

## Modified: `GET /calendar-events` now spans all calendars

The event-listing endpoint now returns events from **all of the user's calendars** (native asksynk + every imported provider calendar), and each event carries its calendar identity and a read-only flag. This is how the FE renders a unified calendar grid and knows which events are editable.

**Auth**: same as before (works for the owner and for guests viewing a shared schedule).

**Query params** (unchanged except the new `calendarId`):
| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `start` | ISO 8601 w/ offset | yes | window start |
| `end` | ISO 8601 w/ offset | yes | window end |
| `timezone` | IANA tz | yes | interprets the window wall-clock |
| `userId` | string | no | view another user's schedule (networks); defaults to caller |
| `tagIds` | uuid[] | no | filter by tags |
| `calendarId` | uuid | no | **new** — restrict to a single calendar; omit to get **all** |

**New fields on every event instance** (also present on the single-event responses below):
| Field | Type | Notes |
|-------|------|-------|
| `calendarId` | uuid | which calendar this event belongs to |
| `source` | string | `"asksynk"` (native) or a provider id like `"google"` |
| `readOnly` | boolean | `true` for imported events — only tags may be edited |

**Example item**:

```json
{
  "eventId": "01905f4e-abcd-7000-8000-000000000777",
  "instanceId": "01905f4e-abcd-7000-8000-000000000777_2026-06-12T09:00:00.000Z",
  "calendarId": "01905f4e-abcd-7000-8000-0000000000bb",
  "source": "google",
  "readOnly": true,
  "title": "Sprint planning",
  "description": null,
  "location": null,
  "link": "https://meet.google.com/abc-defg-hij",
  "instanceStart": "2026-06-12T09:00:00.000Z",
  "durationSeconds": 3600,
  "allDay": false,
  "timezone": "Europe/Bucharest",
  "color": null,
  "rrule": null,
  "tagIds": []
}
```

> Cross-reference `calendarId` against the calendars from `GET /calendar-integrations` (provider calendars: id, name, color) and `GET /calendars` (the native one) to group/color events. `readOnly` is derived from `source` — use it directly to gate edit/delete UI.

**Errors**: `404` if a provided `calendarId` doesn't belong to the target user.

---

## Modified: calendar-events mutations on imported events

The existing event endpoints are unchanged for native (asksynk) events. For **imported** events (`readOnly: true`):

### `PUT /calendar-events/:id`

- **Tag-only updates are allowed** (send only `tagIds`).
- Any other field (`title`, `start`, `durationSeconds`, `rrule`, …) → **`400`**:
  ```json
  {
    "error": "BAD_REQUEST",
    "statusCode": 400,
    "message": "Imported calendar events are read-only; only tags can be changed"
  }
  ```

### `DELETE /calendar-events/:id`

- Imported events cannot be deleted → **`400`**:
  ```json
  {
    "error": "BAD_REQUEST",
    "statusCode": 400,
    "message": "Imported calendar events are read-only and cannot be deleted"
  }
  ```

**FE guidance**: use the `readOnly` flag on each event instance to render imported events as read-only (allow only tag editing); hide/disable the edit & delete actions.

---

## Quick reference

| Method | Path                                              | Purpose                               |
| ------ | ------------------------------------------------- | ------------------------------------- |
| GET    | `/calendar-integrations/auth-url?provider=google` | Get consent URL to redirect to        |
| GET    | `/calendar-integrations/:provider/callback`       | OAuth redirect target (browser only)  |
| GET    | `/calendar-integrations`                          | List integrations + their calendars   |
| GET    | `/calendar-integrations/:id`                      | Get one integration                   |
| PATCH  | `/calendar-integrations/:id`                      | Set sync direction / toggle calendars |
| DELETE | `/calendar-integrations/:id`                      | Disconnect (cascade-deletes imports)  |
| GET    | `/calendar-events?start=&end=&timezone=&calendarId=` | List events across all calendars (or one); items carry `calendarId`/`source`/`readOnly` |
