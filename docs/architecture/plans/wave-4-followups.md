# Wave 4 follow-ups — finish messaging on `Actor` + docs refresh (plan)

Leftovers found when closing [Wave 4](wave-4-transport-adapters.md) (see
[07 §Wave 4](../07-roadmap.md#wave-4--transport-adapters-)). Steps 1–4 code (one
commit), step 5 docs (own commit), step 6 deletes the shipped plans (last).

1. `MessagingService.listThreadsForUser(userId)` / `createOrGetUserThread(userId, …)`
   still take `userId` (4.3 table, last row: "take `Actor`; guest → forbidden").
2. `GuestMessagingController` uses `@AuthGuest()` + `guestActor(guest)` instead of
   `@RequestActor()` (4.3 "REST" bullet).
3. `ConversationsModule` still `exports: [MessagingService]` — no importer since Wave 4;
   breaks "a module exports only `contract/` classes".

No wire change for valid callers: routes, response shapes and error codes stay.

## Step 1 — characterization tests first

Neither method has a test. Add to `test/conversations/messaging.integration.test.ts`
against the _current_ signatures, green before refactoring:

- `listThreadsForUser`: returns the user's threads (user + guest counterpart);
  `isActiveConnection` false for a disconnected pair; `publicViewExpired` for a dead link;
  a non-participant's thread is absent.
- `createOrGetUserThread`: connected pair → new thread with both participants; second
  call → same thread; self → `cannot_start_thread`; not connected → `cannot_start_thread`.

## Step 2 — `Actor` in `MessagingService`

| Before                                                        | After                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| `listThreadsForUser(userId: string)`                          | `listThreads(actor: Actor)`                               |
| `createOrGetUserThread(userId: string, recipientUserId)`      | `createOrGetUserThread(actor: Actor, recipientUserId)`    |

- Guest → throw first thing, then continue with `actor.userId` (bodies unchanged):
  - `listThreads`: new key `guest_cannot_list_threads` (FORBIDDEN, exposable,
    `"Guests cannot list threads"`).
  - `createOrGetUserThread`: existing `cannot_start_thread`
    `{ reason: "Guests cannot start threads" }` — no new key.
- Unreachable from REST today (`/threads` routes have no `@AllowGuest`, so `AuthGuard`
  rejects guests); the check is the application-layer rule, not a transport accident.
- Repository `listThreadsForUser(userId)` stays (persistence, not a use case).
- Tests: rename calls from step 1; add "guest → forbidden" for both.

## Step 3 — controllers on `@RequestActor()`

- `ThreadsController.list` / `createOrGet`: `@AuthUser() user` → `@RequestActor() actor`.
  Drop the `AuthUser` imports.
- `GuestMessagingController` (all 4 routes): `@AuthGuest() guest` + `guestActor(guest)`
  → `@RequestActor() actor`. Drop `AuthGuest`, `AuthGuestType`, `guestActor` imports.
- Behaviour change (fix): `@AllowGuest` routes try the user session first, so a
  signed-in **user** hitting `/public/thread/*` today gets `guestActor(undefined)` →
  `TypeError` → 500. After: user actor + `threadId = null` → `messaging.thread_id_required`
  (400). Same class of bug as `GET /public/me` in 01 §4 (left alone here).
- `auth-guest.decorator.ts` stays — `sharing/…/public-visitors.controller.ts` still uses it.

## Step 4 — drop the dead export

`conversations.module.ts`: remove `exports: [MessagingService]`. Tests use
`module.get(MessagingService)` (non-strict lookup) — unaffected.

## Verify (steps 1–4)

- `pnpm run fix-imports` → `pnpm run lint` → `pnpm run test:all`.
- Manual smoke (you run the app): `GET /threads`, `POST /threads`, guest
  `GET /public/thread/{messages,stats,tagged-messages}`.

## Step 5 — docs refresh

Docs describe **what is**, plus what is still to do. History (renames, "was X",
before/after tables, per-step "As built", strikethroughs, "since Wave N") lives in git,
not in the docs. Done after steps 1–4 so the docs describe the final code.

### Policy change

Replaces the current rule "mark shipped steps ✅, don't delete them" (CLAUDE.md
"Roadmap upkeep", memory `project_ddd_refactor`):

- Roadmap keeps **one "Done" table** — one row per shipped wave, one-line outcome. No
  per-step specs or "As built" prose for shipped work.
- Shipped plans in `plans/` are deleted (git keeps them).
- Current-state / reference docs: present tense only.

### Per file

| File | Change |
| --- | --- |
| `README.md` | Status → one line ("Waves 0–4 done; next: Wave 5"). Docs index unchanged. |
| `01-current-state.md` | Rewrite as a snapshot: header "as of `<commit>` (date)" instead of audit history; folder table drops the "was …" notes; drop solved sections (3.5 ports, 3.9 ws.gateway, 3.10 `auth ↔ public-views`), renumber; 3.1/3.6/3.11/§5 in present tense (no "Wave N removed…", "since Wave N"); 3.6 lists no messaging methods; refresh LOC + test counts. Fix bare paths (`id.ts`, `time/iso.ts` → `kernel/…`). |
| `02-context-map.md` | Drop the "(was …)" folder column. §3 boundary decisions: keep the rationale, headings use current names (no "`x` → **y**" migration arrows). |
| `03-layering.md` | §6 → "Realtime (WS)", present tense (drop "split (Wave 4)", "the `websockets` warn exception was removed"); §8 heading drops "(Wave 3)"; §1 contract row: add `platform/` types (`actor-authenticator.port.ts` imports `platform/http/auth`); §5 re-check listed violations still exist; fix `timers/domain/timer.ts` → `focus/domain/timer.ts`. |
| `04-integration.md` | §2 "Current violations and their fix": delete A–F (all resolved; before/after tables); keep G ("stays, deliberately") as its own section. §3 `Actor`: present tense. Fix `occurrence.query.ts` path. Keep §4 (8.1, future) and §5 example. |
| `05-persistence.md` | Fix bare repository paths; rest is future work — keep. |
| `06-attention-core.md` | §2 "Today's problems" stays (true until Wave 6). §6: drop "Target: two ports (Wave 2)" — describe as built. Fix `attention-items/domain/due-date.policy.ts` → `attention/domain/…`. |
| `07-roadmap.md` | Waves 0–4 → one "Done" table (wave, outcome, ADRs). Delete their step tables, "As built" notes, the Wave 0 paragraph, "Placement (since Wave 3)". Guardrails: delete the "original sketch" depcruise + ESLint snippets → link `apps/api/.dependency-cruiser.cjs` / `eslint.config.js`. Keep Waves 5–8, Backlog, 8.4 CLAUDE.md block, "Leave alone". |
| `platform/events.md` | Fix the consumer-group table + internals paths (pre-Wave-3: `messaging/…`, `timers/…`, `public-views/…`, `attention-items/…`, `scheduling/sync/…`, bare `registry/…`, `consumer/…`). Drop "moves to its context in Wave 8.1" → keep as a Known gap only. |
| `platform/jobs.md` | Fix paths (`timers/scheduling/…`, `scheduling/sync/…`). |
| `platform/errors.md` | Fix `storage/attachments/services/attachments.service.ts` → `files/application/attachments.service.ts`. |
| `adr/*` | Decision text untouched; fix outdated paths only (`attention-items.repository.ts`, `drizzle.config.ts`, `calendar.repository.ts`, `calendar-sync.service.ts`, `providers/google-calendar.provider.ts`, `test/timers/…`, `actor/actor.ts`, `id.ts`, `time/iso.ts` → current locations). |
| `plans/` | Removed at the very end — see Step 6. |
| `CLAUDE.md` | Status → "Waves 0–4 ✅; next Wave 5"; "Roadmap upkeep" → the policy above. |

### Verify (docs)

- Every backticked `*.ts` path in `docs/` (ADRs included) resolves under `apps/`
  (one-off script, same as the Wave 4 audit).
- `grep -nE "\bwas \`|~~|As built|since Wave|\(Wave [0-4]" docs/architecture docs/platform`
  (excluding `adr/`) → only the roadmap "Done" table.
- No links to deleted files (`plans/wave-3.md`, `plans/wave-4-*.md`).

## Step 6 — remove shipped plans (last)

After steps 1–5 are verified and committed:

- `git rm docs/architecture/plans/wave-4-transport-adapters.md docs/architecture/plans/wave-4-followups.md`
  (`plans/` ends up empty).
- Grep `docs/`, `CLAUDE.md` for `plans/` links → none left (roadmap "Done" table doesn't
  link plans).

## Decisions (agreed)

- User on `/public/thread/*` → `thread_id_required` (400); no new key.
- Rename `listThreadsForUser` → `listThreads`.
- Guest listing threads → throw `guest_cannot_list_threads`.
- Roadmap: short "Done" table for Waves 0–4.
- Shipped plans deleted at the end (Step 6).
- ADRs: fix outdated paths only, decision text untouched.

## Unresolved questions

None.
