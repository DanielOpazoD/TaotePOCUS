/**
 * Firestore implementation of the `cases` namespace.
 *
 * Active only when `IS_FIREBASE_ENABLED` is true. Schema:
 *
 *   /cases/{caseId} → CaseRecord
 *
 * Soft-delete uses the same `deletedAt` / `deletedBy` columns as the
 * localStorage backend so the UI doesn't branch.
 *
 * Errors from Firestore are caught and translated into `WriteResult`
 * shapes so callers (App.tsx) keep the same `if (!result.ok)` flow.
 */

import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { firebaseDb } from "./firebase";
import { SEED_CASES } from "./data";
import { log } from "./log";
import type { CaseRecord } from "./types";
import type { WriteResult } from "./store";

const CASES_COLLECTION = "cases";

function unavailable(): WriteResult {
  return { ok: false, reason: "unavailable" };
}

function asWriteError(area: string, op: string, err: unknown): WriteResult {
  log.error(`Firestore ${op} failed`, { area, op }, err);
  // Firestore quota and permissions errors are not distinguished by
  // the reason union — surface them all as `unknown` for now. UI shows
  // a generic toast; details land in Sentry.
  return { ok: false, reason: "unknown" };
}

async function listAllRaw(): Promise<CaseRecord[]> {
  const db = firebaseDb();
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, CASES_COLLECTION));
    return snap.docs.map((d) => d.data() as CaseRecord);
  } catch (err) {
    log.error("Firestore listAllRaw failed", { area: "cases" }, err);
    return [];
  }
}

export const firebaseCasesRepo = {
  /** Seed cases ship with the bundle even when Firestore is enabled. */
  async listSeed(): Promise<CaseRecord[]> {
    return SEED_CASES;
  },
  async listUserRaw(): Promise<CaseRecord[]> {
    return listAllRaw();
  },
  async listUser(): Promise<CaseRecord[]> {
    return (await listAllRaw()).filter((c) => !c.deletedAt);
  },
  async listTrashed(): Promise<CaseRecord[]> {
    return (await listAllRaw()).filter((c) => c.deletedAt);
  },
  async listAll(): Promise<CaseRecord[]> {
    const [seed, user] = await Promise.all([this.listSeed(), this.listUser()]);
    return [...user, ...seed];
  },
  /**
   * Persist a case. Uses `setDoc` with merge so partial updates are
   * safe — the doc id matches `case.id` for direct lookups.
   */
  async save(c: CaseRecord, _current: CaseRecord[]): Promise<WriteResult> {
    const db = firebaseDb();
    if (!db) return unavailable();
    try {
      // Firestore can't store `undefined`. Strip it before write.
      const sanitized = JSON.parse(JSON.stringify(c)) as CaseRecord;
      await setDoc(doc(db, CASES_COLLECTION, c.id), sanitized, { merge: true });
      return { ok: true };
    } catch (err) {
      return asWriteError("cases", "save", err);
    }
  },
  async remove(id: string, _current: CaseRecord[], by?: string): Promise<WriteResult> {
    const db = firebaseDb();
    if (!db) return unavailable();
    try {
      await updateDoc(doc(db, CASES_COLLECTION, id), {
        deletedAt: new Date().toISOString(),
        deletedBy: by || "unknown",
      });
      log.info("Case soft-deleted (Firestore)", { area: "cases", id, by });
      return { ok: true };
    } catch (err) {
      return asWriteError("cases", "remove", err);
    }
  },
  async restore(id: string, _current: CaseRecord[]): Promise<WriteResult> {
    const db = firebaseDb();
    if (!db) return unavailable();
    try {
      await updateDoc(doc(db, CASES_COLLECTION, id), {
        deletedAt: null,
        deletedBy: null,
      });
      log.info("Case restored (Firestore)", { area: "cases", id });
      return { ok: true };
    } catch (err) {
      return asWriteError("cases", "restore", err);
    }
  },
  async purge(id: string, _current: CaseRecord[]): Promise<WriteResult> {
    const db = firebaseDb();
    if (!db) return unavailable();
    try {
      await deleteDoc(doc(db, CASES_COLLECTION, id));
      log.info("Case purged (Firestore)", { area: "cases", id });
      return { ok: true };
    } catch (err) {
      return asWriteError("cases", "purge", err);
    }
  },
};
