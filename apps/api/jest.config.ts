import type { Config } from "jest";

const moduleNameMapper = {
  "^@/api/(.*)$": "<rootDir>/src/$1",
  "^@/migrations/(.*)$": "<rootDir>/../migrations/src/$1",
  "^@/shared/(.*)$": "<rootDir>/../../packages/shared/src/$1",
  "^@/test/(.*)$": "<rootDir>/test/$1",
};

const transform: {
  [regex: string]: string | [string, Record<string, unknown>];
} = {
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
};

const transformIgnorePatterns = [
  "/node_modules/(?!.*(?:pg-boss|serialize-error|non-error|@smithy))",
];

const config: Config = {
  forceExit: true,
  testTimeout: 30000,
  projects: [
    {
      displayName: "unit",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["**/*.unit.test.ts"],
      moduleNameMapper,
      transform,
      transformIgnorePatterns,
    },
    {
      displayName: "integration",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["**/*.integration.test.ts"],
      globalSetup: "<rootDir>/test/helpers/globalSetup.ts",
      moduleNameMapper,
      transform,
      transformIgnorePatterns,
    },
  ],
};

export default config;
