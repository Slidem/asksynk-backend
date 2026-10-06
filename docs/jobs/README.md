# Jobs

Docs for the typed jobs API: scheduled, async and cron jobs on top of
pg-boss.

**Status:** built.

Decision record: [ADR 0007](../architecture/adr/0007-unified-typed-jobs.md).

| Doc                                        | What it covers                                                     |
| ------------------------------------------ | ------------------------------------------------------------------ |
| [01-unified-jobs.md](01-unified-jobs.md)   | Why, decisions, public API, internals, timers + calendar migration |
| [02-execution-plan.md](02-execution-plan.md) | File-by-file implementation plan, tests, checkpoints, deploy    |
| [../events/04-cleanup-execution-plan.md](../events/04-cleanup-execution-plan.md) | Follow-up: `@CronJob` (crons inline in the decorator) |
