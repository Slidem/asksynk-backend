# API Changes — 2026-10-30 — Attention items as pure projection

> Generated from the working-tree diff (base `7859c87`) and the implementation. Review for
> accuracy before distributing. Design: `docs/architecture/06-attention-core.md`, ADR 0009.

## Summary

- **Modified**: `GET /attention-items`, `GET /attention-items/:id`, `DELETE /attention-items/:id`
- **Removed**: `PATCH /attention-items/:id`
- **WebSocket**: `attention.upserted` payload reshaped; new triggers for `attention.upserted`
- **Breaking changes: yes.** Item shape (`type`, `metadata`, `note`, `sourceCalendarEventId` gone →
  `source`, `preview`, `dueDatePinned`), no PATCH, `type` query → `sourceKind`.
- **Data reset on deploy**: every existing attention item is deleted (no backfill). An item
  reappears when its source next changes (message edit / status change, task update…). Drop
  any client cache of attention items.

Contents:

1. [Concepts](#1-concepts)
2. [`AttentionItemResponse` reference](#2-attentionitemresponse-reference)
3. [Endpoints](#3-endpoints)
4. [WebSocket events](#4-websocket-events)
5. [Changing an item's status (act on the source)](#5-changing-an-items-status-act-on-the-source)
6. [Lifecycle: when items appear / change / disappear](#6-lifecycle)
7. [Errors](#7-errors)
8. [TypeScript types](#8-typescript-types)
9. [Migration checklist (old → new)](#9-migration-checklist-old--new)

---

## 1. Concepts

| Term         | Meaning                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Item**     | Read-only projection of one source (a message, task, batch, suggestion) for one user. The server writes it; the client only reads and deletes it.                              |
| **Source**   | `{ context, kind, id }` — what the item is about. `id` is the source's own id (message id, task id…). Use it to navigate / act on the source.                                  |
| **Preview**  | Display data copied from the source: `title`, `body`, `actor`, `meta`. Don't parse it for logic beyond display / navigation.                                                   |
| **Status**   | `created` \| `in_progress` \| `resolved`. **Always follows the source**; the client never sets it on the item.                                                                 |
| **Due date** | Explicit date from the source (`dueDatePinned: true`), or derived by the server from the item's tags' answer modes (`dueDatePinned: false`, may move on tag/calendar changes). |
| **Delete**   | User dismisses the item. **Permanent**: no later source change (edit, retag, status) brings it back.                                                                           |

One item per `(user, source)`. Source kinds today:

| `source.context` | `source.kind`     | Who gets the item                    | `source.id`   |
| ---------------- | ----------------- | ------------------------------------ | ------------- |
| `conversations`  | `message`         | Recipient (user) of a tagged message | message id    |
| `tasks`          | `task`            | Assignee of a tagged task            | task id       |
| `tasks`          | `task_batch`      | Assignee of a tagged batch           | batch id      |
| `tasks`          | `task_suggestion` | Suggestee (untagged inbox item)      | suggestion id |

Treat `source.kind` as an open string: future channels (Gmail, Slack…) add kinds without an
API change. Render unknown kinds generically from `preview.title` / `preview.body`.

---

## 2. `AttentionItemResponse` reference

| Field           | Type                                            | Notes                                                                      |
| --------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| `id`            | string (uuid v7)                                | Stable for the item's life.                                                |
| `userId`        | string                                          | Owner (always the caller).                                                 |
| `source`        | `{ context: string; kind: string; id: string }` | See §1.                                                                    |
| `preview`       | `AttentionPreview`                              | See below.                                                                 |
| `status`        | `"created" \| "in_progress" \| "resolved"`      | Mirrors source (see §5 mapping).                                           |
| `tagIds`        | string[]                                        | Source's current tags (empty for `task_suggestion`). Deleted tags omitted. |
| `dueDate`       | ISO string \| null                              |                                                                            |
| `dueDatePinned` | boolean                                         | **New.** `true` = explicit date from the source; `false` = tag-derived.    |
| `createdAt`     | ISO string                                      | List order + cursor.                                                       |
| `updatedAt`     | ISO string                                      |                                                                            |

`AttentionPreview`:

| Field   | Type                                              | Notes                                                           |
| ------- | ------------------------------------------------- | --------------------------------------------------------------- |
| `title` | string                                            | Message: first 120 chars of body. Task/batch/suggestion: title. |
| `body`  | string \| null                                    | Message: full body. Others: `null`.                             |
| `actor` | `{ kind: "user" \| "guest"; id: string }` \| null | Message: sender. Suggestion: suggester. Task/batch: `null`.     |
| `meta`  | `Record<string, string>`                          | Navigation extras. Message: `{ threadId }`. Others: `{}`.       |

### Examples

Tagged message (recipient's item):

```json
{
  "id": "019a3b7e-1c2d-7000-8000-000000000001",
  "userId": "usr_recipient",
  "source": {
    "context": "conversations",
    "kind": "message",
    "id": "019a3b7d-aaaa-7000-8000-000000000010"
  },
  "preview": {
    "title": "Can you review the Q4 deck before Friday?",
    "body": "Can you review the Q4 deck before Friday?",
    "actor": { "kind": "user", "id": "usr_sender" },
    "meta": { "threadId": "019a3b70-bbbb-7000-8000-000000000020" }
  },
  "status": "created",
  "tagIds": ["019a1111-0000-7000-8000-000000000030"],
  "dueDate": "2026-10-30T14:30:00.000Z",
  "dueDatePinned": false,
  "createdAt": "2026-10-30T14:00:00.000Z",
  "updatedAt": "2026-10-30T14:00:00.000Z"
}
```

Task with explicit due date:

```json
{
  "id": "019a3b7e-1c2d-7000-8000-000000000002",
  "userId": "usr_assignee",
  "source": {
    "context": "tasks",
    "kind": "task",
    "id": "019a3b7d-cccc-7000-8000-000000000040"
  },
  "preview": {
    "title": "Prepare invoice",
    "body": null,
    "actor": null,
    "meta": {}
  },
  "status": "in_progress",
  "tagIds": ["019a1111-0000-7000-8000-000000000031"],
  "dueDate": "2026-11-02T09:00:00.000Z",
  "dueDatePinned": true,
  "createdAt": "2026-10-29T08:00:00.000Z",
  "updatedAt": "2026-10-30T10:12:00.000Z"
}
```

Task suggestion (inbox):

```json
{
  "id": "019a3b7e-1c2d-7000-8000-000000000003",
  "userId": "usr_suggestee",
  "source": {
    "context": "tasks",
    "kind": "task_suggestion",
    "id": "019a3b7d-dddd-7000-8000-000000000050"
  },
  "preview": {
    "title": "Book venue",
    "body": null,
    "actor": { "kind": "user", "id": "usr_suggester" },
    "meta": {}
  },
  "status": "created",
  "tagIds": [],
  "dueDate": null,
  "dueDatePinned": false,
  "createdAt": "2026-10-30T11:00:00.000Z",
  "updatedAt": "2026-10-30T11:00:00.000Z"
}
```

---

## 3. Endpoints

All: Bearer auth, **users only** (guest sessions → `403 attention-items.guest_not_allowed`).

### `GET /attention-items`

List the caller's items (excludes deleted), newest first (`createdAt DESC`).

**Query** (`ListAttentionItemsQueryDto`):

| Field        | Type   | Required | Constraints                                                                                                    | Default |
| ------------ | ------ | -------- | -------------------------------------------------------------------------------------------------------------- | ------- |
| `status`     | enum   | no       | `created` \| `in_progress` \| `resolved`                                                                       | —       |
| `sourceKind` | string | no       | **New, replaces `type`.** e.g. `message`, `task`, `task_batch`, `task_suggestion`. Unknown value → empty list. | —       |
| `cursor`     | string | no       | ISO date = `createdAt` of the last item received                                                               | —       |
| `limit`      | string | no       | non-negative integer                                                                                           | 50      |

```
GET /attention-items?status=created&sourceKind=message&limit=20
```

**200**: `AttentionItemResponse[]`.

Note: old `type=task` covered tasks **and** batches. Now they are separate kinds — omit
`sourceKind` and filter client-side, or make two calls.

### `GET /attention-items/:id`

**200**: `AttentionItemResponse`. **404** `attention-items.item_not_found` if missing, deleted,
or not the caller's.

### `DELETE /attention-items/:id`

Dismiss the item. **204**, no body. Permanent (see §1). Emits `attention.removed` to the
caller's sockets. **404** as above (also on a second delete).

Does **not** touch the source: deleting a message item doesn't change the message's status.

### ~~`PATCH /attention-items/:id`~~ — removed

Was `{ status?, note?, tagIds? }`. Now `404` (no route). Status → act on the source (§5).
`note` and inbox-side tag edits are gone; edit tags on the source (message / task).

---

## 4. WebSocket events

Both emitted to the owning user's sockets only. Event names unchanged.

### `attention.upserted` — payload reshaped

```json
{ "item": AttentionItemResponse }
```

Same shape as REST (§2). Client: upsert into the store by `item.id`.

Emitted when:

- an item is created or its projected state changes (status, tags, preview, due date) from a source change;
- **new**: a tag-derived due date moves after a tag answer-mode change or a calendar event
  create/update/delete (previously these updated silently — refetch was needed).

Not emitted when nothing changed (idempotent source events), nor for deleted items.

### `attention.removed` — unchanged

```json
{ "id": "019a3b7e-1c2d-7000-8000-000000000001" }
```

Client: drop the item by `id`. See §6 for causes.

### Related, unchanged

- `message.status.updated` `{ threadId, messageId, managedStatus }` — to thread participants.
- WS command `message.updateStatus` — see §5.

---

## 5. Changing an item's status (act on the source)

The item follows asynchronously (outbox, two hops): expect `attention.upserted` shortly after
the source call succeeds. Either wait for it, or update optimistically and let the event
reconcile.

| `source.kind`     | Action                                                                                | Status mapping (source → item)                                        |
| ----------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `message`         | WS command `message.updateStatus` `{ messageId: source.id, status }` (recipient only) | `created`/`in_progress`/`resolved` 1:1                                |
| `task`            | `PATCH /tasks/:id` `{ status: "todo" \| "in_progress" \| "completed" }`               | `todo`→`created`, `in_progress`→`in_progress`, `completed`→`resolved` |
| `task_batch`      | No batch-level status; update child tasks via `PATCH /tasks/:id`                      | Aggregate of children, same mapping                                   |
| `task_suggestion` | `PATCH /task-suggestions/:id` `{ status: "accepted" \| "rejected" }`                  | `pending`→`created`, `accepted`/`rejected`→`resolved`                 |

`message.updateStatus` example:

```json
// emit
{ "messageId": "019a3b7d-aaaa-7000-8000-000000000010", "status": "resolved" }
// ack
{ "ok": true }
```

Navigation from an item:

| `source.kind`     | Target                                              |
| ----------------- | --------------------------------------------------- |
| `message`         | thread `preview.meta.threadId`, message `source.id` |
| `task`            | `GET /tasks/:source.id`                             |
| `task_batch`      | `GET /task-batches/:source.id`                      |
| `task_suggestion` | `GET /task-suggestions/:source.id`                  |

---

## 6. Lifecycle

| Event                                                    | Effect on item                                                            | WS                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------- |
| Message sent with tags (recipient is a user, not sender) | created                                                                   | `attention.upserted`                   |
| Message edited (body / tags) or status changed           | updated                                                                   | `attention.upserted`                   |
| Message untagged                                         | removed                                                                   | `attention.removed`                    |
| Task / batch created or updated with tags                | created / updated                                                         | `attention.upserted`                   |
| Task / batch untagged or deleted                         | removed                                                                   | `attention.removed`                    |
| Suggestion created / edited                              | created / updated (`created`)                                             | `attention.upserted`                   |
| Suggestion accepted / rejected / rescinded               | stays, `resolved`                                                         | `attention.upserted`                   |
| Tag deleted, item left with no tags                      | removed (resolved items stay)                                             | `attention.removed`                    |
| Tag deleted, item still has tags                         | `tagIds` loses it; due date may move                                      | `attention.upserted` if due date moved |
| Tag answer mode / tagged calendar event changed          | tag-derived due date recomputed (not pinned, not resolved)                | `attention.upserted` if moved          |
| User `DELETE`                                            | tombstoned; **ignored by all later source changes** (incl. untag → retag) | `attention.removed`                    |

Edge cases:

- **Guests** never get items (as recipients or callers).
- **Sender** of a tagged message gets no item; only the recipient.
- **Resolved** items stay in the list (filter `status` to hide); tag/calendar changes no longer move their due date.
- Retagging after untag creates a **new** item (new `id`) — unless the user had deleted it.
- No backfill on deploy: an old tagged message/task shows up again only after its next change.

---

## 7. Errors

Domain error body:

```json
{
  "statusCode": 404,
  "error": "attention-items.item_not_found",
  "message": "Attention item with id { id } not found"
}
```

| Code                                | Status | Meaning                                              |
| ----------------------------------- | ------ | ---------------------------------------------------- |
| `attention-items.item_not_found`    | 404    | Missing, deleted, or not the caller's. Unchanged.    |
| `attention-items.guest_not_allowed` | 403    | **New.** Guest session called an attention endpoint. |

Removed codes: `attention-items.forbidden` (not-yours is now 404), `attention-items.item_already_exists`.

---

## 8. TypeScript types

```ts
export type AttentionItemStatus = "created" | "in_progress" | "resolved";

export type AttentionSourceKind =
  | "message"
  | "task"
  | "task_batch"
  | "task_suggestion"
  | (string & {}); // open: future channels

export type AttentionSource = {
  context: string; // "conversations" | "tasks" | …
  kind: AttentionSourceKind;
  id: string;
};

export type AttentionPreview = {
  title: string;
  body: string | null;
  actor: { kind: "user" | "guest"; id: string } | null;
  meta: Record<string, string>; // message: { threadId }
};

export type AttentionItem = {
  id: string;
  userId: string;
  source: AttentionSource;
  preview: AttentionPreview;
  status: AttentionItemStatus;
  tagIds: string[];
  dueDate: string | null;
  dueDatePinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ListAttentionItemsQuery = {
  status?: AttentionItemStatus;
  sourceKind?: string;
  cursor?: string; // last item's createdAt
  limit?: number;
};

// WS
export type AttentionUpsertedEvent = { item: AttentionItem };
export type AttentionRemovedEvent = { id: string };
```

---

## 9. Migration checklist (old → new)

Field mapping:

| Old                                                              | New                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| `type: "tagged_message"`                                         | `source.kind: "message"` (`context: "conversations"`) |
| `type: "task"` + `metadata.taskId`                               | `source.kind: "task"`, `source.id`                    |
| `type: "task"` + `metadata.taskBatchId`                          | `source.kind: "task_batch"`, `source.id`              |
| `type: "suggested_task"`                                         | `source.kind: "task_suggestion"`, `source.id`         |
| `metadata.messageId` / `taskId` / `taskBatchId` / `suggestionId` | `source.id`                                           |
| `metadata.threadId`                                              | `preview.meta.threadId`                               |
| `metadata.senderId` + `senderType`                               | `preview.actor.id` + `preview.actor.kind`             |
| `metadata.suggesterUserId`                                       | `preview.actor.id` (`kind: "user"`)                   |
| `metadata.content`                                               | `preview.body`                                        |
| `metadata.title`                                                 | `preview.title` (messages now also get a title)       |
| `metadata.originalTagIds`                                        | removed — use `tagIds` (always current source tags)   |
| `note`                                                           | removed                                               |
| `sourceCalendarEventId`                                          | removed (internal)                                    |
| —                                                                | `dueDatePinned` (new)                                 |
| query `type`                                                     | query `sourceKind`                                    |

Checklist:

- [ ] Update item model / parsers to §8 types; remove `type`, `metadata`, `note`, `sourceCalendarEventId`.
- [ ] Switch renderers from `type` / `metadata` to `source.kind` / `preview`; add a generic fallback for unknown kinds.
- [ ] Replace `PATCH /attention-items/:id` status actions with source actions (§5).
- [ ] Remove note editing and inbox tag editing UI for items.
- [ ] Rename list filter `type` → `sourceKind`; split `task` filter into `task` + `task_batch`.
- [ ] Handle `attention.upserted` with the new payload; expect extra upserts on due-date moves (drop refetch-on-tag/calendar-change workarounds, if any).
- [ ] Delete UX: tell the user dismiss is permanent for that source.
- [ ] Handle `403 attention-items.guest_not_allowed`; hide inbox for guest sessions.
- [ ] Clear cached attention items on upgrade (server data reset).
- [ ] Optional: show `dueDatePinned` (explicit vs tag-derived due date).
