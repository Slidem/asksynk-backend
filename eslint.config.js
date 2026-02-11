import js from "@eslint/js";
import tseslint from "typescript-eslint";

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
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: [
          "./apps/api/tsconfig.json",
          "./apps/background-worker/tsconfig.json",
          "./apps/migrations/tsconfig.json",
          "./packages/shared/tsconfig.json",
        ],
        // eslint-disable-next-line no-undef
        tsconfigRootDir: new URL(".", import.meta.url).pathname,
      },
    },
  },
];
