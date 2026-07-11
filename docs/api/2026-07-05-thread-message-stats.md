# API — Thread tagged-message endpoints (2026-07-05)

Read-only endpoints over a thread's **tagged** messages (messages that carry a tracked status). Each group has a user variant and a public-link guest variant. No versioning prefix; dev base URL `http://localhost:3000`.

A "tagged message" is one that has a `managedStatus`, i.e. it was tagged and is being tracked. Each is in one of three statuses: `created`, `in_progress`, `resolved`. Plain/untagged messages are ignored by all of these endpoints. Replies are included (a tagged reply counts too).

---

## A. Status counts — `GET .../stats`

Per-status counts of the thread's tagged messages.

`200 OK`

```json
{ "created": 5, "inProgress": 2, "resolved": 4 }
```

| Field | Type | Meaning |
|-------|------|---------|
| `created` | number | Tagged messages not yet started |
| `inProgress` | number | Tagged messages being worked on |
| `resolved` | number | Tagged messages marked done |

- All counts `≥ 0`. **Unresolved = `created + inProgress`** (derive client-side).

### A1. User — `GET /threads/:id/stats`
- Auth: user Bearer token. Path param `id` = thread UUID.

### A2. Guest — `GET /public/thread/stats`
- Auth: guest Bearer token (same one used for other `/public/thread/*` calls). No path param — thread comes from the session.
- No thread yet → `200` with `{ "created": 0, "inProgress": 0, "resolved": 0 }`.

---

## B. List all tagged messages — `GET .../tagged-messages`

Every tagged message in the thread. **Not paginated** — returns the full set. Ordered newest-first. The array length equals `created + inProgress + resolved` from the stats endpoint.

`200 OK` → array of message objects:

```json
[
  {
    "id": "01905f4e-abcd-7000-8000-000000000001",
    "threadId": "01905f4e-1111-7000-8000-000000000000",
    "parentMessageId": null,
    "senderKind": "user",
    "senderId": "usr_123",
    "body": "Can you review the deck?",
    "tagIds": ["01905f4e-tag0-7000-8000-000000000001"],
    "attachments": [],
    "suggestionId": null,
    "managedStatus": { "type": "tagged_message", "status": "in_progress" },
    "createdAt": "2026-07-05T12:00:00.000Z",
    "replyCount": 2
  }
]
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Message id |
| `threadId` | string | |
| `parentMessageId` | string \| null | Set when the tagged message is itself a reply |
| `senderKind` | `"user"` \| `"guest"` | |
| `senderId` | string | User id or guest id, per `senderKind` |
| `body` | string | |
| `tagIds` | string[] | Applied tags (non-empty for tagged messages) |
| `attachments` | array | Attachment objects (same shape as the `/messages` endpoint) |
| `suggestionId` | string \| null | Linked task suggestion, if any |
| `managedStatus` | object | `{ "type": "tagged_message", "status": "created" \| "in_progress" \| "resolved" }` — always present here |
| `createdAt` | string | ISO 8601 |
| `replyCount` | number | Replies to this message (`0` for a message that is itself a reply) |

Same object shape as `GET /threads/:id/messages`, so existing message-rendering can be reused.

### B1. User — `GET /threads/:id/tagged-messages`
- Auth: user Bearer token. Path param `id` = thread UUID.

### B2. Guest — `GET /public/thread/tagged-messages`
- Auth: guest Bearer token. No path param — thread comes from the session.
- No thread yet → `200` with `[]`.

---

## Errors

| Status | `error` | When |
|--------|---------|------|
| 400 | `BAD_REQUEST` | `id` is not a valid UUID (user routes only) |
| 401 | `UNAUTHORIZED` | Missing / invalid / expired token, or revoked link (guest) |
| 404 | `NOT_FOUND` | Thread doesn't exist **or** caller isn't a participant — same response for both (user routes only) |

Every non-2xx response uses the shared envelope:

```json
{ "error": "NOT_FOUND", "statusCode": 404, "message": "Thread not found" }
```

`error` ∈ `BAD_REQUEST | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | INTERNAL_SERVER_ERROR`.
