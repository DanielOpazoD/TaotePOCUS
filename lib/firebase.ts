/**
 * Firebase Web SDK bootstrap.
 *
 * The app initializes lazily, only when `IS_FIREBASE_ENABLED` is true.
 * If the env config is missing, every export resolves to `null` and the
 * repo facade (`lib/repo.ts`) keeps using the localStorage backend.
 *
 * This module is the only place that talks to `firebase/app`. Everything
 * else imports the typed handles below.
 *
 * SSR note: `firebase/auth` requires `window` for some persistence
 * choices, so the auth handle is created lazily and only on the client.
 * Server code can safely import this module — it just gets `null`.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { FIREBASE_CONFIG, IS_FIREBASE_ENABLED } from "./env";

let app: FirebaseApp | null = null;
let authHandle: Auth | null = null;
let dbHandle: Firestore | null = null;

function ensureApp(): FirebaseApp | null {
  if (!IS_FIREBASE_ENABLED) return null;
  if (app) return app;
  // Reuse an already-initialized app in dev (Next HMR re-runs modules).
  app = getApps()[0] ?? initializeApp(FIREBASE_CONFIG);
  return app;
}

/**
 * Lazily-initialized `Auth` instance. Returns `null` if Firebase is not
 * configured. Always check before using.
 */
export function firebaseAuth(): Auth | null {
  if (!IS_FIREBASE_ENABLED) return null;
  if (typeof window === "undefined") return null; // client-only
  if (authHandle) return authHandle;
  const a = ensureApp();
  if (!a) return null;
  authHandle = getAuth(a);
  return authHandle;
}

/**
 * Lazily-initialized `Firestore` instance. Returns `null` if Firebase
 * is not configured. Safe to call on the server (Firestore Web SDK
 * tolerates SSR) but most callers run on the client.
 */
export function firebaseDb(): Firestore | null {
  if (!IS_FIREBASE_ENABLED) return null;
  if (dbHandle) return dbHandle;
  const a = ensureApp();
  if (!a) return null;
  dbHandle = getFirestore(a);
  return dbHandle;
}

/** Re-export so callers can branch with a single import. */
export { IS_FIREBASE_ENABLED } from "./env";
