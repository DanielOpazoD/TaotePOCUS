/**
 * Firestore implementation of the `favs` namespace.
 *
 * Schema:
 *
 *   /favorites/{email}  → { ids: string[] }
 *
 * Email is the document id (URL-safe — Firestore allows it). When
 * Firebase Auth lands with verified accounts, switch to `uid` as id and
 * keep `email` only as a queryable field.
 */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebase";
import { log } from "./log";
import type { WriteResult } from "./store";

const FAVS_COLLECTION = "favorites";

function unavailable(): WriteResult {
  return { ok: false, reason: "unavailable" };
}

function safeKey(email?: string | null): string {
  return (email || "guest").toLowerCase();
}

export const firebaseFavsRepo = {
  async list(email?: string | null): Promise<string[]> {
    const db = firebaseDb();
    if (!db) return [];
    try {
      const snap = await getDoc(doc(db, FAVS_COLLECTION, safeKey(email)));
      const data = snap.data();
      return Array.isArray(data?.ids) ? (data!.ids as string[]) : [];
    } catch (err) {
      log.error("Firestore favs list failed", { area: "favs" }, err);
      return [];
    }
  },

  async toggle(
    email: string | null | undefined,
    id: string,
    current: string[],
  ): Promise<{ result: WriteResult; next: string[] }> {
    const db = firebaseDb();
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    if (!db) return { result: unavailable(), next: current };
    try {
      await setDoc(doc(db, FAVS_COLLECTION, safeKey(email)), { ids: next });
      return { result: { ok: true }, next };
    } catch (err) {
      log.error("Firestore favs toggle failed", { area: "favs" }, err);
      return { result: { ok: false, reason: "unknown" }, next: current };
    }
  },
};
