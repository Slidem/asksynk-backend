# Messaging API

Base URL: `http://<host>:3000`. All IDs are UUIDv7 strings. Timestamps are ISO-8601 strings.

## Auth

- **User**: better-auth session cookie (set by login flow).
- **Guest**: `Authorization: Bearer <guestToken>` (token issued via public-view flow).

## REST — Threads (user only)

### `GET /threads`

List the current user's threads.

**Response** `ThreadListItem[]`:

```ts
type ThreadListItem = {
  threadId: string;
  publicViewId: string | null; // non-null = guest thread
  other: ThreadOtherParticipant;
  lastMessage: {
    body: string;
    createdAt: string;
    senderKind: "user" | "guest";
  } | null;
  frozen: boolean; // true = sending disabled
  createdAt: string;
};

type ThreadOtherParticipant =
  | {
      kind: "user";
      userId: string;
      name: string | null;
      firstName: string | null;
      lastName: string | null;
      email: string;
      image: string | null;
      isActiveConnection: boolean;
    }
  | {
      kind: "guest";
      guestId: string;
      displayName: string;
      publicViewId: string;
      publicViewName: string | null;
      publicViewExpired: boolean;
    };
```

### `POST /threads`

Create or get a 1:1 thread with another user. Idempotent (returns existing if present). Recipient must be in active network connection.

**Body**: `{ recipientUserId: string }`
**Response**: `{ threadId: string }`
**Errors**: `400` self-thread, `403` not in network.

### `GET /threads/:id/messages`

List messages in a thread (newest first; cursor pagination via `before`).

**Path**: `id` — threadId (uuidv7).
**Query**:

- `before?: string` (ISO date) — return messages with `createdAt < before`
- `limit?: number` (1..100, default 50)

**Response**: `Message[]`

```ts
type Message = {
  id: string;
  threadId: string;
  senderKind: "user" | "guest";
  senderId: string;
  body: string;
  createdAt: string;
};
```

**Errors**: `404` if not a participant.

## REST — Guest

### `GET /public/thread/messages`

List messages in the guest's thread (resolved from bearer token; one thread per guest). Returns `[]` if no thread yet.

**Query**: same `before` / `limit` as above.
**Response**: `Message[]`

## WebSocket Gateway

Socket.IO server mounted on the same origin (`http://<host>:3000`). CORS open.

### Connect

Pass auth at handshake — either:

- header `Authorization: Bearer <token>` (guest), OR
- `auth: { token: "<guestToken>" }` in `io()` options, OR
- include user session cookie (browsers do this automatically).

```ts
import { io } from "socket.io-client";

// User (cookie session)
const socket = io("http://localhost:3000", { withCredentials: true });

// Guest
const socket = io("http://localhost:3000", { auth: { token: guestToken } });
```

On auth failure the server emits `error` `{ code: "unauthorized", message }` and disconnects.

On connect the socket auto-joins:

- user → `user:<userId>` room
- guest → `guest:<guestId>` room

You will receive events for any thread you're a participant in **without** subscribing — but `thread.subscribe` is recommended when the user opens a thread (future: typing indicators, read receipts).

### Client → Server (with ack)

All events use Socket.IO acks. Ack shape: `{ ok: true, ... } | { ok: false, error: string }`.

#### `thread.subscribe`

Join the thread room (must be a participant; for guests, must be your own thread).

**Payload**: `{ threadId: string }`
**Ack**: `{ ok: true } | { ok: false, error: "unauthorized" | "threadId required" | "forbidden" }`

#### `thread.unsubscribe`

**Payload**: `{ threadId: string }`
**Ack**: `{ ok: true } | { ok: false, error }`

#### `message.send`

Send a message. Trims body; empty rejected.

**Payload (user)**: `{ threadId: string, body: string }`
**Payload (guest)**: `{ body: string }` — `threadId` ignored; thread is auto-resolved/created from the guest token.
**Ack**: `{ ok: true, messageId: string } | { ok: false, error }`

Errors include: `unauthorized`, `threadId required`, `body required`, `Thread not found`, `Thread is frozen`, `internal_error`.

### Server → Client

#### `message.created`

Emitted to the thread room and to all participant user/guest rooms when a new message is persisted (sent via WS or REST — the event is fanned out from a single source).

**Payload**:

```ts
{
  threadId: string;
  message: {
    id: string;
    threadId: string;
    senderKind: "user" | "guest";
    senderId: string;
    body: string;
    createdAt: string; // ISO
  }
}
```

#### `notification`

Generic user-scoped notification (sent only to the user's room).

**Payload**: `{ type: string; payload: unknown }`

#### `error`

Sent only on connection auth failure right before disconnect: `{ code: "unauthorized", message: string }`.

## Frontend integration notes

- After login, hit `GET /threads` for the inbox; subscribe socket on app boot.
- When the user opens a thread: `GET /threads/:id/messages` for history, then `socket.emit("thread.subscribe", { threadId })`.
- For paging older messages, pass the oldest message's `createdAt` as `before`.
- Always send via `socket.emit("message.send", ...)` and update UI on the ack; the server will _also_ deliver the same message to you via `message.created` (dedupe by `messageId`).
- Treat `frozen: true` as send-disabled — POSTs/emits will fail with `Thread is frozen`.
