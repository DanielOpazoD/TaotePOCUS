// Flat ESLint config. Next.js 16 removed `next lint`, so this is the
// project's own setup. Kept intentionally minimal — only rules that
// catch real bugs or enforce hooks correctness. No stylistic rules
// (Prettier territory).

import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "next-env.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    settings: { react: { version: "detect" } },
    rules: {
      // React 17+ JSX transform — no need to import React.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // Hooks correctness — these catch real bugs.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Allow `_unused` and ignored args, but flag accidental dead code.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Tests can use a couple of unsafe patterns (mock typing escape hatches).
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Build-time / Node-only files run outside the browser.
    files: ["next.config.mjs", "vitest.config.ts", "*.config.{js,mjs,ts}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
