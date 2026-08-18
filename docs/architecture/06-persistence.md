# 06 — Persistence

One Postgres schema per bounded context. No foreign keys across them, with one
sanctioned exception. Repositories return aggregates; queries return views.

> The schema-per-context decision has real costs. They are argued out in
> [ADR 0001](adr/0001-schema-per-context.md), including the case _against_, which is
> stronger than it first appears.

---

## 1. Schema ownership

All 33 tables, each assigned to exactly one context.

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
| `platform`      | `events_outbox`                                                                                                                     |

Already-separate schemas that stay separate: `pgboss` (pg-boss owns it), `drizzle`
(migration journal), and whatever the `rrule` extension installs.

Note where the tag junction tables land: **each belongs to the tagged context**, not
to `tagging`. "This message carries tag X" is a fact about the message.

---

## 2. Declaring tables

```ts
// apps/migrations/src/schema/scheduling/_schema.ts
import { pgSchema } from "drizzle-orm/pg-core";
export const scheduling = pgSchema("scheduling");
```

```ts
// apps/migrations/src/schema/scheduling/calendarEvents.ts
import { scheduling } from "@/migrations/schema/scheduling/_schema";

export const calendarEvents = scheduling.table(
  "calendar_events",
  {
    id: uuid("id")
      .primaryKey()
      .notNull()
      .default(sql`uuidv7()`),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }), // same schema — fine
    // ...
  },
  (t) => [
    index("idx_calendar_events_calendar_start").on(t.calendarId, t.start),
  ],
);
```

Folder layout mirrors the contexts:

```
apps/migrations/src/schema/
  identity/     _schema.ts  users.ts  userSettings.ts  auth.ts
  tagging/      _schema.ts  tags.ts
  attention/    _schema.ts  attentionItems.ts  attentionItemTags.ts
  scheduling/   _schema.ts  calendars.ts  calendarEvents.ts  calendarEventsExceptions.ts
                            calendarEventTags.ts  calendarIntegrations.ts  calendarEventLinks.ts
  conversations/ …   tasks/ …   focus/ …   network/ …   sharing/ …   files/ …
  platform/     _schema.ts  outbox.ts
```

`drizzle.config.ts` already points at `schema: "./src/schema"` and drizzle-kit globs
recursively, so the folder move needs **no config change**. One addition is required
so drizzle-kit does not try to manage schemas it does not own:

```ts
// apps/migrations/drizzle.config.ts
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  out: "./migrations",
  schemaFilter: [
    "public",
    "identity",
    "tagging",
    "attention",
    "scheduling",
    "conversations",
    "tasks",
    "focus",
    "network",
    "sharing",
    "files",
    "platform",
  ],
  dbCredentials: { url: databaseUrl },
});
```

`drizzle-kit generate` emits `CREATE SCHEMA IF NOT EXISTS` for each. One migration
history, one `drizzle-kit` invocation, as today.

**How a context declares what it owns:** its tables live in
`apps/migrations/src/schema/<context>/`, and only its own
`infrastructure/persistence/*` may import them. Mechanically enforced —
see [04-layering.md §8](04-layering.md) and §7 below.

**How a context reads data it does not own:** a `contract/` port implemented by the
owner, or a projection it owns fed by events. Never a join. Never a cross-schema
view.

---

## 3. Foreign keys

### The rule

**Foreign keys only within a schema.** One sanctioned exception: `identity.users(id)`.

### Why `users` is excepted

`user_id` appears on 17 tables. It is not really a cross-context reference — it is the
**tenant key**, present in every context because every row in the system belongs to
exactly one person.

Dropping those FKs would mean losing `ON DELETE CASCADE` on account deletion, turning
"delete my account" into a ten-context saga that must be written, tested and kept
correct forever. That is a large, permanent cost for a boundary that is not actually
being crossed in any meaningful sense — no context _queries_ another's data through
`users`; they merely share an identifier.

So: **`references(() => users.id, { onDelete: "cascade" })` stays everywhere.** It is
a deliberate, bounded, documented exception, not an oversight. If the day ever comes
that a context genuinely leaves this database, it is a known and finite piece of work.

### The nine that go

| FK                                                       | Was                     | Becomes       |
| -------------------------------------------------------- | ----------------------- | ------------- |
| `calendar_event_tags.tag_id` → `tags.id`                 | scheduling → tagging    | `uuid`, no FK |
| `message_tags.tag_id` → `tags.id`                        | conversations → tagging | `uuid`, no FK |
| `task_tags.tag_id` → `tags.id`                           | tasks → tagging         | `uuid`, no FK |
| `task_batch_tags.tag_id` → `tags.id`                     | tasks → tagging         | `uuid`, no FK |
| `message_threads.public_view_id` → `public_views.id`     | conversations → sharing | `uuid`, no FK |
| `thread_participants.guest_id` → `public_view_guests.id` | conversations → sharing | `uuid`, no FK |
| `messages.sender_guest_id` → `public_view_guests.id`     | conversations → sharing | `uuid`, no FK |
| `messages.suggestion_id` → `task_suggestions.id`         | conversations → tasks   | `uuid`, no FK |
| `message_attachments.attachment_id` → `attachments.id`   | conversations → files   | `uuid`, no FK |

`calendars.integration_id` → `calendar_integrations.id` **keeps its FK** — after the
merge, both tables live in `scheduling`.

The pattern to copy is already in the codebase and already correct:

```ts
// scheduling/calendarEventLinks.ts — this is how a soft reference looks
// Correlates to the other side by id, deliberately without an FK.
asksynkEventId: uuid("asksynk_event_id").notNull(),
```

Every soft reference gets a comment naming the owning context:

```ts
// conversations/messaging.ts
// Soft reference into `sharing`. Liveness is checked through
// sharing/contract/public-link.port.ts — conversations never reads sharing's columns.
publicViewId: uuid("public_view_id"),
```

### What you give up, honestly

Dropping these FKs means the database will no longer prevent an orphaned
`message_tags` row after a tag is deleted, or a `messages.suggestion_id` pointing at a
deleted suggestion.

Three mitigations, in order of importance:

1. **Most of these already have event-driven cleanup.** `tag.deleted` already fans out
   to a handler that removes associations. That path becomes the _only_ path rather
   than a belt alongside the database's braces.
2. **`attention` already lives without these FKs and relies on it.**
   `attention_item_tags.tag_id` has no FK _by design_, so ghost rows survive tag
   deletion and remain findable by the tag-deleted handler. The pattern is proven
   here.
3. **Add a periodic consistency check** rather than a constraint — a scheduled job
   that counts orphans per soft reference and logs. Cheap, catches handler bugs, and
   does not couple the schemas.

---

## 4. Cross-schema queries are now impossible by construction

This is the point of the exercise. `attention-items.repository.ts:355-423` currently
issues raw SQL naming `calendar_events`, `calendar_event_tags` and
`calendar_event_exceptions`. After the move those are `scheduling.calendar_events`
etc., and the query simply breaks unless it moves into `scheduling` — which is exactly
where it belongs.

The boundary stops depending on anyone remembering it.

**One consequence to plan for:** every existing raw `sql\`\``template must be audited
for unqualified table names. There are several — concentrated in`attention-items.repository.ts`(8 sites),`calendar-events.repository.ts`(7) and`messaging.repository.ts` (4). Most reference only their own tables and just need
qualification. This is the main source of risk in the schema move, and it is why that
step is sequenced last, after the code boundaries are already clean.

---

## 5. Repositories return aggregates. Queries return views.

These are **different ports** and should be different files. The current
`messaging.repository.ts` fuses them — it exports `ThreadListItem`,
`ThreadMessageListItem`, `ThreadStats` and `ThreadParticipantRow` alongside real
aggregate loading. It is the clearest example in the codebase of the two
responsibilities being merged.

| Port kind      | Returns                                                                                               | Declared in                                                                             | Implemented in                                               |
| -------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Repository** | the **aggregate root** — `CalendarEvent`, `AttentionItem`, `Timer`. Never rows, never partial shapes. | `<ctx>/domain/ports/<x>.repository.ts`                                                  | `<ctx>/infrastructure/persistence/drizzle-<x>.repository.ts` |
| **Query**      | a flat view type. Arbitrary joins and SQL within the context.                                         | `<ctx>/domain/ports/<x>.query.ts` (private) or `<ctx>/contract/<x>.port.ts` (published) | `<ctx>/infrastructure/persistence/<x>.query.ts`              |

View **types** live in `<ctx>/application/read/`, not in the repository file.

```ts
// domain/ports/thread.repository.ts — write side
export abstract class ThreadRepository {
  abstract getById(id: string): Promise<Thread | null>;
  abstract save(thread: Thread): Promise<void>;
}

// domain/ports/conversation.query.ts — read side
export abstract class ConversationQuery {
  abstract listThreadsForUser(userId: string): Promise<ThreadListItem[]>;
  abstract threadStats(threadId: string): Promise<ThreadStats>;
}
```

This is CQRS in its cheapest possible form: two interfaces over one database. No event
sourcing, no separate store, no synchronisation. Microsoft's
[CQRS guidance](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs)
explicitly endorses separate models over a single data store as the practical
middle ground, and that is all that is being adopted.

---

## 6. Database views

**Within a context only**, and only when the same non-trivial SELECT is needed in
three or more places. Name it `<context>.v_<thing>` and create it in a custom
migration inside that context's folder.

**Never across schemas.** A cross-schema view is a join with a nicer name: it
re-creates precisely the coupling the port layer removes, and it is invisible to the
boundary linter. The tempting case — the `rrule.between` occurrence expansion — is
exactly the one that must be a port instead.

A future `reporting` schema for analytics may read across contexts, explicitly
read-only and explicitly outside the write path. That is a different concern and it
gets its own decision when it arrives.

---

## 7. Schema changes worth making while in there

| Change                                                                                             | Why                                                                                                               | Risk                                                                                                |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `tags.name` `.unique()` → `uniqueIndex on (userId, lower(name))`                                   | **Live bug.** Two users cannot both have a tag called "urgent".                                                   | Medium — the migration **must dedupe existing rows first**, or it will fail on a non-empty database |
| `attention_items`: typed `source_channel` / `source_id` + unique index; drop the `metadata` probes | Kills four unindexed jsonb scans and three speculative enum values; precondition for adding channels cheaply      | **High** — a real data migration. See [07](07-attention-core.md)                                    |
| `attachments.placement` (`public \| message`) → `visibility` + `owner_context`                     | Removes consumer-context names from the storage table; the existing resolver registry already dispatches on a key | Low — `message → (restricted, 'conversations')`                                                     |
| `events_outbox`: index on `dispatched_at`; retention job for realtime-only rows older than 30 days | Realtime rows are never marked dispatched and accumulate forever; the poll query will sequential-scan             | None                                                                                                |

---

## 8. Enforcement

Two mechanisms, because they are good at different things.

**`dependency-cruiser` for the cross-boundary rules.** It resolves the `@/api/*`,
`@/shared/*` and `@/migrations/*` aliases from `tsconfig.json` natively, and expresses
"context A may reach context B only via `contract/`" directly with captured groups.

```js
// .dependency-cruiser.js  (excerpt — see 08-roadmap.md for the full config)
{
  name: "schema-ownership",
  comment: "A context's infrastructure may only import its own schema folder (+ identity/).",
  severity: "error",
  from: { path: "^apps/api/src/([^/]+)/infrastructure/" },
  to:   { path: "^apps/migrations/src/schema/(?!$1/|identity/)" },
},
{
  name: "no-foreign-repository",
  comment: "Never import another context's repository.",
  severity: "error",
  from: { path: "^apps/api/src/([^/]+)/" },
  to:   { path: "^apps/api/src/(?!$1/)[^/]+/.*\\.repository\\.ts$" },
},
```

**`eslint-plugin-boundaries` for the in-layer rules**, because the feedback appears
in the editor as you type — that is where the domain-purity rule earns its keep. Full
config in [04-layering.md §8](04-layering.md).

> Both configs need verification against installed versions before committing.
> `dependency-cruiser`'s backreference syntax in `to.path` (`$1` vs `$<name>`) and
> `eslint-plugin-boundaries` v7's options shape have both changed across releases.

---

Next: [07-attention-core.md](07-attention-core.md) — the heart of the product.
