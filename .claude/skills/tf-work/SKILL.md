---
name: tf-work
description: Implement a single taskflow sub-task by its id, strictly within its owns: boundary. Use when asked to work on / implement a sub-task (ST-NNN). Runs well inside a worktree.
---

# tf-work

Input: a **sub-task id** `ST-NNN`.

1. Read the sub-task file `tasks/*/subtasks/<ST-NNN>-*.md`. Treat it as a self-contained
   contract: `Context`, `Plan`, `Changes contained`, `Out of scope`, `Verification`.
2. `taskflow status <ST-NNN> in-progress`.
3. Implement **strictly within the `owns:` paths**. Never edit files outside `owns:` —
   those belong to other sub-tasks running in parallel.
4. Run the `Verification` steps / tests.
5. Fill `## Implementation output`. For backend work fill `## API changes`; otherwise
   delete that section.
6. `taskflow check <ST-NNN>` — fix until it passes.
7. `taskflow status <ST-NNN> in-review`.

Designed to run inside a git worktree on the sub-task's `branch`. All status changes go
through `taskflow`; never hand-edit frontmatter or `tasks/TASKS.md`.
