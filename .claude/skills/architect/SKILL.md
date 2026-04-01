---
name: architect
description: >
  Plan and architect a new feature end-to-end. Analyzes the existing codebase
  to produce a technical design covering data model, API design, service layer,
  and implementation plan. Use when the user says "plan a feature", "architect",
  "design the system for", "how should I structure", "technical design", "RFC",
  "I need to build", or describes a new capability they want to add. Also
  triggers on "break this down into tasks" or "implementation plan".
allowed-tools: Read, Grep, Glob, Bash, WebFetch
---

# Feature Architecture & Planning

Produce a structured technical design by analyzing the existing codebase
and aligning new work with established patterns.

## Step 1 — Understand the Requirement

If the request is ambiguous, ask **one** focused clarifying question before
proceeding. Identify:

- The core user story (who, what, why)
- Scope boundaries (what's explicitly out of scope)
- Whether this spans backend only, frontend only, or both

## Step 2 — Scan the Existing Codebase

Before designing anything, understand what's already there:

1. Read the project's `CLAUDE.md` for conventions and stack details
2. List the module structure: `find src -maxdepth 2 -type d`
3. Check existing DB schema: `find src -name "*.schema.ts" -o -name "schema.ts" | head -20`
   then read the relevant schema files
4. Check existing routes and naming: `grep -rn "@Controller\|@Get\|@Post" src/ --include="*.ts" | head -30`
5. Look at how a similar feature is structured (module, controller, service, DTOs)
   to understand the local conventions

The goal is to **match existing patterns**, not invent new ones.

## Step 3 — Produce the Design Document

Use this structure:

```markdown
# Feature: [Name]

## Overview

One paragraph: what this feature does and the problem it solves.

## Data Model

### New Tables

(Drizzle schema snippet for each new table)

### Modified Tables

(columns added/changed, with migration notes)

### Indexes

(which indexes are needed and why)

### Relationships

(how new entities connect to existing ones — foreign keys, join tables)

## API Design

For each endpoint:

### `METHOD /api/v1/path`

- **Purpose**: one sentence
- **Auth**: guard required / public
- **Request**: TypeScript interface for body/query/params
- **Response**: TypeScript interface with example JSON
- **Validation**: key rules (max lengths, enums, required fields)
- **Errors**: non-obvious error conditions

## Service Layer

### Module: `[ModuleName]Module`

- Which existing module to extend, or new module to create
- Providers (services) with key method signatures
- Dependencies on other modules (imports)

### Key Service Methods

For each significant method:

- Signature with types
- Brief description of logic
- Transaction boundaries (if applicable)
- Side effects (events emitted, external calls)

## Edge Cases & Error Scenarios

Numbered list. For each:

- Scenario description
- How the system should handle it
- Which layer is responsible

## Open Questions

Things that need a decision before or during implementation.

## Implementation Plan

Ordered list of tasks. Each task should be:

- Small enough for a single PR
- Independently testable
- Listed with dependencies (which tasks must come first)

Mark which tasks can be parallelized.
```

## Step 4 — Self-Review

Before presenting the design, verify:

- Does this introduce unnecessary coupling between modules?
- Could this be simpler? (Apply YAGNI — remove anything speculative)
- How does every unhappy path resolve?
- Are there performance concerns at scale with the current DB approach?
- Does the implementation order actually work? (no task depends on something
  that comes later)

If you spot issues, fix the design before showing it. Don't present known
problems and hope the user catches them.

## References

Read `references/nestjs-patterns.md` for NestJS-specific conventions when
the feature involves backend work.
