# ADR 0003 — `calendar-events` + `calendar-integrations` merge into `scheduling`

**Status:** Accepted (2026-08-07) · executed in Wave 2.2

## Context

The most tightly coupled pair in the codebase:

- 15 cross-module imports, 7 of them repositories (`calendar-sync.service`,
  `calendar-integration.service`, `calendar-outbound-sync.service`,
  `sync/calendar-sync.job-handlers` → `CalendarRepository` / `CalendarEventsRepository`);
  the rest are `Calendar`, `CalendarEvent`, `utcToIso`, `parseIsoWallClockInTimezone`.
- FK `calendars.integration_id` → `calendar_integrations.id`, and
  `calendar.repository.ts` joins `calendar_integrations` — coupling both ways.
- `calendar-sync.service.ts` mutates the other module's entity with
  `applyFields(event, fields)`.

## Options

- **A. Separate, with an ACL between.** Nothing to translate — same `Calendar`,
  `CalendarEvent`, recurrence and timezone semantics. A pass-through facade.
- **B. Separate, duplicated model.** Rejected.
- **C. Merge into `scheduling` _(chosen)_.**

## Decision

**C.** `scheduling` owns `calendars`, `calendar_events`, `calendar_event_exceptions`,
`calendar_event_tags`, `calendar_integrations`, `calendar_event_links`. The real
boundary is asksynk ↔ Google, already implemented by
`providers/google-calendar.provider.ts` → `scheduling/infrastructure/acl/`.

The merge is a file move with no behaviour change.

## Consequences

- **+** Heaviest coupling edge disappears; `calendars.integration_id` keeps its FK.
- **+** `applyFields` becomes `event.applyProviderFields(fields)` (Wave 5).
- **+** Recurrence gets one owner (TS utils + the rrule CTE moving out of attention).
- **+** A second provider (Outlook, CalDAV) has an obvious plug-in point.
- **−** `scheduling` is the largest context (~4.2k LOC). Natural future seam if
  needed: provider sync vs native calendar.
- **=** The `origin: imported | mirrored` echo-skip and the FK-less
  `calendar_event_links.asksynk_event_id` stay exactly as they are.

`attention` still gets only `CalendarOccurrencePort` — it needs one question
answered, not the model.

## Verification

`calendar-events.integration.test.ts` and `attention-items.events-handler.integration.test.ts`
pass unchanged; `grep -rc "@/api/calendar-integrations" apps/api/src` → 0; manual
Google round-trip (import external, mirror native, neither echoes).
