- In all interactions and commit messages, be extremely concise, and sacrifice grammar for the sake of concision.
- Don't overengineer (YAGNI)
- Keep best coding practices, and keep things simple

## Plan

- At the end of each plan, give me a list of unresolved questions to answer, if any. Make the questions extremely concise, sacrifice grammar for the sake of concision.
- Don't implement things we are not using (use the YAGNI principle)
- Don't design for backwards compatibility, as this project is in MVP state

## Development Notes

- **Keep components focused and testable**
- **Follow the established patterns for consistency**
- **DON'T USE BARREL EXPORTS**
- **Never fix linting issue** Skip linting issues, I'll fix any linting issue myself
- **Never fix import ordering, or unused imports** I'll fix those myself
- **User import aliases** Avoid relative imports, use import aliases as defined in tsconfig
- **Always prompt me for testing commands** Never run any commands to test implementation like "pnpm run dev:api" or running migrations yourself; prompt me so i can do it manually; and then continue after i done so
- Local dev uses `localdev/` docker compose for Postgres + pgvector; Drizzle migrations live in `apps/migrations`
