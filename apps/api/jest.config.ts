import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.integration.test.ts"],
  globalSetup: "<rootDir>/test/helpers/globalSetup.ts",
  forceExit: true,
  testTimeout: 30000,
  moduleNameMapper: {
    "^@/api/(.*)$": "<rootDir>/src/$1",
    "^@/migrations/(.*)$": "<rootDir>/../migrations/src/$1",
    "^@/shared/(.*)$": "<rootDir>/../../packages/shared/src/$1",
    "^@/test/(.*)$": "<rootDir>/test/$1",
  },
  transform: {
    "^.+\\.[tj]s$": [
      "ts-jest",
      {
        tsconfig: {
          target: "ES2022",
          module: "CommonJS",
          moduleResolution: "node",
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: true,
          esModuleInterop: true,
          allowJs: true,
        },
      },
    ],
  },
  // pg-boss v12 + its transitive ESM deps (serialize-error -> non-error) ship pure
  // ESM; un-ignore so ts-jest transpiles them to CJS instead of Node choking on
  // their `import`/`export` statements.
  // @smithy (AWS SDK runtime) uses native dynamic `import()` (e.g. node-http-handler
  // does `await import("node:http")` on every request); un-ignore so ts-jest
  // downlevels those to `require()` under module:CommonJS, avoiding the need for
  // --experimental-vm-modules (which would break the pg-boss CJS transpile above).
  transformIgnorePatterns: [
    "/node_modules/(?!.*(?:pg-boss|serialize-error|non-error|@smithy))",
  ],
};

export default config;
