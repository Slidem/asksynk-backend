# ADR 0003 — `calendar-events` and `calendar-integrations` merge into `scheduling`

**Status:** Accepted
**Date:** 2026-08-07
**Deciders:** Mihai Alexandru

---

## Context

`calendar-events` (2,076 LOC) and `calendar-integrations` (2,135 LOC) are separate
NestJS modules. They are also the most tightly coupled pair in the codebase.

**The measured evidence:**

- **15 cross-module import statements** — the heaviest edge in `apps/api/src` by a
  wide margin.
- **7 of them import a repository**, across 4 files:

  | File                                                               | Imports                                          |
  | ------------------------------------------------------------------ | ------------------------------------------------ |
  | `calendar-integrations/services/calendar-sync.service.ts`          | `CalendarRepository`, `CalendarEventsRepository` |
  | `calendar-integrations/services/calendar-integration.service.ts`   | `CalendarRepository`, `CalendarEventsRepository` |
  | `calendar-integrations/services/calendar-outbound-sync.service.ts` | `CalendarRepository`, `CalendarEventsRepository` |
  | `calendar-integrations/sync/calendar-sync.scheduler.ts`            | `CalendarRepository`                             |

- The rest import each other's **entities** (`Calendar`, `CalendarEvent`) and
  **utilities** (`utcToIso`, `parseIsoWallClockInTimezone`).
- **A foreign key**: `calendars.integration_id` → `calendar_integrations.id`.
- `calendar-events/repositories/calendar.repository.ts` imports the
  `calendar_integrations` table — the coupling runs both ways.

**The clinching detail:** `calendar-sync.service.ts:283` does
`applyFields(event, fields)` — mutating another module's entity, field by field, from
outside. That is not two bounded contexts communicating. That is one context with a
folder boundary in the way.

## Options considered

### A. Keep them separate; put an anti-corruption layer between them

`calendar-integrations` would stop importing repositories and call a published
`CalendarEventsPort` instead.

**Against:** an ACL exists to protect a model from a _different_ model. These two share
the same model — the same `Calendar`, the same `CalendarEvent`, the same recurrence
rules, the same timezone semantics. There is nothing to translate. The ACL would be a
pass-through facade whose only purpose is to make a wrong boundary look right, and it
would add a hop to every sync operation.

### B. Keep them separate; duplicate the model

**Against:** two `CalendarEvent` types with a mapper between them, kept in sync by
hand, for zero benefit. Rejected immediately.

### C. Merge into one `scheduling` context _(chosen)_

---

## Decision

**Option C.** One `scheduling` context owning `calendars`, `calendar_events`,
`calendar_event_exceptions`, `calendar_event_tags`, `calendar_integrations` and
`calendar_event_links`.

The real boundary was never between "events" and "integrations". It is between
**asksynk's calendar model** and **Google's** — and that boundary is already correctly
placed and correctly implemented, at `providers/google-calendar.provider.ts`.

```
scheduling/
  domain/          Calendar, CalendarEvent, RecurrenceRule, Occurrence,
                   CalendarIntegration, CalendarEventLink
  application/     calendar-events, calendar-integration, inbound sync, outbound sync
  infrastructure/
    persistence/   drizzle repositories + occurrence.query.ts (the rrule CTE moves here)
    acl/           google-calendar.provider.ts   <- THE boundary. Named for what it is.
  presentation/    rest/ · events/ · jobs/
```

The merge is **a file move with no behaviour change**.

---

## Consequences

### Positive

- **The heaviest coupling edge in the codebase disappears** — 15 imports become
  intra-context calls, including all 7 repository imports.
- `calendars.integration_id` becomes an intra-schema foreign key and keeps its
  cascade, rather than becoming one of the FKs that ADR 0001 drops.
- `applyFields(event, fields)` becomes `event.applyProviderFields(fields)` — a method
  on the aggregate that can enforce its own invariants and report whether anything
  changed.
- Recurrence gets **one owner**. Today it has two implementations: pure TypeScript in
  `recurrence.utils.ts`, and a `rrule.between` SQL CTE inside `attention-items`. After
  the merge, both live in `scheduling` and can converge.
- The real anti-corruption layer gets named as such, which makes it obvious where a
  second provider (Outlook, CalDAV) plugs in.
- Two integration test suites now cover one context.

### Negative

- `scheduling` becomes the largest context at ~4,200 LOC. That is acceptable — it is
  cohesive, and the layer template gives it internal structure. If it later grows
  uncomfortable, the natural seam is _provider sync_ versus _native calendar_, which
  the folder layout already anticipates.
- One large commit. Mitigated by it being a pure move: `git log --follow` still works,
  and the two existing integration suites are the verification.

### Neutral

- The mirror/echo-skip design (`origin: "imported" | "mirrored"` on
  `calendar_event_links`, with the inbound path skipping mirrors and the outbound path
  refusing to push imports back) is genuinely good and **stays exactly as it is**.
- `calendar_event_links.asksynk_event_id` keeps its deliberate missing FK. It
  correlates to an _external_ system's id space, which is precisely what an ACL's
  correlation table should do.

---

## What this does _not_ merge

`scheduling` publishes `CalendarOccurrencePort` for `attention` to consume. That
boundary is real: `attention` needs to know _when the next timeblock carrying this tag
occurs_, and nothing more. It must never learn what a `CalendarEvent` is.

That is the difference between the two cases. `calendar-integrations` needed the whole
model; `attention` needs one question answered.

---

## Verification

1. `calendar-events.integration.test.ts` passes unchanged.
2. `attention-items.events-handler.integration.test.ts` passes unchanged.
3. `grep -c "@/api/calendar-integrations" apps/api/src -r` → 0.
4. A manual Google sync round-trip: import an external event, mirror a native one,
   confirm neither echoes back.

## References

- Evans, _Domain-Driven Design_ — Bounded Context, Anti-Corruption Layer
- [Microsoft — Anti-Corruption Layer pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer)
- Grzybek, [Modular Monolith: Integration Styles](https://www.kamilgrzybek.com/blog/posts/modular-monolith-integration-styles)
