// Cross-boundary rules (docs/architecture/07-roadmap.md §Guardrails, 03-layering.md).
// Run from apps/api (dependency-cruiser resolves tsconfig `extends` against cwd);
// paths are relative to it, so @/migrations resolves to `../migrations/…`.
// `$1` in `to` refers to the context captured by `from.path`.
// Composition-root files (src/app.module.ts, …) don't match `^src/([^/]+)/`.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.(unit|integration)\\.test\\.ts$" },
  },
  forbidden: [
    {
      name: "cross-context-via-contract-only",
      severity: "error",
      from: {
        path: "^src/([^/]+)/",
        pathNot: "\\.module\\.ts$",
      },
      to: {
        path: "^src/(?!kernel/|platform/)([^/]+)/(?!contract/)",
        pathNot: "^src/$1/",
      },
    },
    {
      // Nest wiring: a module may import other contexts' modules (and contracts).
      name: "module-imports-module-or-contract",
      severity: "error",
      from: { path: "^src/([^/]+)/[^/]+\\.module\\.ts$" },
      to: {
        path: "^src/(?!kernel/|platform/)[^/]+/",
        pathNot: [
          "^src/$1/",
          "^src/[^/]+/contract/",
          "^src/[^/]+/[^/]+\\.module\\.ts$",
        ],
      },
    },
    {
      name: "no-foreign-repository",
      severity: "error",
      from: { path: "^src/([^/]+)/" },
      // platform's own repositories (dead letters) are shared-tier, not a context's
      to: { path: "^src/(?!$1/|platform/)[^/]+/.*\\.repository\\.ts$" },
    },
    {
      name: "only-module-imports-infrastructure",
      severity: "error",
      from: { path: "^src/[^/]+/(application|presentation)/" },
      to: { path: "^src/[^/]+/infrastructure/" },
    },
    {
      name: "application-never-imports-presentation",
      severity: "error",
      from: { path: "^src/[^/]+/(domain|application|infrastructure)/" },
      to: { path: "^src/[^/]+/presentation/" },
    },
    {
      name: "kernel-is-a-leaf",
      severity: "error",
      from: { path: "^src/kernel/" },
      to: { path: "^(src/(?!kernel/)|\\.\\./migrations/)" },
    },
    {
      name: "platform-imports-no-context",
      severity: "error",
      from: { path: "^src/platform/" },
      to: { path: "^src/(?!kernel/|platform/)" },
    },
    {
      name: "domain-never-imports-platform",
      severity: "error",
      from: { path: "^src/[^/]+/domain/" },
      to: { path: "^src/platform/" },
    },
    {
      name: "domain-no-migrations-schema",
      severity: "error",
      from: { path: "^src/[^/]+/(domain|contract)/" },
      to: { path: "^\\.\\./migrations/" },
    },
    // schema-ownership: deferred to Wave 7.3 (needs apps/migrations/src/schema/<context>/).
    {
      name: "no-barrels",
      severity: "error",
      from: {},
      to: { path: "^src/.*/index\\.ts$" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
};
