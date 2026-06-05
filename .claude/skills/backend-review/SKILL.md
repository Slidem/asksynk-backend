---
name: backend-review
description: >
  Review staged or recent git changes for bugs, missed edge cases, security
  issues, and best-practice violations. Runs tests if relevant. Use when
  the user says "review", "check my diff", "what did I miss", "code review",
  "CR", "look at my changes", "pre-commit check", or anything related to
  reviewing code before committing or pushing.
allowed-tools: Read, Grep, Glob, Bash
---

# Code Review

Review the current git diff and provide actionable feedback.

## Step 1 — Get the diff

Run these in order, use the first that returns output:

1. `git diff --staged`
2. `git diff`
3. `git diff HEAD~1`

If the user provides a specific commit, branch, or range, use that instead.
Store the list of changed files for the next steps.

## Step 2 — Read full file context

For every changed file, read the **entire file** — not just the diff hunks.
You need surrounding context (imports, class structure, related methods) to
avoid false positives.

## Step 3 — Analyze

Check each category in priority order. See `references/review-checklist.md`
for the detailed checklist.

**Priority 1 — Bugs & Logic**:
Missing `await`, null access without guards, off-by-one, race conditions,
incorrect boolean logic.

**Priority 2 — Security**:
Raw SQL in `.execute()` calls, missing auth guards on new endpoints, sensitive
data in logs or error messages, missing validation decorators on DTO fields,
IDOR (accessing resources without ownership checks).

**Priority 3 — Error Handling**:
Silent catch blocks, everything returning 500, uncaught promise rejections,
missing transaction rollback on error paths.

**Priority 4 — Database**:
N+1 queries, missing indexes for new WHERE/ORDER BY columns, schema changes
without a migration, `.insert()`/`.update()` without `.returning()` when the
result is needed.

**Priority 5 — Tests**:
Does the change touch business logic? Are there tests? Do they cover the
unhappy path?

Skip pure formatting or style preferences unless they violate a lint rule.

## Step 4 — Run tests (if applicable)

```bash
npm test -- --passWithNoTests 2>&1 | tail -30
```

Report pass/fail counts and any failures tied to the changed code.

## Step 5 — Output

```
## Review Summary
**Risk level**: Low / Medium / High
**Diff scope**: N files changed, +X / -Y lines
**Test result**: X passed, Y failed / not run

## Issues

### 🔴 Critical
**[C1] Title** — `file.ts:42`
Problem: ...
Impact: ...
Fix: (code snippet)

### 🟡 Warning
**[W1] Title** — `file.ts:88`
Problem: ...
Fix: ...

### 💡 Suggestion
**[S1] Title** — `file.ts:120`
...

## What Looks Good
- (brief positive callouts)
```

If there are zero issues, say so — don't manufacture problems.
