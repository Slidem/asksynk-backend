- In all interactions and commit messages, be extremely concise, and sacrifice grammar for the sake of concision.
- Don't overengineer (YAGNI)
- Keep best coding practices, and keep things simple

## Plan

- At the end of each plan, give me a list of unresolved questions to answer, if any. Make the questions extremely concise, sacrifice grammar for the sake of concision.
- Don't implement things we are not using (use the YAGNI principle)
- Don't design for backwards compatibility, as this project is in MVP state

## Development Notes

- **DON'T USER RELATIVE IMPORTS EXCEPT CONVEX** Use absolute imports for better maintainability
- **Keep components focused and testable**
- **Follow the established patterns for consistency**
- **DON'T USE BARREL EXPORTS**
- **Never fix linting issue** Skip linting issues, I'll fix any linting issue myself
- **Never fix import ordering, or unused imports** I'll fix those myself
- Local dev uses `localdev/` docker compose for Postgres + pgvector; Drizzle migrations live in `apps/migrations`
