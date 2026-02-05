const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
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
          "./apps/migrations/tsconfig.json",
          "./packages/shared/tsconfig.json",
        ],
        tsconfigRootDir: __dirname,
      },
    },
  },
);
