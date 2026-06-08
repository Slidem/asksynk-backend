---
name: tf-plan
description: Decompose a taskflow task's notes into file-disjoint sub-tasks via the taskflow CLI. Use when asked to plan a task (by slug) into parallel-buildable sub-tasks. Never edits code.
---

# tf-plan

Input: a **task slug** (a folder under `tasks/`).

1. Read `tasks/<slug>/task.md` and every file in `tasks/<slug>/notes/`.
2. Propose a breakdown into sub-tasks where each sub-task:
   - maps to exactly one note via `source: <note-id>`,
   - has a **non-overlapping `owns:`** file/dir set (no two sub-tasks share or nest paths),
   - lists `depends_on` only when a real ordering is required.
     Present the proposal as a table: title · source note · owns paths · depends_on.
3. **Wait for the user to approve.** Do not write code or edit files.
4. On approval, run once per sub-task:
   ```
   taskflow subtask <slug> --source <note-id> --title "<title>" \
     --owns <path> [--owns <path> ...] [--depends-on <ST-id> ...]
   ```
5. Run `taskflow validate`. If it reports overlap/cycle/etc., adjust and re-run.
6. Run `taskflow regen` to rebuild `tasks/TASKS.md`.

Never hand-edit frontmatter or `tasks/TASKS.md`. All structural changes go through `taskflow`.
