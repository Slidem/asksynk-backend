# Consumer groups and ordering keys

The registry contract. Every durable event belongs to one or more consumer
groups; each group owns one `key_strict_fifo` queue and one ordering strategy.

See [01-ordering-design.md](01-ordering-design.md) §5 for why the key lives on
the group rather than on `@EventHandler`, and how the definitions reach the
dispatcher.

Each definition lives in its own context under `<ctx>/contract/`, beside that
context's event definitions, with a small registration provider that injects the
platform registry and calls `register()` in `onModuleInit`. There is no central
array — adding a group touches only its own context.

## Groups

| Group             | Ordering key            | Events | Producer changes |
| ----------------- | ----------------------- | ------ | ---------------- |
| `attention-items` | `user:<id>`             | 15     | 5                |
| `suggestion-sync` | `user:<assigneeUserId>` | 2      | —                |
| `calendar-sync`   | `user:<userId>`         | 3      | —                |
| `messaging`       | `thread:<threadId>`     | 1      | 1                |
| `timer-event-log` | `user:<userId>`         | 1      | —                |

`email` is **dropped entirely**. It is declared on `TagUpdated` and has no
handler and never did — the dispatcher currently creates a `tag.updated.email`
queue and enqueues jobs nothing will ever work
([architecture/01-current-state.md](../architecture/01-current-state.md) §4.9).
Building the registry consumer-first removes it by construction.

Note that `attention-items` and `calendar-sync` both key on the user. They are
separate queues, so they neither block nor order against each other — a calendar
event is processed once per group, in parallel.

## attention-items → `user:<id>`

Fifteen events. Three of them belong to several users at once and **fan out**
into one job per participant.

| Event                      | Key from               | Fan-out | Change        |
| -------------------------- | ---------------------- | ------- | ------------- |
| `message.created`          | `participantUserIds[]` | yes     | —             |
| `message.updated`          | `participantUserIds[]` | yes     | —             |
| `message.status.changed`   | `participantUserIds[]` | yes     | **add field** |
| `tag.updated`              | `userId`               |         | —             |
| `tag.deleted`              | `userId`               |         | —             |
| `calendar.event.created`   | `userId`               |         | —             |
| `calendar.event.updated`   | `userId`               |         | —             |
| `calendar.event.deleted`   | `userId`               |         | —             |
| `task.upserted`            | `assigneeUserId`       |         | —             |
| `task.deleted`             | `assigneeUserId`       |         | **add field** |
| `task.batch.upserted`      | `assigneeUserId`       |         | —             |
| `task.batch.deleted`       | `assigneeUserId`       |         | **add field** |
| `task.suggestion.created`  | `suggesteeUserId`      |         | —             |
| `task.suggestion.resolved` | `suggesteeUserId`      |         | **add field** |
| `task.suggestion.updated`  | `suggesteeUserId`      |         | **add field** |

The suggestion events key on the **suggestee**, matching
`task-attention.handler.ts` — `onTaskSuggested` creates the attention item under
`payload.suggesteeUserId`.

A thread with only guest participants yields an empty key list, so the event
produces no `attention-items` job. That is correct: the handler only creates
items for participant users. The outbox row is still marked dispatched.

## suggestion-sync → `user:<assigneeUserId>`

`task.upserted`, `task.batch.upserted`. Both already carry `assigneeUserId`.
No changes.

Kept deliberately separate from `attention-items` — sharing a queue would split
each event between the two consumers rather than delivering it to both.

## calendar-sync → `user:<userId>`

`calendar.event.created`, `calendar.event.updated`, `calendar.event.deleted`.
All three already carry `userId`. No changes.

## messaging → `thread:<threadId>`

`attention.message.synced` only. Needs `threadId` added — see below.

## timer-event-log → `user:<userId>`

`timer.lifecycle`. Already carries `userId`. No changes.

## Producer changes

Six call sites across five files. Every one has the value in scope already.

### 1. `TaskDeleted` — add `assigneeUserId`

[`tasks.service.ts:130`](../../apps/api/src/tasks/services/tasks.service.ts#L130).
`task` is loaded and assignee-checked immediately above; use
`task.assigneeUserId`.

### 2. `TaskBatchDeleted` — add `assigneeUserId`

[`task-batches.service.ts:101`](../../apps/api/src/tasks/services/task-batches.service.ts#L101).
`requireAssignee(userId, id)` has already asserted it, so the `userId` parameter
is the assignee.

### 3. `TaskSuggestionResolved` — add `suggesteeUserId` (×3)

[`task-suggestions.service.ts`](../../apps/api/src/tasks/services/task-suggestions.service.ts)
at `accept` (:121), `reject` (:135) and `rescind` (:147).

`accept` and `reject` already hold `suggestion`. **`rescind` currently discards
the `requirePending` return value** and needs to capture it.

### 4. `TaskSuggestionUpdated` — add `suggesteeUserId`

[`task-suggestions.service.ts:194`](../../apps/api/src/tasks/services/task-suggestions.service.ts#L194)
in `editPayload`; `suggestion.suggesteeUserId` is in scope.

### 5. `MessageManagedStatusChanged` — add `participantUserIds`

[`messaging.service.ts`](../../apps/api/src/messaging/services/messaging.service.ts),
private `publishManagedStatusChanged(threadId, messageId, managedStatus)`.

Both callers (`updateManagedStatus`, `applyManagedStatusFromAttention`) have the
thread id but not the participant list. Load it in the helper with
`messagingRepository.getParticipants(threadId)` and map to user ids, the same
shape `notifyMessageCreated` / `notifyMessageUpdated` already build.

This is the field that makes the event fan out; without it the third message
event has no user at all and the group's key function stops being total.

### 6. `AttentionMessageStatusChanged` — add `threadId`

[`attention-items.service.ts:87`](../../apps/api/src/attention-items/attention-items.service.ts#L87).
`metadata` is already narrowed to `TaggedMessageMetadata`, which carries
`threadId` — confirm it is non-optional on that type, or assert it, since a
`tagged_message` item always has one.

## Invariants for anyone adding an event

1. **The key function must be total.** `key_strict_fifo` has a CHECK that
   `singleton_key` is never null; one null fails the INSERT for the whole
   dispatch batch, not just the offending event. If an event has no natural
   domain, fall back to the outbox row id — unique, so it blocks nothing.
2. **Ordering only exists between events that produce the same key.** If two
   event types must be ordered relative to each other, they must resolve to the
   same key in that group.
3. **Adding an event to a group is a queue-wide decision.** The key contract is
   shared by every handler in the group.
4. **Register in `onModuleInit`, read in `onApplicationBootstrap`.** Nest gives
   no ordering guarantee between sibling modules' `onModuleInit`, so anything
   that reads the registry — the dispatcher, queue bootstrap, handler discovery
   — must wait for bootstrap. The registry is sealed once bootstrap reads it;
   registering after that throws.
5. **Both directions are checked at boot.** Every group named by an
   `@EventHandler` must be registered, and every registered `(group, event)`
   must have a handler. The second check is what keeps another orphan `email`
   group from ever existing.
6. **`@EventHandler` still declares its group.** Only `defineEvent` loses its
   `groups` field. A `Dual` event has handlers on both legs — realtime in
   `ws.gateway.ts`, durable in its group's handler — and the presence of
   `{ group }` is the only thing that tells them apart. It also names the
   implementing class, which the registry cannot.
