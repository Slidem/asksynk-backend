- In all interactions and commit messages, be extremely concise, and sacrifice grammar for the sake of concision.
- Don't overengineer (YAGNI)
- Keep best coding practices, and keep things simple
- Don't use "useEffect" unless completely necessary

## Repo setup

- Monorepo with pnpm workspaces
- Node 24, pnpm 10.15.0
- Apps: api, sse, background-worker, cron
- Packages: shared
- Infra: CDK
- Local dev: Docker + Localstack
- Use absolute imports with `@/` (convex exception only)
- Avoid barrel exports

## Plan

- At the end of each plan, give me a list of unresolved questions to answer, if any. Make the questions extremely concise, sacrifice grammar for the sake of concision.
- Don't implement things we are not using (use the YAGNI principle)
- Don't design for backwards compatibility, as this project is in MVP state

## Development Notes

- **DON'T USER RELATIVE IMPORTS EXCEPT CONVEX** Use absolute imports (`@/`) for better maintainability
- Keep components focused and testable
- Follow the established patterns for consistency
- **Organization data model**: All user data is scoped to organizations for proper multi-tenancy
- **TypeScript configuration**: Uses `"moduleResolution": "bundler"` (not the deprecated "node10")
- **Development workflow**: Use utility scripts for quick database cleanup during development
- **Responsive design**: UI components adapt between mobile and desktop with appropriate sizing
- **Theme customization**: Custom sidebar theme colors defined in `globals.css` with `--sidebar-primary`
- **Navigation consistency**: All routes use Next.js Link with proper active state management
- **Avoid useEffect** unless for actual side effects (API calls, DOM manipulation)
- **Don't use useEffect** for state synchronization or derived state
- **Prefer derived state** and proper state management
- **Use custom hooks** for complex logic extraction
- **NEVER add shadcn components manually** - always request installation
- **Always use shadcn/ui** components when building UI elements
- **DON'T USE BARREL EXPORTS**
