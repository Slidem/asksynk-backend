# 05 — Persistence

One Postgres schema per context. No FKs across schemas except to `identity.users`.
Repositories return aggregates; queries return views.
→ [ADR 0001](adr/0001-schema-per-context.md) (including the case against).

## 1. Schema ownership

| Schema          | Tables                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `tagging`       | `tags`                                                                                                                              |
| `attention`     | `attention_items`, `attention_item_tags`                                                                                            |
| `scheduling`    | `calendars`, `calendar_events`, `calendar_event_exceptions`, `calendar_event_tags`, `calendar_integrations`, `calendar_event_links` |
| `conversations` | `message_threads`, `thread_participants`, `messages`, `message_tags`, `message_attachments`                                         |
| `tasks`         | `tasks`, `task_batches`, `task_suggestions`, `task_tags`, `task_batch_tags`                                                         |
| `focus`         | `user_timers`, `user_timer_settings`, `user_timer_events`                                                                           |
| `network`       | `user_invites`, `user_network`                                                                                                      |
| `sharing`       | `public_views`, `public_view_guests`                                                                                                |
| `files`         | `attachments`                                                                                                                       |
| `identity`      | `users`, `user_settings`, `sessions`, `accounts`, `verifications`                                                                   |
| `platform`      | `events_outbox`, `events_dead_letters`                                                                                              |

Untouched: `pgboss` (pg-boss), `drizzle` (migration journal), the `rrule` extension.

## 2. Declaring tables (Wave 7)

```ts
// apps/migrations/src/schema/scheduling/_schema.ts
export const scheduling = pgSchema("scheduling");

// apps/migrations/src/schema/scheduling/calendarEvents.ts
export const calendarEvents = scheduling.table("calendar_events", {
  /* ... */
});
```

Layout `apps/migrations/src/schema/<context>/`. `drizzle.config.ts` already globs
`./src/schema` recursively; add `schemaFilter: ["public", "identity", "tagging",
"attention", "scheduling", "conversations", "tasks", "focus", "network", "sharing",
"files", "platform"]`. One migration history, as today.

A context's `infrastructure/persistence/` imports only its own schema folder (+
`identity/`) — enforced by the `schema-ownership` dependency-cruiser rule.

## 3. Foreign keys

**Within a schema only. Exception: `users(id)`** — it is the tenant key on ~18
tables. Dropping it would turn "delete my account" into a ten-context saga for no
real autonomy gain. `references(() => users.id, { onDelete: "cascade" })` stays.
(`tags.user_id` has no FK today; add it in Wave 7.)

**Nine FKs become soft references** (`uuid`, no FK, with a comment naming the owner):
`calendar_event_tags.tag_id`, `message_tags.tag_id`, `task_tags.tag_id`,
`task_batch_tags.tag_id`, `message_threads.public_view_id`,
`thread_participants.guest_id`, `messages.sender_guest_id`, `messages.suggestion_id`,
`message_attachments.attachment_id`. `calendars.integration_id` keeps its FK (both
sides in `scheduling`).

What replaces the cascade:

1. **Before dropping tag FKs, each tagged context needs its own `tag.deleted`
   handler.** Today only attention handles it (and cleans only
   `attention_item_tags`); the other four junction tables rely on `ON DELETE CASCADE`.
2. `attention_item_tags` already lives without an FK by design — proven pattern.
3. A periodic orphan-count `@CronJob` that logs (Wave 7.5).

## 4. Raw SQL

Under schemas, a cross-context query errors instead of passing silently — including
inside raw `sql` strings, which lint can't see. Cost: every `sql` template (33 in
context repositories) must be audited for unqualified table names before the move.
Heaviest: `attention-items.repository.ts`, `calendar-events.repository.ts`,
`messaging.repository.ts`. That is why the schema move is the last wave.

## 5. Repositories vs queries

| Port           | Returns                                     | Declared in                                                       | Implemented in                                               |
| -------------- | ------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| **Repository** | the aggregate root, never rows or partials  | `<ctx>/domain/ports/<x>.repository.ts`                            | `<ctx>/infrastructure/persistence/drizzle-<x>.repository.ts` |
| **Query**      | flat view types; any SQL within the context | `<ctx>/domain/ports/<x>.query.ts` or `<ctx>/contract/<x>.port.ts` | `<ctx>/infrastructure/persistence/<x>.query.ts`              |

View types live in `application/read/`. `messaging.repository.ts` is the clearest
fusion of both today (`ThreadListItem`, `ThreadStats`, … next to aggregate loads).
CQRS in its cheapest form: two interfaces, one database.

## 6. Database views

Within a context only, when the same non-trivial SELECT is needed in 3+ places:
`<context>.v_<thing>` in a custom migration. **Never across schemas** — a view is a
join with a nicer name and invisible to lint.

## 7. Schema changes queued

| Change                                                                                                    | Wave    | Risk                                                                  |
| --------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------- |
| `attention_items`: `source_context` / `source_kind` / `source_id` + unique index; drop `metadata`, `type` | 6       | **High** — data migration ([06 §8](06-attention-core.md#8-migration)) |
| Drop the 9 cross-context FKs                                                                              | 7.2     | Low (needs the `tag.deleted` handlers first)                          |
| `pgSchema` per context                                                                                    | 7.3     | Medium-high                                                           |
| `attachments.placement` → `visibility` + `owner_context`                                                  | 8.2     | Low                                                                   |
| `tags`: unique on `(user_id, lower(name))`                                                                | backlog | Medium — dedupe case variants first                                   |
