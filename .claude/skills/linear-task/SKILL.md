---
name: linear-task
description: Work a backend/API Linear ticket end to end from its issue ID. Use this whenever the user references a Linear issue (e.g. "work on ENG-123", "pick up BE-45", a linear.app issue URL, or "implement this ticket") and the work is server-side — NestJS modules, Drizzle schema/migrations, API endpoints, business logic, jobs, or data model. It fetches the issue, clarifies every unknown before any code is written, flips the issue to In Progress, implements, verifies, and marks it Done only after the user explicitly confirms. Use it even if the user just pastes an issue ID with no other instruction.
---

# Linear task

Drive a single backend Linear ticket from "I have an ID" to "the user confirmed it's done" — without skipping clarification and without prematurely closing the issue.

You have the Linear MCP plugin available. Use whatever issue tools it exposes (fetch issue, update/save issue, list issue statuses, create comment). Tool names vary by plugin version — adapt to what's installed rather than assuming a fixed name.

## Two rules that override convenience

1. **Do not write a line of implementation code until the task is unambiguous.** A wrong build costs far more than a few questions. If anything is unclear, stop and ask.
2. **Do not move the issue to Done on your own.** Only the user decides it's done. You may reach "ready for review", but the final transition waits for their explicit confirmation.

## Phase 1 — Load the issue

Given the identifier (e.g. `ENG-123`) or a Linear URL (extract the identifier from the URL):

- Fetch the issue: title, description, acceptance criteria, current workflow state, team, assignee, priority, labels, project, parent, sub-issues, comments, and attachments/links (specs, designs, related PRs).
- Read the comment thread. Requirements are often refined there, not in the description.
- If the issue has sub-issues, read them and decide with the user whether this run covers the parent, one sub-issue, or all of them.

If the identifier doesn't resolve, say so and ask for a correct one. Don't guess.

## Phase 2 — Clarify (hard gate)

Reconstruct what "done" means for this ticket, then find the gaps. Treat each of these as a blocker until resolved:

- Description empty or just restates the title → ask what the actual behavior/contract should be.
- Acceptance criteria missing or vague ("make it work", "handle errors") → ask for concrete expected behavior, inputs, and outputs.
- Contradictions between description and comments → surface them and ask which wins.
- Undefined API contract: request/response shape, validation rules, status codes, pagination, sorting, auth/permissions, idempotency, error semantics.
- Data-model questions: new tables/columns, nullability, indexes, migration + backfill strategy, transaction boundaries.
- Side effects: events to emit, jobs to enqueue, external calls, eventual-consistency expectations.
- Non-functional: performance/volume expectations, tenancy/scoping, rate limits.
- Scope boundaries: what is explicitly out of scope for this ticket.

Edge cases to check before proceeding:

- Issue already **Done / Canceled / Duplicate** → confirm the user really wants to (re)open work on it.
- Issue **assigned to someone else** → flag it and confirm you should proceed.
- Issue is a **parent epic** with many sub-issues → confirm the intended scope.

Ask your questions **concisely and batched** (not one at a time), each phrased so a one-line answer resolves it. Then wait. Re-loop until there are zero open unknowns. Only when the user has answered everything and signaled "go" do you continue.

## Phase 3 — Mark In Progress

Once the task is clear and the user is ready:

- List the team's workflow states and pick the one of type **started** — its name varies ("In Progress", "Started", "In Development"). Set the issue to that state.
- If it's already in a started state, leave it.
- Optionally add a short comment noting work has begun, including any assumptions agreed in Phase 2 — this leaves a trail on the ticket.
- If the status update fails (e.g. permissions), don't block: warn the user, ask them to flip it manually, and continue.

## Phase 4 — Implement

- Plan the change against the agreed contract. Follow the repo's existing conventions — module structure, DTO/validation patterns, Drizzle schema + migration workflow, error handling, testing style. Match what's already there rather than importing new patterns.
- Keep the change scoped to the ticket. If you discover adjacent issues, note them for the user instead of silently expanding scope.
- Write migrations deliberately; explicitly call out any that are destructive or need a backfill.

## Phase 5 — Verify

Run the project's checks — typecheck, lint, build, and the relevant tests — and fix what breaks. If you added behavior, add or update tests covering it and the edge cases from Phase 2. Don't describe the work as finished while any check is red.

## Phase 6 — Hand off and confirm (hard gate on Done)

- Summarize what changed, mapped point-by-point to the acceptance criteria.
- Call out assumptions made, anything deferred, and any follow-ups.
- Ask the user to confirm it's done.

**Only after the user explicitly confirms**, transition the issue to the team's **completed** state (resolve its real name the same way as Phase 3) and optionally post a closing comment. If they want changes, stay in the loop and leave the status untouched.
