# Wave 4 — Transport adapters (plan) ✅

**Status: shipped 2026-10-15** (steps 0, 4.1–4.4, finish). As-built notes and deviations:
[07 §Wave 4](../07-roadmap.md#wave-4--transport-adapters-).

Roadmap: [07 §Wave 4](../07-roadmap.md#wave-4--transport-adapters-). Layering: [03 §6](../03-layering.md#6-wsgatewayts-split-wave-4).

Goal: `websockets/` = pure transport (auth on connect, room join, emit). Contexts own
their realtime pushes (`@EventHandler` → `RealtimeBroadcaster`) and inbound WS commands
(own `@WebSocketGateway`). Boundary lint for `websockets` flips `warn` → `error`.

Wire protocol **unchanged**: event names, payload shapes, ack shape
`{ ok, ... } | { ok: false, error }`, **and ack error strings** (frontend matches on them —
see [Ack strings](#ack-strings-kept-verbatim)).

## Decisions (agreed)

- Port in `platform/realtime/`; socket.io impl stays in `websockets/` (needs auth →
  context; `platform` never imports a context).
- Contexts inject `RealtimeBroadcaster`, never `WsGateway`.
- Broadcasters call the application layer / contracts only when the payload lacks data
  (today: `MessageCreated` attachment URLs via `AttachmentCatalogPort`).
- Only the API process broadcasts. A future worker publishes events; if it ever loads
  broadcaster providers → no-op `RealtimeBroadcaster` there. Nothing built now.
- WS errors → ack via one interceptor (not the `exception` event).
- Upgrade the whole Nest stack to 11 first (step 0).
- Ack error strings kept verbatim.
- Tests: unit + manual smoke; no socket e2e (`socket.io-client` not added).

## Target layout

```
platform/realtime/
  realtime-broadcaster.ts      # abstract class + RealtimeTarget + roomOf()
  ws-ack.interceptor.ts        # error → { ok: false, error }
  ws-actor.decorator.ts        # @WsActor(): Actor from socket.data.identity
  ws-command.decorator.ts      # @WsCommand() = UsePipes(ValidationPipe) + UseInterceptors(WsAck)
  ws-gateway.options.ts        # shared @WebSocketGateway options ({ cors: true })

auth/contract/actor-authenticator.port.ts       # headers → Actor | null
auth/application/actor-authenticator.service.ts # was websockets/services/ws-auth.service.ts

websockets/
  ws.module.ts                 # @Global; WsGateway + { provide: RealtimeBroadcaster, useExisting: WsGateway }
  ws.gateway.ts                # handleConnection/Disconnect + emit(); no @SubscribeMessage, no @EventHandler

conversations/presentation/ws/
  conversations.gateway.ts     # thread.subscribe/unsubscribe, message.send/tag/updateStatus
  messaging.broadcaster.ts     # MessageCreated, MessageUpdated, MessageManagedStatusChanged
  dto/{subscribe-thread,send-message,tag-message,update-message-status}.dto.ts
attention/presentation/ws/attention.broadcaster.ts      # AttentionItemUpserted/Removed
focus/presentation/ws/timers.broadcaster.ts             # TimerLifecycle (completed only)
tasks/presentation/ws/task-suggestions.broadcaster.ts   # TaskSuggestionBroadcast
```

Deleted: `websockets/services/ws-auth.service.ts`, `websockets/ws.rooms.ts`,
`websockets/ws.types.ts` (`Ack`/`SendAck` → `platform/realtime/`; unused
`USER_NOTIFICATION_EVENT` dropped), `toAuthGuest` in `platform/http/auth/actor.mapper.ts`.

## Step 0 — Upgrade Nest to 11

Today mixed: `@nestjs/core`/`common` = 10.4.22, `@nestjs/websockets`/`platform-socket.io`
= 11.1.19. Own commit, before 4.1.

Bump to `^11` (`apps/api/package.json`):

- deps: `@nestjs/common`, `core`, `platform-express`, `swagger` (7 → 11)
- devDeps: `@nestjs/cli`, `schematics`, `testing`
- already 11-ready: `websockets`, `platform-socket.io`, `config` (4.x), `@types/express` (5)
- check peer ranges after install: `nestjs-cls`, `@nestjs-cls/transactional(+drizzle adapter)`,
  `nestjs-context-logger`; bump if they warn

Known breaking changes that touch us:

- Express 5 / path-to-regexp v8: unnamed wildcards gone →
  `auth.controller.ts` `@All("*")` → `@All("*splat")`. Grep other `*` routes /
  `forRoutes("*")` (none found today).
- Express 5 query parser defaults to `simple` (no nested `a[b]=1`). Grep DTOs for nested
  query objects; if any → `app.set("query parser", "extended")` in `main.ts`.
- Shutdown hooks run in reverse module order — check `OnModuleDestroy` users
  (`RealtimeListenerService`, pg-boss, db pools) still close cleanly.
- Swagger 11: re-check `setupSwagger` + `@ApiStandardErrors` compile.

Verify: `pnpm install`, `pnpm run build`, lint, `pnpm run test:all`; manual: app boots,
better-auth routes (`/api/auth/*`) work, sockets connect, Swagger UI loads.

## 4.1 — `RealtimeBroadcaster` port

```ts
// platform/realtime/realtime-broadcaster.ts
export type RealtimeTarget =
  | { kind: "user"; id: string }
  | { kind: "guest"; id: string }
  | { kind: "thread"; id: string };

export const roomOf = (t: RealtimeTarget) => `${t.kind}:${t.id}`;

export abstract class RealtimeBroadcaster {
  abstract emit(targets: RealtimeTarget[], event: string, payload: unknown): void;
}
```

One `emit(targets[])` instead of `toUser/toGuest/toThread` (03 §6 draft): socket.io
dedupes sockets across rooms only within a single `.to([...])`. Split calls would
deliver `message.created` twice to a socket in both its user room and the thread room.

- `WsGateway implements RealtimeBroadcaster`: `emit` → `this.server.to(targets.map(roomOf)).emit(...)`.
- `WebsocketsModule` → `@Global()`, exports `RealtimeBroadcaster`. Global avoids
  context modules importing `WebsocketsModule` (→ `AuthModule`) and the cycle risk.
- Auth: `ActorAuthenticator` port in `auth/contract`, impl in `auth/application` (logic
  of `WsAuthService`, socket-agnostic: takes a header bag). Gateway builds the header bag
  (handshake headers + `handshake.auth.token`) and calls the port. `AuthModule` exports it.
- `ws.rooms.ts` → `roomOf()`.

## 4.2 — Per-context broadcasters

Move the 7 `@EventHandler`s 1:1 out of `ws.gateway.ts` (bodies unchanged, `server.to()`
→ `broadcaster.emit()`); register each as a provider in its context module
(`EventHandlersRegistry` discovers all providers).

| Broadcaster | Events | Targets |
| --- | --- | --- |
| `messaging.broadcaster.ts` | `MessageCreated` | thread + `sentToUserId`/`sentToGuestId` (one emit); resolves attachments via `AttachmentCatalogPort` at emit time |
| | `MessageUpdated`, `MessageManagedStatusChanged` | thread |
| `attention.broadcaster.ts` | `AttentionItemUpserted`, `AttentionItemRemoved` | user |
| `timers.broadcaster.ts` | `TimerLifecycle` (`completed` only) | user |
| `task-suggestions.broadcaster.ts` | `TaskSuggestionBroadcast` | suggester + suggestee (one emit) |

Tests (unit, fake `RealtimeBroadcaster`):
`test/conversations/messaging.broadcaster.unit.test.ts` (targets, attachment resolve),
`test/focus/timers.broadcaster.unit.test.ts` (non-`completed` ignored). Others are
one-line mappings — no test.

## 4.3 — Collapse messaging `X`/`guestX` on `Actor` (risky)

**First:** `test/conversations/messaging.integration.test.ts` against the _current_ API
(characterization), green before any refactor. Cases:

- send (user): happy; non-participant → `thread_not_found`; frozen (disconnected / dead
  link) → `thread_is_frozen`; tags must belong to recipient; reply-to-reply rejected;
  attachments not owned rejected; inline suggestion creates suggestion.
- send (guest): first message creates thread + participants; tags = owner's tags.
- tag: user participant; guest only own messages; non-participant → `thread_not_found`.
- updateManagedStatus: recipient ok; sender rejected; unmanaged rejected; same status → no event.
- reads: user non-participant → `thread_not_found`; guest without thread → `[]` / zero stats / replies `message_not_found_for_thread`.

**Then** collapse (`MessagingService`):

| Before | After |
| --- | --- |
| `sendAsUser(userId, threadId, body, tagIds, parent, attachmentIds, suggestion)` / `sendAsGuest(guest, body, tagIds, parent)` | `send(actor, cmd: SendMessageCommand)` |
| `tagMessage(userId, …)` / `tagMessageAsGuest(guest, …)` | `tagMessage(actor, messageId, tagIds)` |
| `updateManagedStatus(userId, …)` | `updateManagedStatus(actor, …)` |
| `listThreadMessages` / `listGuestThreadMessages` | `listMessages(actor, threadId \| null, opts)` |
| `listThreadMessageReplies` / `listGuestMessageReplies` | `listReplies(actor, threadId \| null, messageId, opts)` |
| `getThreadStats` / `getGuestThreadStats` | `getThreadStats(actor, threadId \| null)` |
| `listThreadTaggedMessages` / `listGuestThreadTaggedMessages` | `listTaggedMessages(actor, threadId \| null)` |
| `listThreadsForUser(userId)`, `createOrGetUserThread(userId, …)` | take `Actor`; guest → forbidden |

- Reads share one private `resolveReadableThreadId(actor, threadId)`: user → assert
  participant, return `threadId`; guest → own thread or `null` (ignores `threadId`).
- `applyManagedStatusFromAttention` unchanged (system path, no actor).
- Guest rules move from the gateway into `send` / `updateManagedStatus` as new
  `messaging` catalog keys (exposable). Messages are the **old ack strings verbatim**
  (no `{ reason }` template, so the translator returns them unchanged):

  | Key | Category | Message | Was (gateway) |
  | --- | --- | --- | --- |
  | `guest_cannot_attach_files` | FORBIDDEN | `Guests cannot attach files` | line 233 |
  | `guest_cannot_suggest_tasks` | FORBIDDEN | `Guests cannot suggest tasks` | line 237 |
  | `guest_cannot_update_status` | FORBIDDEN | `forbidden` | line 323 (guests are never recipients) |
  | `thread_id_required` | INVALID_VALUE | `threadId required` | line 214 (user without `threadId`) |
- REST: both controllers keep their routes; swap `@AuthUser`/`@AuthGuest` for
  `@RequestActor()`. Delete `toAuthGuest`.
- Update callers in `test/attention/attention-items.events-handler.integration.test.ts`.
- Add guest-rule cases to the new test; all characterization cases stay green.

## 4.4 — Inbound commands into `conversations`

`conversations/presentation/ws/conversations.gateway.ts`:

```ts
@WebSocketGateway(WS_GATEWAY_OPTIONS)
export class ConversationsGateway {
  @WsCommand()
  @SubscribeMessage("message.send")
  async send(@WsActor() actor: Actor, @MessageBody() dto: SendMessageDto): Promise<SendAck> {
    const m = await this.messaging.send(actor, toSendMessageCommand(dto));
    return { ok: true, messageId: m.id, suggestionId: m.suggestionId };
  }
}
```

- No `OnGatewayConnection` here (only `WsGateway` authenticates / joins rooms).
- `thread.subscribe`: `canAccessThread` → `socket.join(roomOf({ kind: "thread", id }))`.
- DTOs (class-validator), replacing hand-rolled checks. No REST equivalents exist for
  these commands → no DTO sharing; same `ValidationPipe({ whitelist: true, transform: true })`
  config as HTTP. Every decorator carries `{ message: <old string> }`; properties declared
  in the gateway's old check order (see table below).
- `@WsActor()`: reads `socket.data.identity`, throws `WsException("unauthorized")` if
  missing (connect race — `handleConnection` isn't awaited by Nest). Param decorator, not
  a guard: guard errors run outside interceptors → `exception` event, no ack.
- `WsAckInterceptor` (`catchError` → ack value):
  - `DomainError` → `DomainErrorsTranslator.translate(e).message`
  - `BadRequestException` (validation) → **first** message only (old gateway returned one
    error at a time)
  - `WsException` → its message
  - else → log + `"internal_error"`
- `thread.subscribe` keeps `"forbidden"` when `canAccessThread` is false (gateway decides;
  boolean query, not an error).

### Ack strings (kept verbatim)

| Command | String | Source after |
| --- | --- | --- |
| all (except unsubscribe) | `unauthorized` | `@WsActor()` |
| `thread.subscribe`/`unsubscribe` | `threadId required` | DTO |
| `thread.subscribe` | `forbidden` | gateway |
| `message.send` | `body required` | DTO (trim → non-empty) |
| | `tagIds must be string[]`, `attachmentIds must be string[]` | DTO |
| | `maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments allowed` | DTO |
| | `taskSuggestion.kind must be task\|batch`, `taskSuggestion.title required` | DTO (nested) |
| | `threadId required` (user), `Guests cannot attach files`, `Guests cannot suggest tasks` | catalog (4.3) |
| `message.tag` | `messageId required`, `tagIds must be string[]` | DTO |
| `message.updateStatus` | `forbidden` (guest) | catalog (4.3) |
| | `messageId required`, `status must be one of ${MANAGED_MESSAGE_STATUSES.join(", ")}` | DTO |
| all | domain error texts | translator (unchanged) |
| all | `internal_error` | interceptor |

Known deviation: guest `message.updateStatus` with an _invalid payload_ now gets the
validation string instead of `forbidden` (pipe runs before the service). Acceptable.

Validation keeps old leniency: `tagIds`/`attachmentIds` deduped (`@Transform` uniq),
only checked as `string[]` (not uuid) — stricter checks would change accepted payloads.

Tests (unit): `test/platform/ws-ack.interceptor.unit.test.ts`;
`test/conversations/ws-dtos.unit.test.ts` — every row of the ack-strings table: invalid
payload → exact old string via `ValidationPipe` + first-message rule.

## Finish

- Remove `websockets` `warn` override in `eslint.config.js` and the
  `websockets-via-contract-only` rule / `pathNot` in `apps/api/.dependency-cruiser.cjs`.
  Check `websockets/` root files fit an existing boundaries element; adjust if not.
- Docs: roadmap 4.1–4.4 ✅; `01-current-state.md`; `03-layering.md` §6 (single `emit`,
  global module, `@WsCommand`, interceptor); CLAUDE.md status + drop "worker".
- Each step: `pnpm run fix-imports` → `pnpm run lint` → `pnpm run test:all`.
  Manual smoke after step 0, 4.1 and 4.4 (you run the app): connect user + guest, send,
  tag, status, timer complete, attention push, suggestion update; after 4.4 also invalid
  payloads → same ack strings as before.

## Unresolved questions

None.
