# ADR 0004 — Firebase as primary persistence (feature-flagged)

- **Status**: Accepted. Partially supersedes ADR-0001 (auth) and ADR-0003 (repo).
- **Date**: 2026-04-27
- **Decider(s)**: Project lead

## Context

ADR-0001 set up a mock auth backed by `localStorage` with a hardcoded admin password and acknowledged the limitations (forgeable role, single-device, no PHI). ADR-0003 introduced the repository facade so the persistence layer could be swapped in one file. Two iterations later we want to move past the demo: a real backend, multi-device sync, an audit trail that survives clearing the browser, and an admin role that can't be forged from DevTools.

The team's preference was **Firebase**. Reasoning:

- Free for our scale (Firestore Spark plan covers thousands of reads/writes per day).
- Unified product: Auth + Firestore + Storage live behind one SDK.
- Static deployment stays viable on Netlify — no server to operate.
- The Web SDK is well-supported, typed, and tree-shakable.

We considered Supabase (also good) and a custom server (overkill). Firebase wins on integration with the existing stack and operator burden.

## Decision

We integrate Firebase Auth + Firestore as the **primary** persistence path, behind a **feature flag** (`IS_FIREBASE_ENABLED` in `lib/env.ts`). When the six `NEXT_PUBLIC_FIREBASE_*` env vars are set, the repo facade dispatches to Firebase implementations. When they are missing — local dev, contributor PRs without secrets, demos — the existing localStorage backend keeps running.

Concretely:

- **`lib/firebase.ts`** lazily initializes the SDK and exports `firebaseAuth()` / `firebaseDb()` getters that return `null` when the flag is off.
- **`lib/firebase-auth.ts`**, **`lib/firebase-cases.ts`**, **`lib/firebase-favs.ts`** implement the same shape that the localStorage versions used to expose.
- **`lib/repo.ts`** holds the localStorage implementations as the default and **lazily imports** the Firebase ones when the flag is on (no top-level await, no SDK in the dev bundle).
- The `User` type still carries `expiresAt` / `issuedAt`; the Firebase backend computes them client-side at login. Firebase's own ID tokens auto-refresh, but our session timer is shorter (8 h admin, 30 d user) and lives separately so the existing UX (session-expired toast on tab focus) keeps working.
- Schema:
  - `cases/{id}` — full `CaseRecord` shape.
  - `favorites/{email}` — `{ ids: string[] }`. Email is the document id today; switch to `uid` when verified accounts land.

### Admin role

Real custom claims would require the Admin SDK (Cloud Functions or a server). For now we keep the same client-side check we had: an account whose email matches `NEXT_PUBLIC_ADMIN_EMAIL` gets `role: "admin"` after authenticating against Firebase Auth. Firestore Security Rules will pin this to `request.auth.token.email == "<admin-email>"` so the rule enforces it server-side even if a client tampers with the JS check.

This is **better than the mock**: the user must successfully sign in with the admin account's actual password (no hardcoded comparison), and Firestore rules block writes from non-admin tokens. It is **not yet** real custom-claims-grade RBAC — that's a follow-up when we want multi-admin or role separation beyond binary.

## Consequences

### Pros

- **Forging the admin role from DevTools no longer works.** The token is signed by Google; tampering invalidates it. Firestore rules block writes to `cases/*` from any token whose email isn't the admin.
- **Multi-device, multi-tab.** Favorites and admin-authored cases sync across sessions automatically.
- **No more 5 MB localStorage cap.** Cases can carry real images / video URLs (paired with Firebase Storage in a follow-up ADR).
- **Audit trail survives browser clearing** — `deletedAt` / `deletedBy` stay in Firestore.
- **Local dev unchanged.** Contributors run `npm install && npm run dev` and get the localStorage backend, no Firebase project required.

### Cons / Risks

- **Two backends to maintain** in `lib/repo.ts`. The local one still pulls its weight for dev / demo / tests, but PRs touching the repo must keep both implementations in sync. Mitigation: `tests/repo.test.ts` pins the contract; the Firebase implementations are thin enough that drift is visible.
- **Firestore rules are critical.** A misconfigured rule could expose the database. Mitigation: rules go through review like code; CI eventually runs the Firebase emulator suite (TODO).
- **`firebase` JS SDK is ~120 KB gzip.** The dynamic import keeps it out of the dev bundle, but it ships in production once the flag is on. Mitigation: bundle analyzer (`npm run analyze`) is wired up to monitor size.
- **API keys are public.** `NEXT_PUBLIC_FIREBASE_API_KEY` is shipped to the client. Security comes from rules, not from secrecy. Documented in `.env.example` and the README.

### Risk treatments

- **Firestore Security Rules** are the contract that keeps non-admins out of writes. They're versioned in `firestore.rules` (TODO — to be added in the deploy iteration that creates the actual project).
- **Sentry** captures any unexpected Firestore errors — see ADR-0005.
- **Tests** exercise the public surface via the localStorage backend. A future integration suite (with the Firebase emulator) will pin the network backend too.

## Migration steps performed

1. `npm install firebase` — SDK in dependencies.
2. Added `NEXT_PUBLIC_FIREBASE_*` to `lib/env.ts` and `.env.example`.
3. Wrote `lib/firebase.ts` (bootstrap), `lib/firebase-auth.ts`, `lib/firebase-cases.ts`, `lib/firebase-favs.ts`.
4. Refactored `lib/repo.ts` to dispatch.
5. Updated CSP in `next.config.mjs` to allow `*.googleapis.com`, `*.firebaseio.com`, `*.firebaseapp.com`.
6. README documents the four-step Firebase console setup.

## Migration steps the operator must perform (when activating)

1. Create a Firebase project at console.firebase.google.com.
2. Enable Email/Password sign-in in Authentication → Sign-in method.
3. Create the admin account manually in Authentication → Users with the email matching `NEXT_PUBLIC_ADMIN_EMAIL`.
4. Create a Firestore database in production mode.
5. Copy the six config values to `.env.local` (or Netlify env).
6. Apply the Firestore rules from `firestore.rules` (to be added).

## Future ADRs that this opens

- **0006 Firebase Storage for case media** — once we replace the dataURL upload with real file storage.
- **0007 Custom claims for multi-admin RBAC** — when the team grows beyond a single admin.
- **0008 Firebase emulator suite in CI** — when the rules become non-trivial.
