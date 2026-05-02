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
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "next-env.d.ts",
      // `clerk-nextjs/` is a sample project Clerk's CLI scaffolds
      // outside our app tree — its own Next.js generated types
      // (validator.ts) include `any`s and `@ts-ignore`s that fight
      // our rules. Not our code, not our concern.
      "clerk-nextjs/**",
      // Serwist builds the service worker into `public/sw.js` (and
      // a sibling `swe-worker-*.js` chunk) on every production
      // build. Generated bundles use Service Worker globals
      // (`self`, `caches`) that ESLint's browser env doesn't ship
      // with by default; ignore them outright since they're not
      // hand-written code.
      "public/sw.js",
      "public/sw.js.map",
      "public/swe-worker-*.js",
    ],
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
    // Architectural guards on production code. Components and routes go
    // through the repo facade and the typed log; they do not touch
    // `localStorage` or `console` directly. Tests opt out below.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}"],
    rules: {
      // `console.log` slips into production by accident — use lib/log.
      // Allow `console.error` (e.g. in error boundaries), but warn on
      // `log` / `info` / `debug` so we notice them.
      "no-console": ["warn", { allow: ["error", "warn"] }],
      // Components must go through `lib/repo`, not `lib/store`. The
      // store is a backend detail — leaking it through component code
      // makes the eventual swap to Firebase/Supabase impossible without
      // chasing imports.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/store", "**/lib/store"],
              message:
                "Components must go through `lib/repo`, not `lib/store` (the backend layer is hidden behind the repo facade — see docs/adr/0003-repository-facade.md).",
            },
            {
              group: ["@/lib/firebase-*", "**/lib/firebase-*"],
              message:
                "Firebase implementations are private to `lib/repo.ts`. Do not import them from components.",
            },
          ],
        },
      ],
    },
  },
  {
    // Tests can use a couple of unsafe patterns (mock typing escape
    // hatches) and need to reach into the store directly to set up
    // fixtures.
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
      "no-restricted-imports": "off",
    },
  },
  {
    // Build-time / Node-only files run outside the browser.
    files: [
      "next.config.mjs",
      "vitest.config.ts",
      "*.config.{js,mjs,ts}",
      "scripts/**/*.{js,mjs,ts}",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
