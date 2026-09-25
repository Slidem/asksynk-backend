# Consumer groups and ordering keys

The group contract. Every durable event belongs to one or more consumer groups;
each group owns one `key_strict_fifo` queue and one ordering function.

See [01-ordering-design.md](01-ordering-design.md) §5 for why the key lives on
the group rather than on `@EventHandler`, and how groups reach the dispatcher.

Each group is a `ConsumerGroup<E>` const — `{ name, orderingKeyFn }` — in its
owning context at `<ctx>/<ctx>.consumer-group.ts`, passed to every
`@EventHandler` of that group. There is no registration step and no central
list: the platform discovers groups from the handlers.

## Groups

| Group             | File                                                   | Ordering key                  | Events |
| ----------------- | ------------------------------------------------------ | ----------------------------- | ------ |
| `attention-items` | `attention-items/attention-items.consumer-group.ts`    | `user:<id>` (see below)       | 15     |
| `suggestion-sync` | `tasks/suggestion-sync.consumer-group.ts`              | `assignee:<assigneeUserId>`   | 2      |
| `calendar-sync`   | `calendar-integrations/calendar-sync.consumer-group.ts`| `<userId>` (no prefix)        | 3      |
| `messaging`       | `messaging/messaging.consumer-group.ts`                | `<messageId>` (no prefix)     | 1      |
| `timer-event-log` | `timers/timer-event-log.consumer-group.ts`             | `user:<userId>`               | 1      |

Prefixes are not consistent across groups. That is harmless — keys only
collide within one queue — but worth normalising when next touched.

`email` is **gone**. It was declared on `TagUpdated`, had no handler and never
did; the old dispatcher created a `tag.updated.email` queue and enqueued jobs
nothing would ever work. With groups discovered from handlers, an orphan group
cannot exist.

`attention-items` and `calendar-sync` both key on the user. They are separate
queues, so they neither block nor order against each other — a calendar event is
processed once per group, in parallel.

## attention-items → `user:<id>`

Fifteen events, across three handler classes in `attention-items/handlers/`.
`orderingKeyFn` picks the first field present:

| Field             | Events                                                                          |
| ----------------- | ------------------------------------------------------------------------------- |
| `sentToUserId`    | `message.created`, `message.updated` (user recipient)                           |
| `sentToGuestId`   | `message.created`, `message.updated` (guest recipient) — keyed `user:<guestId>` |
| `assigneeUserId`  | `task.upserted`, `task.deleted`, `task.batch.upserted`, `task.batch.deleted`    |
| `suggesteeUserId` | `task.suggestion.created`, `task.suggestion.resolved`, `task.suggestion.updated`|
| `userId`          | `message.status.changed`, `tag.updated`, `tag.deleted`, `calendar.event.*`      |

Anything else falls back to `user:unknown` — one shared key for every such
event. No current event reaches it; treat reaching it as a bug.

The suggestion events key on the **suggestee**, matching
`task-attention.handler.ts` — `onTaskSuggested` creates the attention item under
`payload.suggesteeUserId`.

Guest-recipient message events produce jobs the handler ignores
(`createAttentionItemsForMessage` returns early without `sentToUserId`). They
are cheap, but they are jobs.

## suggestion-sync → `assignee:<assigneeUserId>`

`task.upserted`, `task.batch.upserted`, handled in `task-suggestions.service.ts`.

Kept deliberately separate from `attention-items` — sharing a queue would split
each event between the two consumers rather than delivering it to both.

## calendar-sync → `<userId>`

`calendar.event.created`, `calendar.event.updated`, `calendar.event.deleted`,
handled in `calendar-integrations/sync/calendar-sync.event-handler.ts`. This
group calls external providers, which is what the 120s expiry is sized for.

## messaging → `<messageId>`

`attention.message.synced` only, handled in
`messaging/handlers/attention-message.handler.ts`. Keyed on the message rather
than the thread: the only ordering that matters here is status changes to the
same message.

## timer-event-log → `user:<userId>`

`timer.lifecycle`, handled in `timers/timers.event-log.handler.ts`.

## Fan-out happens at the producer

An earlier design had `attention-items` resolve one message event into several
keys and emit one job per participant. The implementation fans out **before**
the outbox instead: `MessagingService.notifyMessage` publishes
`message.created` / `message.updated` once per recipient, each carrying either
`sentToUserId` or `sentToGuestId`. The sender is excluded.

Consequences:

- `orderingKeyFn` returns a single `string`, never a list.
- One outbox row is one job per group, so the outbox row id works as the job id.
- The realtime leg receives one event per recipient too. `ws.gateway.ts` emits
  to the recipient's room **and** the thread room on each, so the thread room
  gets N copies; a thread whose only participant is the sender gets none.

## Producer changes (all shipped)

| Event                      | Field added                         | Where                                               |
| -------------------------- | ----------------------------------- | --------------------------------------------------- |
| `task.deleted`             | `assigneeUserId`                    | `tasks.service.ts`                                  |
| `task.batch.deleted`       | `assigneeUserId`                    | `task-batches.service.ts`                           |
| `task.suggestion.resolved` | `suggesteeUserId`                   | `task-suggestions.service.ts` — accept, reject, rescind |
| `task.suggestion.updated`  | `suggesteeUserId`                   | `task-suggestions.service.ts#editPayload`           |
| `message.created/updated`  | `sentToUserId` / `sentToGuestId` (replaces `participantUserIds` / `participantGuestIds`) | `messaging.service.ts#notifyMessage` |
| `message.status.changed`   | `userId` (not `participantUserIds`, as first planned) | `messaging.service.ts#publishManagedStatusChanged` |
| `attention.message.synced` | `userId` (not `threadId`, as first planned)           | `attention-items.service.ts`                       |

## Invariants for anyone adding an event

1. **The key function must be total.** `key_strict_fifo` has a CHECK that
   `singleton_key` is never null; one null fails the INSERT for the whole
   dispatch batch, not just the offending event. If an event has no natural
   domain, key on something unique to it (e.g. its own id) — unique keys block
   nothing.
2. **Ordering only exists between events that produce the same key.** If two
   event types must be ordered relative to each other, they must resolve to the
   same key in that group.
3. **Adding an event to a group is a queue-wide decision.** The key contract is
   shared by every handler in the group.
4. **One group, one const.** Every `@EventHandler` of a group must pass the same
   `ConsumerGroup` instance. Two objects with the same `name` throw at
   bootstrap.
5. **One handler per `(group, event)`.** The runtime throws at bootstrap on a
   duplicate.
6. **A durable handler is what makes an event dispatchable.** The dispatcher
   only drains event types that have a durable handler in its process; without
   one, rows stay in the outbox.
7. **`@EventHandler` without a group is realtime.** A `Dual` event needs one
   realtime handler (no group) and one durable handler per group; passing a
   group on a `Realtime` event throws.
8. **Handlers must be idempotent.** Retries, expiry overlap and a future replay
   all re-deliver.
