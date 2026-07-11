import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "eslint.config.js"],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // These wrap synchronous calls (better-sqlite3, a mock) in an async
    // interface on purpose — see docs/decisions.md (DB adapter is
    // deliberately async-shaped for a future D1 swap; DRY_RUN mirrors the
    // real async LlmClient interface without needing to await anything).
    files: ["db/adapter.ts", "llm/dry-run.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    // node:test's test() returns a promise that the test runner itself
    // awaits/schedules — top-level calls are intentionally not awaited.
    // Test doubles also commonly implement an async interface without an
    // await, same as the DB/DRY_RUN exception above.
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
);
