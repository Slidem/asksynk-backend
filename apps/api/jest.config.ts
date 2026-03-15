import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.integration.test.ts"],
  globalSetup: "<rootDir>/src/test/globalSetup.ts",
  forceExit: true,
  moduleNameMapper: {
    "^@/api/(.*)$": "<rootDir>/src/$1",
    "^@/migrations/(.*)$": "<rootDir>/../migrations/src/$1",
    "^@/shared/(.*)$": "<rootDir>/../../packages/shared/src/$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          module: "CommonJS",
          moduleResolution: "node",
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: true,
          esModuleInterop: true,
        },
      },
    ],
  },
};

export default config;
