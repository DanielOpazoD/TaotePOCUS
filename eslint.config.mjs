// Flat ESLint config. Next.js 16 removed `next lint`, so this is the
// project's own setup. Kept intentionally minimal — only rules that
// catch real bugs or enforce hooks correctness. No stylistic rules
// (Prettier territory).

import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import boundaries from "eslint-plugin-boundaries";
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
    // ─── Architectural layer enforcement (eslint-plugin-boundaries) ───
    //
    // The codebase is organised into five element types. Imports must
    // flow DOWNWARD only — a higher layer can pull from any lower
    // layer, but never the other way around. Cycles between layers
    // are the most common source of accidental coupling that makes a
    // codebase eventually unrefactorable.
    //
    //   app/             — Next.js route surface (page, layout, loading,
    //                      route handlers under app/api/**)
    //                       → can import: components, hooks, lib,
    //                                     server-actions
    //   components/      — React components (UI)
    //                       → can import: components, hooks, lib,
    //                                     server-actions
    //   hooks/           — React hooks (stateful glue)
    //                       → can import: hooks, lib, server-actions
    //   lib/             — pure logic (no React, no DOM beyond schemas)
    //                       → can import: lib, server-actions
    //   server-actions   — `app/actions/**` server functions. Live
    //                      under app/ by Next.js convention, but are
    //                      *callable from anywhere* (lib/, hooks/,
    //                      components/) — they ARE the API surface
    //                      between the client and the server. Treated
    //                      as a separate element type so other layers
    //                      can import them without tripping the rule.
    //                       → can import: lib
    //
    //   tests/      — unit tests; can import everything (excluded
    //                 from this rule)
    //   e2e/        — Playwright specs; can import everything
    //                 (also excluded)
    //   scripts/    — build-time Node scripts; out of the React tree
    //
    // The rule is `error` so violations break the lint step. When a
    // genuine exception is needed (rare — usually means the design
    // is wrong), add a one-off `// eslint-disable-next-line` with a
    // comment explaining the constraint. Don't silence the rule
    // wholesale — the value is the *cumulative* discipline.
    //
    // The existing `no-restricted-imports` guard (lib/store,
    // firebase-*) still applies as a finer-grained pattern guard
    // ABOVE this layer rule — those imports would also be allowed
    // by the boundaries rule (both files are inside `lib/`), but
    // we don't want components reaching past the repo facade. Two
    // rules, two purposes: boundaries enforces direction; the
    // restricted-imports enforces specific facade contracts.
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "hooks/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
    ],
    plugins: { boundaries },
    settings: {
      // `server-actions` matched FIRST so files under `app/actions/`
      // are tagged as server-actions, not as `app`. Order matters —
      // the plugin uses the first pattern that matches.
      "boundaries/elements": [
        { type: "server-actions", pattern: "app/actions/**" },
        { type: "app", pattern: "app/**" },
        { type: "components", pattern: "components/**" },
        { type: "hooks", pattern: "hooks/**" },
        { type: "lib", pattern: "lib/**" },
      ],
      // Tell the plugin to resolve `@/foo/bar` aliases the same way
      // tsconfig + vite + next do — without this, every `@/lib/...`
      // import looks "external" and the layer rule never fires.
      "boundaries/include": [
        "app/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
        "hooks/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
      ],
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
      },
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // app/ can import from anywhere below + server-actions
            { from: "app", allow: ["app", "components", "hooks", "lib", "server-actions"] },
            // components/ can import from peers + lower + server-actions
            {
              from: "components",
              allow: ["components", "hooks", "lib", "server-actions"],
            },
            // hooks/ can import from peers + lower + server-actions
            { from: "hooks", allow: ["hooks", "lib", "server-actions"] },
            // lib/ can import from peers + server-actions (the server-
            // action wire is the only "upward" import lib is allowed —
            // dual-write delegates through it to the DB).
            { from: "lib", allow: ["lib", "server-actions"] },
            // server-actions can only depend on lib (no React, no
            // hooks, no components — they're pure server-side
            // entrypoints into the algorithmic core).
            { from: "server-actions", allow: ["lib"] },
          ],
        },
      ],
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
