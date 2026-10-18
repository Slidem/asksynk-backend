# Focus sessions — timer refactor (plan)

Context: `focus`. Builds on the `Timer` aggregate ([Wave 5 plan](wave-5-rich-aggregates.md),
[ADR 0008](../adr/0008-self-mutating-aggregates.md)). MVP: no back-compat; breaking wire and
schema changes are fine (frontend adapts).

Goal: fix the naming ("session type" is really a timer **mode**), drive the timer with
**commands** instead of a target status, take durations from settings only, and introduce a real
**session**: a series of blocks over a period of time, the unit for focus history and stats.

## Decisions (agreed)

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Session lifetime | Session survives `stop`; ends only via reset (manual, inactivity, settings change). Created **lazily** on the first `start`, never eagerly |
| 2 | `stopped` status | Dropped; `stop` → `idle` |
| 3 | Table name | `focus_sessions` (`sessions` belongs to better-auth) |
| 4 | Break choice | Client picks `short_break` / `long_break`; server only suggests |
| 5 | Suggestion | `GET /timers/suggestion` deleted; `suggestedNextMode` lives in `TimerResponse` |
| 6 | Skipping focus | Counts as completed; the log tells skip from natural completion via a `skipped` transition |
| 7 | Break counters | Count **started** breaks |
| 8 | Completed focus → focus | Allowed (skip the break) |
| 9 | Paused + inactive | Counts as inactive; the abandoned block is logged (`stopped`, reason `inactivity`) |
| 10 | Inactivity `finished_at` | `last_activity_at`, not detection time |
| 11 | Inactivity timeout | Setting; nullable = disabled; default 60 min; bounds 60 min – 24 h |
| 12 | Settings change | Ends the session only if a duration or `longBreakInterval` changed; timeout change never does |
| 13 | WS | Push `timer.session_ended`, to all of the user's devices (device-origin filtering is a [follow-up](#follow-ups)) |
| 14 | Log ↔ session | `user_timer_log.session_id` |
| 15 | REST | All timer control via `PATCH /timers { command, mode? }`, incl. `reset` |
| 16 | Session endpoints | Later (see [Later](#later)) |
| 17 | Old log rows | Truncated |
| 18 | Skipped count | Not stored on the session; derived from the log |
| 19 | Long-break cadence | Countdown `focus_blocks_until_long_break` on the timer (not an incrementing streak) |
| 20 | `start` from idle with session | Any mode (focus or break) |
| 21 | Reset without session | No-op, 200 |
| 22 | `mode` when idle | Cleared (`null`); `suggestedNextMode` = `focus` |
| 23 | Invalid mode transition | 409 (`CONFLICT`), as `invalid_transition` (#27) |
| 24 | `stop` on `completed` | → idle, session kept; no counters, no log row, no event (no block to abandon) |
| 25 | Command after the inactivity window | Lazy reset runs first; the command then applies to the reset state (e.g. `resume` → 409 `invalid_transition`) |
| 26 | Static transition table | Includes trigger rows (`timeout`, `inactivity`, `settings_changed`) + trigger order |
| 27 | Transition errors | One `invalid_transition` (409) = "no matching row"; action, status and current mode are in the message (`DomainError` has no details field) |
| 28 | Row effects | Status, mode, session and block effects only; counters reconciled from the response |
| 29 | `noop` rows | In the static table (flagged), excluded from `allowedCommands` |
| 30 | `GET /timers/transitions` | Authenticated (guests 403); `Cache-Control: private, max-age=3600` |

## Concepts

- **Mode** — `focus | short_break | long_break` (replaces "session type").
- **Block** — one run of a mode. Its duration always comes from the session's settings snapshot;
  the client never sends a duration.
- **Session** (`focus_sessions`) — the blocks run between creation (first `start`) and reset.
  Holds a snapshot of the timer settings it ran with (settings may change between sessions).
  End reasons: `manual_reset | inactivity | settings_changed`.
- **Timer** — one per user (`user_timers`); status `idle | running | paused | completed`;
  attached to at most one open session (`current_session_id`).
- **Aggregate boundary** — the open `FocusSession` is an entity inside the `Timer` aggregate:
  loaded with it, mutated only through `Timer` methods, written in the same tx, guarded by the
  timer's `version` (no own `version`). Ended sessions are read-only history.

## State machine

Statuses: `idle` (with or without session), `running`, `paused`, `completed`.

**Due settle:** every command (and `GET`) first applies a natural completion if the running
block is past due, then applies the command to the resulting state. A past-due block is never
logged as `skipped`/`stopped`.

| From ↓ / command → | `start(mode)` | `pause` | `resume` | `stop` | `reset` |
| --- | --- | --- | --- | --- | --- |
| idle, no session | `focus` only → creates session → running | ✗ | ✗ | ✗ | no-op 200 |
| idle, session | any mode → running | ✗ | ✗ | ✗ | end session → idle, detached |
| running | **skip**: focus ↔ break only → running | → paused | ✗ | abandon → idle | abandon + end session |
| paused | **skip**: focus ↔ break only → running | ✗ | → running | abandon → idle | abandon + end session |
| completed | any mode → running | ✗ | ✗ | → idle (no-op otherwise) | end session |

✗ (and any disallowed mode) → `invalid_transition` (409).

- **Skip** (start while running/paused): only `focus → short_break | long_break` or
  `short_break | long_break → focus`. Same mode, or `short_break ↔ long_break` →
  `invalid_transition` (409). The current block is logged `skipped`; a skipped focus block
  counts exactly like a completed one (counters + cadence).
- **Stop** abandons the active block: no counters touched, logged `stopped` (reason `null`),
  session kept. Next `start` may be any mode.
- **Reset** (`resetSession(reason, at)`): if a block is active (running/paused) it is abandoned
  and logged `stopped` with the reset reason; the session gets `finished_at` + `end_reason`; the
  timer goes idle, `mode = null`, `current_session_id = null`. Pending completion job cancelled.
- **Completion** (job or lazy): running → completed; `remaining = 0`. `transitionedAt` kept (job
  staleness token, as today).
- Every transition sets `last_activity_at = now` (completion: the completion time).

## Transitions exposed to clients

Goal: clients never hard-code the rules. They read which commands are allowed now, and the full
static transition table for optimistic updates. Both come from **one** source of truth that the
aggregate also enforces, so what's exposed can't drift from what's applied.

### Source of truth

`focus/domain/timer-transitions.ts` — `TIMER_TRANSITION_RULES`, a static, fully enumerated table (no
rule DSL; every row is explicit, so clients only match fields). `Timer` looks up the matching row
before mutating; no row → `invalid_transition` (409).

Row shape:

```ts
type TimerTransitionRule = {
  from: TimerStatus;
  session?: "none" | "attached";     // omitted = any
  fromModes?: TimerMode[];           // current block's mode; omitted = any
  on: { command: TimerCommand; modes?: TimerMode[] } // modes: allowed `start` modes
    | { trigger: "timeout" | "inactivity" | "settings_changed" };
  to: TimerStatus;
  sessionEffect: "create" | "keep" | "end";
  blockEffect: "start" | "skip" | "abandon" | "complete" | "none";
  noop?: true;
};
```

Rows (draft — mirrors the [state machine](#state-machine)):

| # | from | session | fromModes | on | modes | to | session | block |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | idle | none | — | `start` | focus | running | create | start |
| 2 | idle | none | — | `reset` | — | idle | keep | none (`noop`) |
| 3 | idle | attached | — | `start` | all | running | keep | start |
| 4 | idle | attached | — | `reset` | — | idle | end | none |
| 5 | running | — | focus | `start` | short_break, long_break | running | keep | skip |
| 6 | running | — | short_break, long_break | `start` | focus | running | keep | skip |
| 7 | running | — | — | `pause` | — | paused | keep | none |
| 8 | running | — | — | `stop` | — | idle | keep | abandon |
| 9 | running | — | — | `reset` | — | idle | end | abandon |
| 10 | paused | — | focus | `start` | short_break, long_break | running | keep | skip |
| 11 | paused | — | short_break, long_break | `start` | focus | running | keep | skip |
| 12 | paused | — | — | `resume` | — | running | keep | none |
| 13 | paused | — | — | `stop` | — | idle | keep | abandon |
| 14 | paused | — | — | `reset` | — | idle | end | abandon |
| 15 | completed | — | — | `start` | all | running | keep | start |
| 16 | completed | — | — | `stop` | — | idle | keep | none |
| 17 | completed | — | — | `reset` | — | idle | end | none |
| 18 | running | — | — | ⏱ `timeout` | — | completed | keep | complete |
| 19 | paused | attached | — | ⏱ `inactivity` | — | idle | end | abandon |
| 20 | completed, idle | attached | — | ⏱ `inactivity` | — | idle | end | none |
| 21 | running, paused | attached | — | ⏱ `settings_changed` | — | idle | end | abandon |
| 22 | completed, idle | attached | — | ⏱ `settings_changed` | — | idle | end | none |

(Rows with two `from` values are two rows in code.) **Ordering rule** (part of the payload as
documentation): before a command, the server applies due triggers — `timeout` (if `completesAt`
≤ now), then `inactivity` (if `lastActivityAt + inactivityTimeoutSeconds` < now). An optimistic
client does the same from `completesAt` / `lastActivityAt` before matching a command row.

Counters and the long-break countdown are **not** in the table: an optimistic client updates
status, mode and remaining time from the row (+ the session's `settings` for block duration) and
reconciles everything else from the server response.

### Surface 1 — `allowedCommands` on `TimerResponse`

The command rows matching the timer's current status, session presence and mode; `noop` rows
excluded (no "reset" button when there's nothing to reset). `start` rows merge their modes:

```json
"allowedCommands": [
  { "command": "start", "modes": ["short_break", "long_break"] },
  { "command": "pause" },
  { "command": "stop" },
  { "command": "reset" }
]
```

Computed from the stored state (after the lazy due settle / inactivity reset that `GET` already
runs), via a domain method `Timer.allowedCommands()`.

### Surface 2 — `GET /timers/transitions`

Static payload, identical for every user and timer state; served from `TIMER_TRANSITION_RULES` through
a presentation mapper. Authenticated like the rest of `/timers` (guests 403);
`Cache-Control: private, max-age=3600`.

```json
{
  "statuses": ["idle", "running", "paused", "completed"],
  "modes": ["focus", "short_break", "long_break"],
  "commands": ["start", "pause", "resume", "stop", "reset"],
  "triggers": ["timeout", "inactivity", "settings_changed"],
  "triggerOrder": ["timeout", "inactivity"],
  "transitions": [
    { "from": "idle", "session": "none", "on": { "command": "start", "modes": ["focus"] },
      "to": "running", "sessionEffect": "create", "blockEffect": "start" },
    { "from": "running", "fromModes": ["focus"],
      "on": { "command": "start", "modes": ["short_break", "long_break"] },
      "to": "running", "sessionEffect": "keep", "blockEffect": "skip" },
    { "from": "running", "on": { "trigger": "timeout" },
      "to": "completed", "sessionEffect": "keep", "blockEffect": "complete" }
  ]
}
```

## Counters and cadence

On `focus_sessions` (analytics):

- `completed_focus_blocks` — natural completions + skipped focus blocks.
- `short_breaks`, `long_breaks` — **started** breaks (incremented on `start`).

On `user_timers` (live cadence state, not analytics):

- `focus_blocks_until_long_break` — set to the session's `longBreakInterval` when the session is
  created; **decremented** (floor 0) on each completed or skipped focus block; reset to
  `longBreakInterval` when a `long_break` starts (also when started early). `short_break` leaves
  it unchanged. `null` when no session.

`suggestedNextMode` (domain method on `Timer`):

- idle (with or without session) → `focus`.
- current/last block is `focus` (running, paused, completed) → `long_break` if
  `focus_blocks_until_long_break` would be 0 after this block, else `short_break`.
- current/last block is a break → `focus`.

Analytics per session = session row counters + log rows by `session_id` (skipped and stopped
focus blocks, pauses, actual focused seconds, timeline).

## Inactivity

- **Inactive** when: session attached, status ≠ `running`, settings `inactivity_timeout_seconds`
  not null, `last_activity_at + timeout < now`. A running block is never inactive (it completes
  on its own and starts the clock).
- **Effect**: `resetSession("inactivity", last_activity_at)` — `finished_at = last_activity_at`;
  a paused block is logged `stopped`, reason `inactivity`, `occurred_at = last_activity_at`.
  Idle/completed timers have no active block → no log row; the session row records the end.
- **Detection**:
  - Lazy: `GET /timers` and every command check it first (after the due settle).
  - Sweep: `@CronJob({ name: "focus.sessions.inactivity", cron: "*/5 * * * *" })` →
    `TimersRepository.findInactive(now)` (ids) → per timer: load → reset → save; version
    conflict → skip (the user touched it meanwhile). Closes sessions of users who never return.

## Settings

- New `inactivity_timeout_seconds`: nullable (`null` = disabled), default `3600`, bounds
  `3600–86400`. Read live from settings, **not** part of the session snapshot.
- `PUT /timers/settings`: if a session is attached and any of `focusDurationSeconds`,
  `shortBreakDurationSeconds`, `longBreakDurationSeconds`, `longBreakInterval` differs from the
  session snapshot → `resetSession("settings_changed", now)` (active block abandoned, logged).
  Otherwise just save. One tx: settings + timer + session + outbox + job cancel.
- Session snapshot (`focus_sessions.settings` jsonb): `{ focusDurationSeconds,
  shortBreakDurationSeconds, longBreakDurationSeconds, longBreakInterval }`, taken from current
  settings on session creation. Block durations are read from it.

## Timer log

`user_timer_log` stays append-only, written async by the `timer-log` consumer group. One row per
block transition:

| Transition | When | `remaining_seconds` | `reason` |
| --- | --- | --- | --- |
| `started` | block starts (incl. after a skip) | full duration | null |
| `paused` / `resumed` | — | frozen remaining | null |
| `completed` | natural completion | 0 | null |
| `skipped` | block replaced by another mode | actual remaining | null |
| `stopped` | user stop, or block abandoned by a reset | actual remaining | null = user; else end reason |

A skip writes two rows: `skipped` (old block) then `started` (new block). The session end itself
is not a log row; it lives on `focus_sessions` (`finished_at`, `end_reason`).

## API

`PATCH /timers` — `TimerCommandDto`:

```json
{ "command": "start", "mode": "focus" }
{ "command": "pause" }
{ "command": "reset" }
```

`command ∈ start | pause | resume | stop | reset`; `mode` required for `start`, rejected
otherwise (`invalid_command_input`, 400). Returns `TimerResponse`:

```json
{
  "id": "…", "userId": "…",
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
    { "command": "pause" }, { "command": "stop" }, { "command": "reset" }
  ],
  "focusBlocksUntilLongBreak": 3,
  "session": {
    "id": "…", "startedAt": "…",
    "completedFocusBlocks": 1, "shortBreaks": 1, "longBreaks": 0,
    "settings": { "focusDurationSeconds": 1500, "shortBreakDurationSeconds": 300,
                  "longBreakDurationSeconds": 900, "longBreakInterval": 4 }
  },
  "createdAt": "…", "updatedAt": "…"
}
```

- `GET /timers` — same response (lazy due settle + inactivity reset).
- `GET /timers/settings`, `PUT /timers/settings` — + `inactivityTimeoutSeconds: number | null`
  (PUT: required key, `null` allowed).
- `GET /timers/transitions` — static transition table (see
  [Transitions exposed to clients](#surface-2--get-timerstransitions)).
- `GET /timers/suggestion` — deleted.

## Events

- `timer.lifecycle` (Dual, as today): `{ userId, sessionId, eventType: started | paused | resumed
  | stopped | completed | skipped, mode, durationSeconds, remainingSeconds, reason | null,
  occurredAt }` (`sessionType` → `mode`, `sessionDurationSeconds` → `durationSeconds`). Domain
  event `TimerTransitioned` mirrors it; mapper in `timer-events.mapper.ts`.
- `timer.session_ended` (new, Realtime — only the WS push consumes it, so no durable group):
  `{ userId, sessionId, reason, finishedAt }`. Domain event
  `FocusSessionEnded`, recorded by `resetSession`.
- WS (`TimersBroadcaster`): `timer.completed` (as today, payload renamed fields) and
  `timer.session_ended`, to all the user's devices, for every reason.

## Schema (one migration)

- `user_timers`
  - `timer_status`: drop `stopped`.
  - `session_type` → `mode` (enum `timer_session_type` → `timer_mode`).
  - drop `session_duration_seconds`, `completed_focus_sessions`.
  - add `current_session_id uuid null` (FK `focus_sessions.id`, `on delete set null`),
    `focus_blocks_until_long_break int null`, `last_activity_at timestamptz null`.
- `focus_sessions` (new)
  - `id uuid pk default uuidv7()`, `user_id text not null` (FK users, cascade),
    `started_at timestamptz not null`, `finished_at timestamptz null`,
    `end_reason focus_session_end_reason null` (enum `manual_reset | inactivity |
    settings_changed`), `completed_focus_blocks int not null default 0`,
    `short_breaks int not null default 0`, `long_breaks int not null default 0`,
    `settings jsonb not null`, `created_at`, `updated_at`.
  - index `(user_id, started_at)`.
- `user_timer_log`
  - `session_type` → `mode`; `session_duration_seconds` → `duration_seconds`.
  - add `session_id uuid not null` (FK `focus_sessions.id`, cascade), `reason
    focus_session_end_reason null`.
  - `timer_transition`: add `skipped`.
- `user_timer_settings`: add `inactivity_timeout_seconds int null default 3600`.

Two generated migrations, so drizzle-kit never prompts for renames: `0013_focus_sessions_drop`
(drops only; hand-prepended `TRUNCATE user_timer_log` + every `user_timers` row to idle before the
`timer_status` enum recreate) and `0014_focus_sessions` (additions only; `timer_session_type` is
dropped and `timer_mode` created rather than renamed). `pnpm run migrate` by the user.

## Code changes

**Domain** (`focus/domain/`)

- `timer.model.ts`: `TIMER_MODES`, `TIMER_STATUSES` (no `stopped`), `TIMER_COMMANDS`,
  `TimerTransition` (+ `skipped`), `SESSION_END_REASONS`, `TimerSettingsSnapshot`,
  `TimerCommandInput`; drop `TIMER_TRANSITION_STATUSES`, `TransitionTimerInput`,
  `BreakSuggestion`; `UpdateTimerSettingsInput` + `inactivityTimeoutSeconds`.
- `focus-session.ts` (new): entity — counters, snapshot, `end(reason, at)`.
- `timer-transitions.ts` (new): `TIMER_TRANSITION_RULES` + `findCommandRule` /
  `findTriggerRule` / `allowedCommands`; used by `Timer` for enforcement and by
  `Timer.allowedCommands()`. (`TIMER_TRANSITIONS` in `timer.model.ts` is the log transition list.)
- `timer.ts`: `start(mode, settings, now)` (settings used only when creating a session),
  `pause`, `resume`, `stop`, `resetSession(reason, at)`, `complete`, `isInactive(now,
  timeoutSeconds)`, `suggestedNextMode()`, private due settle; drop
  `assertValidTransitionInput`.
- `timer.events.ts`: `TimerTransitioned` (+ `sessionId`, `mode`, `durationSeconds`, `reason`),
  `FocusSessionEnded`.
- `user-timer-settings.ts`: + `inactivityTimeoutSeconds`; `differsFrom(snapshot)` helper.

**Errors** (`focus.errors.ts`): `invalid_session_input` → `invalid_command_input` (400); add
`invalid_transition` (409; action/status/mode in the message); drop `unsupported_status`,
`timer_not_running`, `timer_not_paused`, `no_active_timer`.

**Persistence** (`focus/infrastructure/persistence/`)

- `drizzle-timers.repository.ts`: load timer + open session; `save` first locks the timer row
  at the expected `version` (`SELECT … FOR UPDATE`; mismatch → conflict, nothing written), then
  upserts the session(s) touched in the unit of work (new, updated, just-ended), then the timer,
  then flushes events; `findInactive(now)` (join settings, `status <> 'running'`,
  `current_session_id is not null`, timeout not null, `last_activity_at + timeout < now`).
- `timer-events.mapper.ts`: both events.
- Log + settings repositories: new fields.
- `apps/migrations/src/schema/focusSessions.ts` (new) + edits to `userTimers.ts`,
  `userTimerLog.ts`, `userTimerSettings.ts`.

**Application** (`focus/application/timers.service.ts`)

- `command(actor, input)` replaces `applyTransition`: load → due settle → inactivity check →
  command → `save` → cancel old completion job / schedule new one.
- `getCurrent`: due settle + inactivity reset (conflict → reload, as today).
- `updateSettings`: save settings; if the snapshot differs → reset + save timer + cancel job.
- `resetInactiveSessions()`: sweep entry point.
- `getSuggestion` removed. `handleScheduledCompletion` unchanged.

**Presentation** (`focus/presentation/`)

- `rest/dto/timer-command.dto.ts` replaces `patch-timer.dto.ts`; settings DTO + timeout
  (`@ValidateIf(v !== null)`, 3600–86400).
- `TimerResponse` / `TimerSettingsResponse` / mapper as in [API](#api) (+ `allowedCommands`,
  `lastActivityAt`); delete `break-suggestion.response.ts` + endpoint.
- `GET /timers/transitions` + `TimerTransitionsResponse` + mapper from `TIMER_TRANSITION_RULES`.
- `jobs/focus-sessions-inactivity.job-handler.ts` (cron).
- `ws/timers.broadcaster.ts`: + `timer.session_ended`.
- `events/timer-log.handler.ts`: new fields.

**Platform**: `events.registry.ts` — update `TimerLifecycle`, add `TimerSessionEnded`.

## Tests

- Unit `test/focus/timer.unit.test.ts`: full command table (incl. error cases); lazy session
  creation (focus only); skip rules + counters + `skipped` event; stop keeps session; stop on
  `completed` → idle without event; command after inactivity window hits the reset state; reset
  (active block abandoned with reason, no-op without session); countdown (decrement, floor 0,
  long-break reset incl. early); `suggestedNextMode`; due settle (past-due skip → `completed`);
  `isInactive` (running never, timeout null never, boundaries).
- Unit `timer-transitions` (contract test, table-driven): for every row, build a `Timer` in the
  `from` state, apply it, assert `to` + session/block effects; for every (state, command, mode)
  combination **not** in the table, assert it's rejected. `allowedCommands()` per state matches
  the table. Guarantees exposed rules = enforced rules.
- Unit `user-timer-settings`: `differsFrom` ignores the timeout.
- Integration `test/focus/timers.integration.test.ts`: command endpoint; session row lifecycle;
  reset no-op; settings change resets only on relevant change; sweep closes inactive sessions
  with `finished_at = last_activity_at`; log rows (`skipped`, `reason`, `session_id`); stale
  version; completion job cancel on skip/stop/reset.

## Later

- `GET /timers/sessions` — paginated history (newest first), row counters + duration.
- `GET /timers/sessions/:id` — detail: session row + block timeline from `user_timer_log`
  (skipped/stopped focus blocks, pauses, actual focused seconds).
- Focus stats/trends built on the two above.

## Follow-ups

- Device-origin on events/WS: tracked in [platform/events § Known gaps](../../platform/events.md#known-gaps).

## Verification

`pnpm run fix-imports` → `pnpm run lint` → `pnpm run test:all`. On ship: update
`01-current-state.md` and `docs/platform/events.md`, delete this plan.
