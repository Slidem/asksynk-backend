import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

const LAYERS = [
  "contract",
  "domain",
  "application",
  "infrastructure",
  "presentation",
];
const FRAMEWORKS = [
  "@nestjs/*",
  "@nestjs-cls/*",
  "drizzle-orm",
  "class-validator",
  "class-transformer",
  "zod",
  "socket.io",
  "pg-boss",
];
const local = (types) => types.map((type) => ({ element: { type } }));
const own = (types) =>
  types.map((type) => ({
    element: {
      type,
      captured: { context: "{{ from.element.captured.context }}" },
    },
  }));
const ownErrors = { ...own(["root"])[0], file: { categories: "errors" } };

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/.eslintcache",
      "**/.cache/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "writable" },
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: [
          "./apps/api/tsconfig.json",
          "./apps/migrations/tsconfig.json",
          "./scripts/tsconfig.json",
        ],
        // eslint-disable-next-line no-undef
        tsconfigRootDir: new URL(".", import.meta.url).pathname,
      },
    },
  },
  {
    files: ["**/*.ts"],
    plugins: {
      "unused-imports": unusedImports,
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn",
    },
  },
  {
    files: ["apps/api/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["src/*"], message: "Use the @/api/* alias (CLAUDE.md)." },
            {
              group: ["./*", "../*"],
              message: "Use import aliases, not relative paths (CLAUDE.md).",
            },
          ],
        },
      ],
    },
  },
  // Layer rules (docs/architecture/03-layering.md §1, §8). Cross-context rules live in
  // apps/api/.dependency-cruiser.cjs. Composition-root files (src/*.ts) excluded.
  {
    files: ["apps/api/src/*/**/*.ts"],
    plugins: { boundaries },
    settings: {
      // eslint-disable-next-line no-undef
      "boundaries/root-path": new URL(".", import.meta.url).pathname,
      "boundaries/legacy-templates": false,
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: "apps/api/tsconfig.json" },
      },
      "boundaries/elements": [
        { type: "kernel", pattern: "apps/api/src/kernel" },
        { type: "platform", pattern: "apps/api/src/platform" },
        ...LAYERS.map((type) => ({
          type,
          pattern: `apps/api/src/*/${type}`,
          capture: ["context"],
        })),
        // context root: <ctx>.module.ts, <ctx>.errors.ts (+ not-yet-layered folders)
        { type: "root", pattern: "apps/api/src/*", capture: ["context"] },
      ],
      "boundaries/files": [
        { pattern: "**/*.module.ts", category: "module" },
        { pattern: "**/*.errors.ts", category: "errors" },
        {
          pattern: "apps/api/src/auth/better-auth*.ts",
          category: "better-auth",
        },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          checkAllOrigins: true,
          default: "disallow",
          // Evaluated in order; the last matching policy wins.
          policies: [
            { allow: { to: { module: { origin: ["external", "core"] } } } },
            {
              from: { element: { type: "kernel" } },
              allow: { to: local(["kernel"]) },
            },
            {
              from: { element: { type: "platform" } },
              allow: { to: local(["kernel", "platform"]) },
            },
            {
              // platform: defineEvent only
              from: { element: { type: "contract" } },
              allow: {
                to: [...local(["kernel", "platform", "contract"]), ownErrors],
              },
            },
            {
              // own contract: its declared types (no duplicates)
              from: { element: { type: "domain" } },
              allow: {
                to: [
                  ...local(["kernel"]),
                  ...own(["domain", "contract"]),
                  ownErrors,
                ],
              },
            },
            {
              from: { element: { type: ["application", "infrastructure"] } },
              allow: {
                to: [
                  ...local(["kernel", "platform", "contract"]),
                  ...own(["domain", "application"]),
                  ownErrors,
                ],
              },
            },
            {
              from: { element: { type: "infrastructure" } },
              allow: { to: own(["infrastructure"]) },
            },
            {
              from: { element: { type: "presentation" } },
              allow: {
                to: [
                  ...local(["kernel", "platform", "contract"]),
                  ...own(["domain", "application", "presentation"]),
                  ownErrors,
                ],
              },
            },
            {
              // wiring + catalog: anything of its own, other modules, contracts
              from: { element: { type: "root" } },
              allow: {
                to: [
                  ...local(["kernel", "platform", "contract"]),
                  ...own([...LAYERS, "root"]),
                  { element: { type: "root" }, file: { categories: "module" } },
                ],
              },
            },
            {
              // better-auth instance (Auth type + BETTER_AUTH token): library boundary, 07 "Leave alone"
              from: {
                element: {
                  type: ["application", "presentation"],
                  captured: { context: "auth" },
                },
              },
              allow: { to: { file: { categories: "better-auth" } } },
            },
            {
              from: { element: { type: ["domain", "kernel"] } },
              disallow: { to: { module: { source: FRAMEWORKS } } },
            },
            {
              // event schemas need zod
              from: { element: { type: "contract" } },
              disallow: {
                to: {
                  module: { source: FRAMEWORKS.filter((m) => m !== "zod") },
                },
              },
            },
          ],
        },
      ],
    },
  },
];
