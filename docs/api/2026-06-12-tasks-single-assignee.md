# API Changes — 2026-06-12 — Tasks (single-assignee rework)

> Frontend integration reference for the tasks/batches/suggestions feature.
> The whole `/tasks`, `/task-batches`, `/task-suggestions` surface is new (uncommitted),
> plus a new `attention.updated` realtime event. Review for accuracy before distributing.

## Summary

- **3 resources**: `/tasks`, `/task-batches`, `/task-suggestions` (REST).
- **1 new realtime event**: `attention.updated` (WebSocket).
- No global route prefix. **Auth**: all routes require the session/bearer auth (global `AuthGuard`); `userId` is taken from the auth context, never the body.

### Core model rules (read first)

- **Single assignee.** Every task and batch has exactly one `assigneeUserId`. There is **no `assigneeUserIds`** anywhere, and the request bodies never accept an assignee — direct create always assigns to **you**.
- **Assignee owns** the task/batch: only the assignee may edit (title/desc/dueDate/status/tags) or delete. The creator keeps **read-only** visibility (GET works; PATCH/DELETE → `403`).
- **Assign to others only via suggestions.** Accepting a suggestion creates real tasks with `createdBy = suggester`, `assigneeUserId = suggestee`.
- **Tags drive scheduling.** A task/batch attention item's `dueDate` is **derived from the assignee's tags** (immediate tag → now + response window; timeblock tag → next tagged calendar occurrence). An explicit `dueDate` **pins** it (won't be moved by later tag/calendar changes). **Untagged → no attention item at all**, even if a `dueDate` is set (tags are the gateway into attention).
- **Batches manage tags + dueDate at the batch level only.** Batched tasks carry title/description/status only — sending `tagIds`/`dueDate` on a batched task → `400`. One attention item per batch (the assignee's).

> ⚠️ **Breaking vs the earlier in-progress tasks API** (if FE already started): `assigneeUserIds` removed everywhere; `suggestedBy` removed from responses; list `assigned_to` scope + `assigneeUserId` query param removed; per-task `dueDate`/assignees removed from batch create (`dueDate` moved to batch level); suggestion task items lost `dueDate`; suggestion `PATCH` `status` is now optional (payload editing added).

---

## Tasks — `/tasks`

### `POST /tasks`

Create a task assigned to **you**. To put it in a batch, pass `batchId` (you must be that batch's assignee).

**Request** (`CreateTaskRequestDto`):
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| title | string | yes | non-empty |
| description | string | no | |
| dueDate | string (ISO-8601 w/ offset) | no | e.g. `"2026-06-20T10:00:00+02:00"`. Pins the due date. |
| tagIds | string[] (uuidv7) | no | must be **your** tags |
| batchId | string (uuidv7) | no | adds task to a batch you assign |

**Rules**: if `batchId` is set, `tagIds`/`dueDate` must be empty/absent → otherwise `400 "Tags and due date are managed at batch level"`.

**Response `201`** (`TaskResponse`):
```json
{
  "id": "01979f...-7000-...",
  "batchId": null,
  "createdBy": "usr_abc",
  "assigneeUserId": "usr_abc",
  "title": "Reply to investor email",
  "description": null,
  "status": "todo",
  "dueDate": "2026-06-20T08:00:00.000Z",
  "tagIds": ["01979f...tag"],
  "createdAt": "2026-06-12T12:00:00.000Z",
  "updatedAt": "2026-06-12T12:00:00.000Z"
}
```
**Side effect**: if tagged, creates a `task` attention item for the assignee (realtime `attention.created`).

| Status | Condition |
|--------|-----------|
| 400 | validation / tag not owned / `tagIds`+`dueDate` on a batched task |
| 403 | adding to a batch you don't assign |

---

### `GET /tasks`

List tasks visible to you.

**Query** (`ListTasksQueryDto`):
| Param | Type | Required | Notes |
|-------|------|----------|-------|
| scope | `created_by_me` \| `assigned_to_me` | yes | (`assigned_to` removed) |
| status | `todo` \| `in_progress` \| `completed` | no | |
| batchId | string (uuidv7) | no | |
| cursor | string (ISO date) | no | keyset: returns items created before cursor |
| limit | string→number | no | default 50 |

**Response `200`**: `TaskResponse[]` (newest first).

---

### `GET /tasks/:id`
Visible to the creator or the assignee. **Response `200`**: `TaskResponse`. `404` if not visible.

---

### `PATCH /tasks/:id`

**Assignee only** (creator → `403`). All fields optional (`PatchTaskRequestDto`):
| Field | Type | Notes |
|-------|------|-------|
| title | string | non-empty |
| description | string \| null | |
| dueDate | string \| **null** | omit = unchanged; **`null` = clear/unpin** (re-derives from tags); string = set + pin |
| status | `todo`\|`in_progress`\|`completed` | |
| tagIds | string[] (uuidv7) | must be the assignee's tags |

**Rules**: on a **batched** task, sending `tagIds` or `dueDate` → `400`. Changing tags/dueDate rebuilds the attention item; status change syncs it.

**Response `200`**: `TaskResponse`. `403` if not assignee; `400` on batched task tag/dueDate edit or unowned tag.

---

### `DELETE /tasks/:id`
**Assignee only** (creator → `403`). **Response `204`**.

---

## Task Batches — `/task-batches`

> A batch holds N child tasks. **Tags + dueDate live on the batch** and produce **one** attention item for the batch assignee. No list endpoint — fetch by id. Batch + its tasks are returned together.

### `POST /task-batches`

Creates a batch assigned to **you** plus its child tasks.

**Request** (`CreateTaskBatchRequestDto`):
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| title | string | yes | |
| description | string | no | |
| dueDate | string (ISO) | no | **batch-level**; pins the batch attention item |
| tagIds | string[] (uuidv7) | no | your tags; drive the batch attention item |
| tasks | `{ title, description? }[]` | yes | ≥1; **title/description only** (no per-task tags/dueDate/assignee) |

**Response `201`** (`TaskBatchResponse`):
```json
{
  "id": "01979f...batch",
  "createdBy": "usr_abc",
  "assigneeUserId": "usr_abc",
  "title": "Q3 launch checklist",
  "description": null,
  "dueDate": "2026-07-01T00:00:00.000Z",
  "tagIds": ["01979f...tag"],
  "tasks": [ /* TaskResponse[] — each batchId=this, assigneeUserId=batch assignee, tagIds:[], dueDate:null */ ],
  "createdAt": "…",
  "updatedAt": "…"
}
```

### `GET /task-batches/:id`
Creator or assignee. **Response `200`**: `TaskBatchResponse` (with `tasks`).

### `PATCH /task-batches/:id`
**Assignee only**. Fields (all optional): `title`, `description` (nullable), `dueDate` (string \| null — null clears), `tagIds`. Tag/dueDate changes rebuild the batch attention item. **Response `200`**: `TaskBatchResponse`.

### `DELETE /task-batches/:id`
**Assignee only**. Soft-deletes the batch + its tasks + the batch attention item. **Response `204`**.

---

## Task Suggestions — `/task-suggestions`

> Propose a task/batch to a network connection, optionally **pre-assigning the suggestee's tags**. They (or you) can edit it while pending; on accept it materializes into real tasks owned by the suggester and assigned to the suggestee (with the proposed tags). The suggestee can re-tag afterward via `PATCH /tasks|/task-batches`.
>
> 💡 To pick the suggestee's tags, fetch them first: **`GET /tags?userId=<suggesteeUserId>`** (network-resolved — works for any active connection). The proposed `tagIds` must belong to the suggestee, or the request → `400`.

### `POST /task-suggestions`

**Request** (`CreateTaskSuggestionRequestDto`):
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| suggesteeUserId | string | yes | active network connection; not yourself |
| payload | object | yes | see below |

**`payload`**:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| kind | `task` \| `batch` | yes | immutable after create |
| title | string | yes | |
| description | string | no | |
| dueDate | string (ISO) | no | **applies to both kinds** (task due date / batch-level due date) |
| tagIds | string[] (uuidv7) | no | **the suggestee's** tags (task-level for `task`, batch-level for `batch`); must belong to the suggestee |
| tasks | `{ title, description? }[]` | for `batch` | ≥1; **no per-task tags/dueDate** |

**Response `201`** (`TaskSuggestionResponse`):
```json
{
  "id": "01979f...sug",
  "suggesterUserId": "usr_me",
  "suggesteeUserId": "usr_you",
  "status": "pending",
  "payload": { "kind": "task", "title": "...", "description": null, "dueDate": null, "tagIds": ["01979f...tag"], "tasks": [] },
  "createdAt": "…",
  "updatedAt": "…"
}
```
**Side effect**: creates a `suggested_task` attention item in the suggestee's inbox (realtime `attention.created`).

### `GET /task-suggestions`
**Query**: `role` = `sent` | `received` (required); `status` = `pending`|`accepted`|`rejected` (optional). **Response `200`**: `TaskSuggestionResponse[]`.

### `GET /task-suggestions/:id`
Suggester or suggestee. **Response `200`**: `TaskSuggestionResponse`.

### `PATCH /task-suggestions/:id` — two mutually-exclusive modes

Send **either** a status transition **or** payload-edit fields, never both (mixed → `400`; empty → `400`).

**(a) Lifecycle** — `{ "status": "accepted" | "rejected" }`
- `accepted`: **suggestee only**, must be pending. Materializes the payload into real task(s) (`createdBy`=suggester, `assigneeUserId`=suggestee, **tagged with `payload.tagIds`**) and resolves the inbox item. If a proposed tag was deleted since suggesting → `400 "One or more tags not found"` (edit the payload to drop it, then accept).
- `rejected`: **suggestee only**, must be pending.

**(b) Edit pending payload** — any of `{ title?, description?(nullable), dueDate?(string|null), tagIds?, tasks? }`
- Allowed for **both** the suggester and the suggestee while `pending`.
- `kind` immutable; `tagIds` must belong to the suggestee (else `400`); `tasks` only valid for `batch` suggestions (else `400`); a batch must keep ≥1 task.
- Resyncs the suggestee's inbox attention item title + dueDate → realtime **`attention.updated`**. (The inbox item stays untagged; proposed tags live in the payload.)

**Response `200`**: `TaskSuggestionResponse`. Errors: `400` mixed/empty/invalid edit, `403` not a party, `400` "Suggestion is not pending".

### `DELETE /task-suggestions/:id`
Suggester rescinds a pending suggestion (resolves the inbox item). **Response `204`**.

---

## WebSocket (realtime)

Events are emitted to the recipient's user room. Payload is always `{ item: AttentionItem }`.

| Event | When | Status |
|-------|------|--------|
| `attention.created` | new attention item (tagged message, **tagged task/batch**, or new suggestion inbox item) | existing |
| `attention.updated` | **NEW** — task/batch status sync, or a pending suggestion's payload edit (title/dueDate) | **new** |

> Note: background due-date recomputes triggered by calendar/tag edits update the row but do **not** emit a socket event (same as today's message behavior) — refetch on those flows if needed.

**`AttentionItem`** payload shape (unchanged except `type` now includes `"task"` and metadata gained task fields):
```ts
{
  id: string;
  userId: string;
  type: "tagged_message" | "incoming_email" | "slack_message"
      | "whatsapp_message" | "suggested_timeblock" | "suggested_task" | "task";
  status: "created" | "in_progress" | "resolved";
  dueDate: string | null;          // ISO
  note: string | null;
  metadata: {
    type: string;                  // same enum as `type`
    // tagged_message: messageId, threadId, senderId, senderType, content, originalTagIds
    // task:           title, taskId | taskBatchId
    // suggested_task: title, suggestionId, suggesterUserId
    title?: string;
    taskId?: string;
    taskBatchId?: string;
    suggestionId?: string;
    suggesterUserId?: string;
    // …message fields (optional)
  };
  tagIds: string[];
  sourceCalendarEventId: string | null;
  createdAt: string;
  updatedAt: string;
}
```
> `dueDatePinned` is intentionally **not** exposed — it's server-internal. If you ever need a "pinned" badge, ask backend to surface it.

**Attention REST** (`GET /attention-items?type=…`) now also accepts `type=task`.
