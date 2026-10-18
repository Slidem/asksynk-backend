# API Changes — 2026-10-18 — Timer: commands, focus sessions, transition table

> Generated from the working-tree diff (base `ebb4c63`) and the implementation. Review for
> accuracy before distributing. Every payload below matches the code; the
> `GET /timers/transitions` body is dumped from the real rule table.

## Summary

- **Modified**: `GET /timers`, `PATCH /timers`, `GET /timers/settings`, `PUT /timers/settings`
- **New**: `GET /timers/transitions`
- **Removed**: `GET /timers/suggestion`
- **WebSocket**: `timer.completed` payload changed; new `timer.session_ended`
- **Breaking changes: yes, all timer endpoints.** See [Migration checklist](#11-migration-checklist-old--new).
  On deploy every existing timer is reset to `idle` and the old timer log is discarded.

Contents:

1. [Concepts](#1-concepts)
2. [State machine](#2-state-machine)
3. [Automatic changes (triggers) and their order](#3-automatic-changes-triggers-and-their-order)
4. [`TimerResponse` reference](#4-timerresponse-reference)
5. [Endpoints](#5-endpoints)
6. [WebSocket events](#6-websocket-events)
7. [Errors](#7-errors)
8. [Client implementation guide](#8-client-implementation-guide)
9. [Edge cases](#9-edge-cases-the-client-must-handle)
10. [TypeScript types](#10-typescript-types-for-the-client)
11. [Migration checklist (old → new)](#11-migration-checklist-old--new)

---

## 1. Concepts

| Term | Meaning |
| --- | --- |
| **Mode** | What a block is: `focus`, `short_break`, `long_break`. Replaces the old "session type". |
| **Block** | One run of a mode (e.g. one 25-min focus). Its duration **always comes from settings** (the session's snapshot); the client never sends a duration. |
| **Session** | A series of blocks over a period of time (a "work session"). Created **lazily on the first `start`** (always a `focus` start). Ends only by a **reset**: manual (`reset` command), **inactivity**, or a **settings change**. A `stop` does **not** end it. |
| **Session settings snapshot** | The durations + long-break interval the session runs with, copied from the user's settings when the session is created. Block durations are read from it. |
| **Long-break countdown** | `focusBlocksUntilLongBreak`: set to `longBreakInterval` when a session starts; −1 (never below 0) per completed **or skipped** focus block; reset to `longBreakInterval` whenever a `long_break` starts (even early). `short_break` doesn't change it. |
| **Command** | What the client asks: `start` (+ `mode`), `pause`, `resume`, `stop`, `reset`. Sent to `PATCH /timers`. |
| **Trigger** | What changes the timer without a command: `timeout` (block ran out), `inactivity` (session idle too long), `settings_changed`. |

One timer per user. Statuses: `idle`, `running`, `paused`, `completed` (**`stopped` no longer exists**).

---

## 2. State machine

The full machine is served by [`GET /timers/transitions`](#get-timerstransitions) and the
per-state subset by `allowedCommands` on every `TimerResponse`. The server enforces exactly
this table; anything not in it → `409 timers.invalid_transition`.

### 2.1 Commands by state

| From state | `start(mode)` | `pause` | `resume` | `stop` | `reset` |
| --- | --- | --- | --- | --- | --- |
| `idle`, **no session** | `focus` only → `running`, **creates a session** | ✗ | ✗ | ✗ | 200 no-op (stays idle) |
| `idle`, session attached (after a `stop`) | any mode → `running` | ✗ | ✗ | ✗ | ends session → `idle`, no session |
| `running` | **skip**: focus → `short_break`/`long_break`, or break → `focus` → `running` | → `paused` | ✗ | abandons block → `idle` (session kept) | abandons block, ends session → `idle` |
| `paused` | **skip** (same rule as running) → `running` | ✗ | → `running` | abandons block → `idle` (session kept) | abandons block, ends session → `idle` |
| `completed` | any mode → `running` | ✗ | ✗ | → `idle` (session kept, nothing logged) | ends session → `idle` |

✗ = `409 timers.invalid_transition`.

### 2.2 What each effect means

| Effect | Meaning |
| --- | --- |
| **start** (block) | New block: `mode` set, `remainingSeconds = blockDurationSeconds` (from the session snapshot), `completesAt = now + duration`. A `short_break`/`long_break` start increments the session's `shortBreaks`/`longBreaks`. A `long_break` start resets `focusBlocksUntilLongBreak` to `longBreakInterval`. |
| **skip** (block) | Start while `running`/`paused`. Only focus ↔ break. Same mode (`focus → focus`) or break ↔ break (`short_break ↔ long_break`) is rejected. The replaced block is logged as `skipped`. **A skipped focus block counts exactly like a completed one**: `session.completedFocusBlocks + 1`, countdown − 1. A skipped break counts nothing extra (breaks count when they start). Then a normal block start. |
| **abandon** (block) | The active block is dropped. **Nothing is counted.** Logged as `stopped`. |
| **complete** (block) | Block ran out (`timeout`). `status = completed`, `remainingSeconds = 0`. A focus block: `completedFocusBlocks + 1`, countdown − 1. |
| **create** (session) | New session from the user's **current** settings; countdown = `longBreakInterval`. |
| **keep** (session) | Same session (same `session.id`). |
| **end** (session) | Session closed (`finishedAt`, `endReason`); timer becomes `idle` with `session: null`, `focusBlocksUntilLongBreak: null`. The next `start` must be `focus` and opens a new session. |

### 2.3 Counters (on `session`)

| Field | Counts |
| --- | --- |
| `completedFocusBlocks` | Focus blocks that **completed or were skipped**. Stopped/abandoned ones don't count. |
| `shortBreaks`, `longBreaks` | Breaks **started** (counted at start, whether or not they finish). |

Skipped vs naturally completed is only distinguishable in the server-side timer log (not
exposed via API yet).

---

## 3. Automatic changes (triggers) and their order

Before applying **any** command, and on every `GET /timers`, the server applies due triggers
in this order (`triggerOrder` in `GET /timers/transitions`):

1. **`timeout`** — if `status === "running"` and `now >= completesAt`: the block completes
   (`status: completed`). Its completion time is `completesAt` (not when it was noticed), and
   `lastActivityAt = completesAt`.
2. **`inactivity`** — if a session is attached, `status !== "running"`, the user's
   `inactivityTimeoutSeconds` is not `null`, and `now − lastActivityAt > inactivityTimeoutSeconds`:
   the session ends with reason `inactivity`. A paused block is abandoned. The session's
   `finishedAt` is **`lastActivityAt`** (when the user was last active), not detection time.

Then the command is matched against the **resulting** state. Consequences:

- `pause` at/after 00:00 → the block completes first → `pause` on `completed` → **409**.
- `resume` after the inactivity window → session already reset → `resume` on `idle` → **409**.
- `start short_break` after a focus block ran out → completes naturally (logged `completed`, not `skipped`), then starts the break normally.

A **running** block is never inactive. Inactivity is also applied by a server sweep every 5
minutes (so sessions close even if the user never comes back), which pushes
`timer.session_ended` over WebSocket.

**`settings_changed`** happens only via `PUT /timers/settings` (see there).

---

## 4. `TimerResponse` reference

Returned by `GET /timers` and `PATCH /timers`.

```json
{
  "id": "019a0f3c-7c1e-7d2a-9b8e-2f4c6a1e0b11",
  "userId": "user_123",
  "status": "running",
  "mode": "focus",
  "blockDurationSeconds": 1500,
  "remainingSeconds": 1320,
  "completesAt": "2026-10-18T10:25:00.000Z",
  "transitionedAt": "2026-10-18T10:00:00.000Z",
  "lastActivityAt": "2026-10-18T10:00:00.000Z",
  "suggestedNextMode": "short_break",
  "allowedCommands": [
    { "command": "start", "modes": ["short_break", "long_break"] },
    { "command": "pause" },
    { "command": "stop" },
    { "command": "reset" }
  ],
  "focusBlocksUntilLongBreak": 3,
  "session": {
    "id": "019a0f3c-7c1e-7d2a-9b8e-2f4c6a1e0b99",
    "startedAt": "2026-10-18T09:30:00.000Z",
    "completedFocusBlocks": 1,
    "shortBreaks": 1,
    "longBreaks": 0,
    "settings": {
      "focusDurationSeconds": 1500,
      "shortBreakDurationSeconds": 300,
      "longBreakDurationSeconds": 900,
      "longBreakInterval": 4
    }
  },
  "createdAt": "2026-10-01T08:00:00.000Z",
  "updatedAt": "2026-10-18T10:00:00.000Z"
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `id`, `userId` | string | Timer id (one per user), owner. |
| `status` | `"idle" \| "running" \| "paused" \| "completed"` | |
| `mode` | `TimerMode \| null` | Current/last block's mode. `null` when `idle`. |
| `blockDurationSeconds` | number \| null | Full duration of the current block (from the session snapshot). `null` when `idle`. |
| `remainingSeconds` | number \| null | Running: live remaining whole seconds **at response time** (remaining at the last transition − whole seconds elapsed, ≥ 0; i.e. `ceil((completesAt − now)/1000)`). Paused: frozen value. Completed: `0`. Idle: `null`. |
| `completesAt` | ISO string \| null | Absolute end time; **only when `running`**. Use this for the countdown. |
| `transitionedAt` | ISO string \| null | Start of the current run span (block start or last resume); pause time when paused. Kept after completion. `null` when idle. |
| `lastActivityAt` | ISO string \| null | Last state change (completion = its due time). Inactivity is measured from it. `null` only for a timer never used. |
| `suggestedNextMode` | `TimerMode` | `idle` → `focus`. Current/last block is a break → `focus`. Current/last block is `focus` → `long_break` if this block brings the countdown to 0 (running/paused: `focusBlocksUntilLongBreak − 1 ≤ 0`; completed: `focusBlocksUntilLongBreak === 0`), else `short_break`. A suggestion only; the user may pick any allowed mode. |
| `allowedCommands` | `{ command, modes? }[]` | Commands accepted from the current state. `modes` present for `start` only = the modes it accepts. **No-op commands are omitted** (no `reset` when there's no session). Order: start, pause, resume, stop, reset (as applicable). |
| `focusBlocksUntilLongBreak` | number \| null | Long-break countdown (see [Concepts](#1-concepts)). `null` without a session. |
| `session` | object \| null | Open session, or `null`. |
| `session.id` | string | uuidv7. Changes only when a new session starts. |
| `session.startedAt` | ISO string | First `start` of the session. |
| `session.completedFocusBlocks` / `shortBreaks` / `longBreaks` | number | See [2.3 Counters](#23-counters-on-session). |
| `session.settings` | object | Snapshot the session runs with. Durations in seconds. |
| `createdAt`, `updatedAt` | ISO string | |

### 4.1 Field presence per state

| | idle, no session | idle, session | running | paused | completed |
| --- | --- | --- | --- | --- | --- |
| `mode` | null | null | ✓ | ✓ | ✓ |
| `blockDurationSeconds` | null | null | ✓ | ✓ | ✓ |
| `remainingSeconds` | null | null | live | frozen | 0 |
| `completesAt` | null | null | ✓ | null | null |
| `transitionedAt` | null | null | ✓ | ✓ | ✓ |
| `focusBlocksUntilLongBreak` | null | ✓ | ✓ | ✓ | ✓ |
| `session` | null | ✓ | ✓ | ✓ | ✓ |
| `allowedCommands` | start [focus] | start [all], reset | start [opposite], pause, stop, reset | start [opposite], resume, stop, reset | start [all], stop, reset |

"start [opposite]" = `["short_break","long_break"]` during focus, `["focus"]` during a break.

---

## 5. Endpoints

All endpoints: **Bearer token required**; guests get `403 timers.guest_not_allowed`. No URL
prefix (paths are as written). Request bodies are validated with `whitelist: true`:
**unknown fields are silently dropped** (e.g. an old `durationSeconds` is ignored, an old
`status` field leaves `command` missing → 400).

### `GET /timers`

**Description**: Current user's timer. Lazily creates an idle timer (and default settings) on
first call. **Has side effects**: applies due triggers first ([section 3](#3-automatic-changes-triggers-and-their-order)) —
may complete an overdue block or end an inactive session (both persisted, logged, and pushed
over WS).

**Success** `200`: [`TimerResponse`](#4-timerresponse-reference).

Fresh user:

```json
{
  "id": "019a…", "userId": "user_123",
  "status": "idle", "mode": null,
  "blockDurationSeconds": null, "remainingSeconds": null,
  "completesAt": null, "transitionedAt": null, "lastActivityAt": null,
  "suggestedNextMode": "focus",
  "allowedCommands": [{ "command": "start", "modes": ["focus"] }],
  "focusBlocksUntilLongBreak": null,
  "session": null,
  "createdAt": "…", "updatedAt": "…"
}
```

**Errors**: `401`, `403 timers.guest_not_allowed`.

---

### `PATCH /timers`

**Description**: The single control endpoint. Applies triggers first, then the command.
One transaction: state, session, log, WS events and the completion job change together.

**Request Body** (`TimerCommandDto`):

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `command` | enum | yes | `"start" \| "pause" \| "resume" \| "stop" \| "reset"` |
| `mode` | enum | for `start` only | `"focus" \| "short_break" \| "long_break"`. **Required** with `start`, **rejected** (400) with any other command. |

There is no duration field: the block duration is the session snapshot's value for `mode`
(for the first `start` of a session: the user's current settings).

**Examples**:

```json
{ "command": "start", "mode": "focus" }
{ "command": "start", "mode": "short_break" }
{ "command": "pause" }
{ "command": "resume" }
{ "command": "stop" }
{ "command": "reset" }
```

**Success** `200`: [`TimerResponse`](#4-timerresponse-reference) after the change.

Per command:

| Command | From | Result |
| --- | --- | --- |
| `start` `focus` | idle, no session | `running`, new `session` (counters 0, snapshot of current settings), `focusBlocksUntilLongBreak = longBreakInterval` |
| `start` any | idle with session / completed | `running`; break starts bump `shortBreaks`/`longBreaks`; `long_break` resets the countdown |
| `start` opposite kind | running / paused | **skip**: old block logged `skipped` (focus counts as completed, countdown −1), new block `running` |
| `pause` | running | `paused`, `remainingSeconds` frozen, `completesAt: null` |
| `resume` | paused | `running`, `completesAt = now + remainingSeconds` |
| `stop` | running / paused | `idle`, `mode: null`, **`session` unchanged**, nothing counted |
| `stop` | completed | `idle`, session unchanged |
| `reset` | session attached | `idle`, `session: null`, `focusBlocksUntilLongBreak: null`; active block abandoned; pushes `timer.session_ended` (`reason: "manual_reset"`) |
| `reset` | no session | `200`, unchanged idle timer (no-op) |

Example — skip from a running focus block (100 s in) to a short break:

```json
// PATCH /timers  { "command": "start", "mode": "short_break" }
{
  "status": "running",
  "mode": "short_break",
  "blockDurationSeconds": 300,
  "remainingSeconds": 300,
  "completesAt": "2026-10-18T10:06:40.000Z",
  "focusBlocksUntilLongBreak": 3,
  "suggestedNextMode": "focus",
  "allowedCommands": [
    { "command": "start", "modes": ["focus"] },
    { "command": "pause" }, { "command": "stop" }, { "command": "reset" }
  ],
  "session": { "id": "019a…", "completedFocusBlocks": 1, "shortBreaks": 1, "longBreaks": 0, "…": "…" },
  "…": "…"
}
```

**Errors**:

| Status | `error` | When |
| --- | --- | --- |
| 400 | *(Nest validation)* | `command` missing/unknown, `mode` not a valid mode. Body: `{ "statusCode": 400, "message": ["command must be one of the following values: …"], "error": "Bad Request" }` |
| 400 | `timers.invalid_command_input` | `start` without `mode` (`"Invalid timer command; reason: mode is required to start"`), or `mode` with another command (`"… reason: mode is only valid with start"`) |
| 409 | `timers.invalid_transition` | Command (or mode) not allowed from the current state **after triggers**. Message e.g. `"Timer can't start short_break while idle (current mode: none)"`, `"Timer can't pause while completed (current mode: focus)"` |
| 409 | `core.concurrency_conflict` | Lost a race with a concurrent change (completion job, inactivity sweep, another device). Refetch and retry if still intended. |
| 403 | `timers.guest_not_allowed` | Guest actor |

---

### `GET /timers/transitions`

**Description**: The complete, static state machine. **Identical for every user and every
timer state** — fetch once and cache. Response header:
`Cache-Control: private, max-age=3600`. Use it for optimistic updates (see
[8.3](#83-optimistic-updates)); use `allowedCommands` to enable/disable controls.

**Success** `200` (`TimerTransitionsResponse`, exact current payload):

```json
{
  "statuses": ["idle", "running", "paused", "completed"],
  "modes": ["focus", "short_break", "long_break"],
  "commands": ["start", "pause", "resume", "stop", "reset"],
  "triggers": ["timeout", "inactivity", "settings_changed"],
  "triggerOrder": ["timeout", "inactivity"],
  "transitions": [
    {"from":"idle","session":"none","on":{"command":"start","modes":["focus"]},"to":"running","sessionEffect":"create","blockEffect":"start"},
    {"from":"idle","session":"none","on":{"command":"reset"},"to":"idle","sessionEffect":"keep","blockEffect":"none","noop":true},
    {"from":"idle","session":"attached","on":{"command":"start","modes":["focus","short_break","long_break"]},"to":"running","sessionEffect":"keep","blockEffect":"start"},
    {"from":"idle","session":"attached","on":{"command":"reset"},"to":"idle","sessionEffect":"end","blockEffect":"none"},
    {"from":"running","fromModes":["focus"],"on":{"command":"start","modes":["short_break","long_break"]},"to":"running","sessionEffect":"keep","blockEffect":"skip"},
    {"from":"running","fromModes":["short_break","long_break"],"on":{"command":"start","modes":["focus"]},"to":"running","sessionEffect":"keep","blockEffect":"skip"},
    {"from":"running","on":{"command":"pause"},"to":"paused","sessionEffect":"keep","blockEffect":"none"},
    {"from":"running","on":{"command":"stop"},"to":"idle","sessionEffect":"keep","blockEffect":"abandon"},
    {"from":"running","on":{"command":"reset"},"to":"idle","sessionEffect":"end","blockEffect":"abandon"},
    {"from":"paused","fromModes":["focus"],"on":{"command":"start","modes":["short_break","long_break"]},"to":"running","sessionEffect":"keep","blockEffect":"skip"},
    {"from":"paused","fromModes":["short_break","long_break"],"on":{"command":"start","modes":["focus"]},"to":"running","sessionEffect":"keep","blockEffect":"skip"},
    {"from":"paused","on":{"command":"resume"},"to":"running","sessionEffect":"keep","blockEffect":"none"},
    {"from":"paused","on":{"command":"stop"},"to":"idle","sessionEffect":"keep","blockEffect":"abandon"},
    {"from":"paused","on":{"command":"reset"},"to":"idle","sessionEffect":"end","blockEffect":"abandon"},
    {"from":"completed","on":{"command":"start","modes":["focus","short_break","long_break"]},"to":"running","sessionEffect":"keep","blockEffect":"start"},
    {"from":"completed","on":{"command":"stop"},"to":"idle","sessionEffect":"keep","blockEffect":"none"},
    {"from":"completed","on":{"command":"reset"},"to":"idle","sessionEffect":"end","blockEffect":"none"},
    {"from":"running","on":{"trigger":"timeout"},"to":"completed","sessionEffect":"keep","blockEffect":"complete"},
    {"from":"paused","session":"attached","on":{"trigger":"inactivity"},"to":"idle","sessionEffect":"end","blockEffect":"abandon"},
    {"from":"completed","session":"attached","on":{"trigger":"inactivity"},"to":"idle","sessionEffect":"end","blockEffect":"none"},
    {"from":"idle","session":"attached","on":{"trigger":"inactivity"},"to":"idle","sessionEffect":"end","blockEffect":"none"},
    {"from":"running","session":"attached","on":{"trigger":"settings_changed"},"to":"idle","sessionEffect":"end","blockEffect":"abandon"},
    {"from":"paused","session":"attached","on":{"trigger":"settings_changed"},"to":"idle","sessionEffect":"end","blockEffect":"abandon"},
    {"from":"completed","session":"attached","on":{"trigger":"settings_changed"},"to":"idle","sessionEffect":"end","blockEffect":"none"},
    {"from":"idle","session":"attached","on":{"trigger":"settings_changed"},"to":"idle","sessionEffect":"end","blockEffect":"none"}
  ]
}
```

**Transition fields**:

| Field | Type | Meaning |
| --- | --- | --- |
| `from` | status | Current status the row applies to. |
| `session` | `"none" \| "attached"`, optional | Required session presence. **Omitted = matches either.** |
| `fromModes` | mode[], optional | Current block's mode must be one of these. **Omitted = any.** |
| `on.command` | command, optional | Row is a command row. Exactly one of `on.command` / `on.trigger` is set. |
| `on.modes` | mode[], optional | For `start` rows: the `mode`s accepted. |
| `on.trigger` | trigger, optional | Row is an automatic transition. |
| `to` | status | Resulting status. |
| `sessionEffect` | `"create" \| "keep" \| "end"` | See [2.2](#22-what-each-effect-means). |
| `blockEffect` | `"start" \| "skip" \| "abandon" \| "complete" \| "none"` | See [2.2](#22-what-each-effect-means). `none` on pause/resume = block continues. |
| `noop` | `true`, optional | Accepted (200) but changes nothing. Never listed in `allowedCommands`. |

**Matching rule**: a command is allowed iff exactly one row matches `from`, `session` (if
set), `fromModes` (if set), `on.command`, and (for `start`) `mode ∈ on.modes`. Rows never
overlap.

**Errors**: `401`, `403 timers.guest_not_allowed`.

---

### `GET /timers/settings`

**Description**: Current user's timer settings (defaults created lazily).

**Success** `200` (`TimerSettingsResponse`):

```json
{
  "focusDurationSeconds": 1500,
  "shortBreakDurationSeconds": 300,
  "longBreakDurationSeconds": 900,
  "longBreakInterval": 4,
  "inactivityTimeoutSeconds": 3600
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `focusDurationSeconds` / `shortBreakDurationSeconds` / `longBreakDurationSeconds` | number | Block durations for **new** sessions. |
| `longBreakInterval` | number | Focus blocks per long break (countdown start value). |
| `inactivityTimeoutSeconds` | number \| null | **New.** Idle time (timer not running) after which the open session is reset automatically. `null` = never. Default `3600`. |

**Errors**: `401`, `403`.

---

### `PUT /timers/settings`

**Description**: Replaces all settings (full body every time). **If a session is open and
any of the four duration/interval fields differs from the session's snapshot, the session
ends** (reason `settings_changed`): the active block (running or paused) is abandoned, the
timer becomes `idle` with no session, and `timer.session_ended` is pushed. Changing **only**
`inactivityTimeoutSeconds` never ends a session; neither does a PUT with unchanged values.
Before that, due triggers are applied as usual (with the new timeout).

**Request Body** (`UpdateTimerSettingsDto`) — all fields required:

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `focusDurationSeconds` | integer | yes | 1 – 86400 |
| `shortBreakDurationSeconds` | integer | yes | 1 – 86400 |
| `longBreakDurationSeconds` | integer | yes | 1 – 86400 |
| `longBreakInterval` | integer | yes | 1 – 50 |
| `inactivityTimeoutSeconds` | integer \| null | **yes (key must be present)** | `null`, or 3600 – 86400 (60 min – 24 h). Omitting it → 400. |

**Example Request**:

```json
{
  "focusDurationSeconds": 1500,
  "shortBreakDurationSeconds": 300,
  "longBreakDurationSeconds": 900,
  "longBreakInterval": 4,
  "inactivityTimeoutSeconds": null
}
```

**Success** `200`: the saved `TimerSettingsResponse`. **The response does not include the
timer**: after a PUT that changed durations/interval, refetch `GET /timers` (or rely on the
`timer.session_ended` push).

**Errors**:

| Status | `error` | When |
| --- | --- | --- |
| 400 | *(Nest validation)* | Out of range, non-integer, missing field (incl. missing `inactivityTimeoutSeconds`) |
| 409 | `core.concurrency_conflict` | Raced a concurrent timer change while ending the session; retry |
| 403 | `timers.guest_not_allowed` | Guest |

---

### ~~`GET /timers/suggestion`~~ — removed

Use `TimerResponse.suggestedNextMode` and `focusBlocksUntilLongBreak` (and
`session.settings.longBreakInterval` if you need the interval).

---

## 6. WebSocket events

Socket.io, default namespace. Events are emitted to the user's room — **every connected
device of the user, including the one that caused the change** (no origin filtering yet).
The payload is the raw object below (no envelope). Delivery is best effort (missed while
disconnected) — always resync with `GET /timers` on reconnect.

Only these two timer events are pushed. **Starts, pauses, resumes, skips and stops are not
pushed** — another device sees them only on its next `GET /timers` (unchanged from before).

### `timer.completed`

When a block runs out (by the server's completion job, or lazily when a `GET`/command
notices it). Payload changed:

```json
{
  "userId": "user_123",
  "sessionId": "019a0f3c-7c1e-7d2a-9b8e-2f4c6a1e0b99",
  "eventType": "completed",
  "mode": "focus",
  "durationSeconds": 1500,
  "remainingSeconds": 0,
  "reason": null,
  "occurredAt": "2026-10-18T10:25:00.000Z"
}
```

| Field | Notes |
| --- | --- |
| `mode` | **Was `sessionType`.** |
| `durationSeconds` | **Was `sessionDurationSeconds`.** |
| `sessionId` | **New.** |
| `reason` | **New.** Always `null` for `completed`. |
| `occurredAt` | The block's due time (`completesAt`), even if noticed later. |

### `timer.session_ended` (new)

When a session ends for any reason: `reset` command, inactivity (lazy or sweep), or settings
change.

```json
{
  "userId": "user_123",
  "sessionId": "019a0f3c-7c1e-7d2a-9b8e-2f4c6a1e0b99",
  "reason": "inactivity",
  "finishedAt": "2026-10-18T10:41:12.000Z"
}
```

| Field | Values |
| --- | --- |
| `reason` | `"manual_reset" \| "inactivity" \| "settings_changed"` |
| `finishedAt` | When the session ended. For `inactivity`: the last activity time (in the past). |

**Client action**: if `sessionId` is the session you display, switch to `idle` / no session
(or just refetch `GET /timers`).

---

## 7. Errors

Domain errors have this body:

```json
{ "statusCode": 409, "error": "timers.invalid_transition", "message": "Timer can't resume while idle (current mode: none)" }
```

Validation (DTO) errors use Nest's shape:
`{ "statusCode": 400, "message": ["…"], "error": "Bad Request" }`.

| Code | Status | Meaning |
| --- | --- | --- |
| `timers.invalid_transition` | 409 | Command/mode not allowed from the current state (after triggers). Replaces `timers.timer_not_running`, `timers.timer_not_paused`, `timers.no_active_timer`. |
| `timers.invalid_command_input` | 400 | `start` without `mode`, or `mode` with a non-start command. Replaces `timers.invalid_session_input`. |
| `timers.guest_not_allowed` | 403 | Unchanged. |
| `core.concurrency_conflict` | 409 | Concurrent modification; refetch, then retry if still valid. |

Removed codes: `timers.unsupported_status`, `timers.timer_not_running`,
`timers.timer_not_paused`, `timers.no_active_timer`, `timers.invalid_session_input`.

**On any 409**: discard the optimistic state, `GET /timers`, re-render from it.

---

## 8. Client implementation guide

### 8.1 What to fetch

| Data | When |
| --- | --- |
| `GET /timers/transitions` | Once per app session (cacheable 1 h). Static. |
| `GET /timers/settings` | On load / settings screen. Needed for optimistic `start` without a session (durations) and to emulate inactivity (`inactivityTimeoutSeconds`). |
| `GET /timers` | On load, on WS reconnect, on app focus/visibility, after `PUT /timers/settings`, after any 409, on `timer.session_ended`. |

### 8.2 Rendering

- **Buttons**: render from `allowedCommands` only. `start` buttons: one per entry in its
  `modes`; highlight `suggestedNextMode`. No `reset` entry → hide/disable "reset session".
- **Countdown**: when `running`, compute `completesAt − now` locally each tick; don't
  decrement `remainingSeconds`. When `paused`, show `remainingSeconds`. When `completed`, 0.
- **Clock skew**: the response has no server time. If needed, estimate the server clock at
  response time as `completesAt − remainingSeconds` (running only).
- **At 00:00 locally**: treat the block as completed (status `completed`, `remainingSeconds:
  0`, allowed commands = the `completed` set). Don't offer `pause`: the server would reject
  it. Expect `timer.completed` shortly (or refetch).
- **Session panel**: `session.completedFocusBlocks`, `shortBreaks`, `longBreaks`,
  `startedAt`; "N focus blocks until long break" = `focusBlocksUntilLongBreak`. No session →
  show "no active session" (next start is focus).

### 8.3 Optimistic updates

With the cached transition table, settings and the last `TimerResponse`:

1. **Apply triggers locally**, in `triggerOrder`:
   - `timeout`: `running` and `now ≥ completesAt` → `completed`, `remainingSeconds: 0`,
     `lastActivityAt = completesAt`; if `mode === "focus"`: `completedFocusBlocks + 1`,
     countdown `max(0, n − 1)`.
   - `inactivity`: session attached, not `running`, `inactivityTimeoutSeconds !== null`,
     `now − lastActivityAt > inactivityTimeoutSeconds` → `idle`, `mode: null`, `session: null`,
     `focusBlocksUntilLongBreak: null`.
2. **Find the row**: `from === status`; `session` matches (`"none"` ⇔ `session === null`);
   `fromModes` contains `mode` if set; `on.command === command`; for `start`,
   `on.modes` contains the chosen mode. No row → don't send (the button shouldn't exist).
   `noop` row → nothing to do (you may skip the request).
3. **Apply the row** (counters are optional; the response will correct them):

   | Row | Local change |
   | --- | --- |
   | `sessionEffect: create` | `session = { id: <temp>, startedAt: now, counters 0, settings: <current settings minus timeout> }`, `focusBlocksUntilLongBreak = longBreakInterval` |
   | `blockEffect: skip` | If old `mode === "focus"`: `completedFocusBlocks + 1`, countdown −1 (min 0). Then as `start`. |
   | `blockEffect: start` | `status: running`, `mode`, `blockDurationSeconds = session.settings[duration for mode]`, `remainingSeconds = blockDurationSeconds`, `completesAt = now + duration`, `transitionedAt = lastActivityAt = now`; `short_break`/`long_break` → `shortBreaks`/`longBreaks + 1`; `long_break` → countdown = `session.settings.longBreakInterval` |
   | `pause` | `status: paused`, `remainingSeconds = max(0, ceil((completesAt − now) / 1000))`, `completesAt: null`, `transitionedAt = lastActivityAt = now` |
   | `resume` | `status: running`, `completesAt = now + remainingSeconds`, `transitionedAt = lastActivityAt = now` |
   | `blockEffect: abandon` / `stop` | `status: idle`, `mode: null`, `blockDurationSeconds/remainingSeconds/completesAt/transitionedAt: null` |
   | `sessionEffect: end` | additionally `session: null`, `focusBlocksUntilLongBreak: null` |

   Then recompute `allowedCommands` from the table for the new state (drop `noop` rows, merge
   `start` modes) and `suggestedNextMode` per [section 4](#4-timerresponse-reference).
4. **Send** `PATCH /timers`. On `200` replace local state with the response (authoritative:
   real `session.id`, exact counters/times). On `409`/error: refetch `GET /timers` and replace.

### 8.4 Duration mapping

```ts
const durationFor = (s: TimerSettingsSnapshot, mode: TimerMode) =>
  mode === "focus" ? s.focusDurationSeconds
  : mode === "short_break" ? s.shortBreakDurationSeconds
  : s.longBreakDurationSeconds;
```

Use `session.settings` when a session exists; use the user's settings only when the start
creates the session.

---

## 9. Edge cases the client must handle

| Case | Server behaviour | Client |
| --- | --- | --- |
| Pause at/after 00:00 | Block completes first → `409 invalid_transition` | Hide pause at 00:00; on 409 refetch |
| Stop at/after 00:00 | Completes, then `stop` from `completed` → `idle` (200) | Fine |
| Skip after the block already ran out | Logged `completed` (not skipped), break starts normally (200) | Fine |
| Resume after the inactivity window | Session reset first → `409` | Refetch; you likely already got `timer.session_ended` |
| Reset without a session | 200, unchanged | No reset button is offered anyway |
| `start` break with no session | 409 (a new session must start with focus) | Only `focus` is in `allowedCommands` |
| `start` same mode while running (focus → focus) | 409 | Not offered |
| `short_break` ↔ `long_break` while running/paused | 409 | Not offered |
| Focus → focus after **completion** | Allowed (skips the break) | Offered in `completed` |
| Stop, then start a break | Allowed: session kept, idle with session accepts any mode | Offered |
| Settings changed durations | Session ends (`settings_changed`), timer idle | Refetch after PUT; warn the user before saving while a session is open |
| Only timeout changed | Session untouched | — |
| Another device starts/pauses | Not pushed | Refetch on focus/visibility |
| Concurrency (`core.concurrency_conflict`) | 409, nothing applied | Refetch; retry if still valid |

---

## 10. TypeScript types for the client

```ts
export type TimerStatus = "idle" | "running" | "paused" | "completed";
export type TimerMode = "focus" | "short_break" | "long_break";
export type TimerCommand = "start" | "pause" | "resume" | "stop" | "reset";
export type TimerTrigger = "timeout" | "inactivity" | "settings_changed";
export type SessionEndReason = "manual_reset" | "inactivity" | "settings_changed";

export type TimerCommandRequest =
  | { command: "start"; mode: TimerMode }
  | { command: "pause" | "resume" | "stop" | "reset" };

export interface TimerSettingsSnapshot {
  focusDurationSeconds: number;
  shortBreakDurationSeconds: number;
  longBreakDurationSeconds: number;
  longBreakInterval: number;
}

export interface TimerSettings extends TimerSettingsSnapshot {
  inactivityTimeoutSeconds: number | null; // null = disabled; else 3600..86400
}

export interface AllowedCommand {
  command: TimerCommand;
  modes?: TimerMode[]; // start only
}

export interface FocusSession {
  id: string;
  startedAt: string;
  completedFocusBlocks: number;
  shortBreaks: number;
  longBreaks: number;
  settings: TimerSettingsSnapshot;
}

export interface Timer {
  id: string;
  userId: string;
  status: TimerStatus;
  mode: TimerMode | null;
  blockDurationSeconds: number | null;
  remainingSeconds: number | null;
  completesAt: string | null;
  transitionedAt: string | null;
  lastActivityAt: string | null;
  suggestedNextMode: TimerMode;
  allowedCommands: AllowedCommand[];
  focusBlocksUntilLongBreak: number | null;
  session: FocusSession | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimerTransition {
  from: TimerStatus;
  session?: "none" | "attached";
  fromModes?: TimerMode[];
  on: { command?: TimerCommand; modes?: TimerMode[]; trigger?: TimerTrigger };
  to: TimerStatus;
  sessionEffect: "create" | "keep" | "end";
  blockEffect: "start" | "skip" | "abandon" | "complete" | "none";
  noop?: true;
}

export interface TimerTransitions {
  statuses: TimerStatus[];
  modes: TimerMode[];
  commands: TimerCommand[];
  triggers: TimerTrigger[];
  triggerOrder: TimerTrigger[];
  transitions: TimerTransition[];
}

// WS
export interface TimerCompletedEvent {
  userId: string;
  sessionId: string;
  eventType: "completed";
  mode: TimerMode;
  durationSeconds: number;
  remainingSeconds: number; // 0
  reason: null;
  occurredAt: string;
}

export interface TimerSessionEndedEvent {
  userId: string;
  sessionId: string;
  reason: SessionEndReason;
  finishedAt: string;
}

export function findTransition(
  table: TimerTransition[],
  timer: Pick<Timer, "status" | "mode" | "session">,
  command: TimerCommand,
  mode?: TimerMode,
): TimerTransition | undefined {
  return table.find(
    (t) =>
      t.from === timer.status &&
      (t.session === undefined || (t.session === "attached") === (timer.session !== null)) &&
      (t.fromModes === undefined || (timer.mode !== null && t.fromModes.includes(timer.mode))) &&
      t.on.command === command &&
      (t.on.modes === undefined || (mode !== undefined && t.on.modes.includes(mode))),
  );
}
```

---

## 11. Migration checklist (old → new)

### Requests

| Old `PATCH /timers` body | New |
| --- | --- |
| `{ "status": "running", "sessionType": "focus", "durationSeconds": 1500 }` | `{ "command": "start", "mode": "focus" }` (duration from settings) |
| `{ "status": "running" }` (resume) | `{ "command": "resume" }` |
| `{ "status": "paused" }` | `{ "command": "pause" }` |
| `{ "status": "stopped" }` | `{ "command": "stop" }` → now `idle`, session kept |
| — | `{ "command": "reset" }` (end the session) |

### Behaviour changes

- [ ] **No client-chosen duration.** Remove duration pickers from start; durations live in settings.
- [ ] **Start is restricted.** Before: any type from any state, and starting while running *completed* (and counted) the current one. Now: see [2.1](#21-commands-by-state); new sessions start with focus; skip only focus ↔ break.
- [ ] **Skipping a focus block counts as completed** (same as before), **skipping a break counts nothing**, **stopping counts nothing** (same as before).
- [ ] **`stop` goes to `idle`**, not `stopped`; the session (and its counters) survive. Use `reset` to end a session.
- [ ] **Long break no longer resets a "completed focus sessions" counter.** The session's `completedFocusBlocks` only grows; cadence is `focusBlocksUntilLongBreak` (counts down).
- [ ] **Sessions auto-reset** after `inactivityTimeoutSeconds` (default 1 h) of not running, including while paused.
- [ ] **Changing durations/interval in settings ends the open session** (and stops a running block).
- [ ] **`GET /timers` may change state** (completion, inactivity reset).

### Response (`TimerResponse`)

| Old field | New |
| --- | --- |
| `sessionType` | `mode` |
| `sessionDurationSeconds` | `blockDurationSeconds` |
| `completedFocusSessions` | `session.completedFocusBlocks` (per session; never reset by a long break) |
| `status: "stopped"` | removed → `"idle"` |
| — | `lastActivityAt`, `suggestedNextMode`, `allowedCommands`, `focusBlocksUntilLongBreak`, `session` |

Unchanged: `id`, `userId`, `status` (minus `stopped`), `remainingSeconds`, `completesAt`,
`transitionedAt`, `createdAt`, `updatedAt`.

### Endpoints

- [ ] `GET /timers/suggestion` removed → `suggestedNextMode` (`suggestedSessionType` → `suggestedNextMode`, `completedFocusSessions` → see above, `longBreakInterval` → `session.settings.longBreakInterval`).
- [ ] `PUT /timers/settings` requires `inactivityTimeoutSeconds` (number 3600–86400 or `null`).
- [ ] `GET /timers/settings` returns `inactivityTimeoutSeconds`.
- [ ] New `GET /timers/transitions` (cache it).

### WebSocket

- [ ] `timer.completed`: `sessionType` → `mode`, `sessionDurationSeconds` → `durationSeconds`, + `sessionId`, `reason`.
- [ ] Handle new `timer.session_ended`.

### Errors

- [ ] `timers.timer_not_running` / `timer_not_paused` / `no_active_timer` / `unsupported_status` → `timers.invalid_transition` (409).
- [ ] `timers.invalid_session_input` → `timers.invalid_command_input` (400).

### Data

- [ ] On deploy every timer becomes `idle` with no session; running timers are dropped. Users start fresh.
