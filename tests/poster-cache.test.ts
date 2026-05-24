/**
 * Tests for the IndexedDB-backed poster cache (`lib/poster-cache.ts`).
 *
 * happy-dom doesn't ship IndexedDB, so each test installs a tiny
 * in-memory mock onto `globalThis.indexedDB` that implements just
 * enough of the IDB surface our cache uses: open → upgradeneeded /
 * success, transaction → readonly / readwrite, objectStore.{get, put,
 * delete}, plus a `__store` escape hatch tests use to seed entries.
 *
 * The mock is hand-rolled rather than `fake-indexeddb` to keep the
 * devDep footprint flat — the API surface we touch is small enough
 * that mocking ~30 lines is cheaper than pulling in a package.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface MockEntry {
  url: string;
  dataUrl: string;
  capturedAt: number;
}

interface MockStore {
  data: Map<string, MockEntry>;
  /** When set, the next `transaction()` call throws — exercises the
   *  bail-out branch where the connection is alive but the txn fails. */
  failTransactions: boolean;
  /** When set, `indexedDB.open()` rejects with `onerror`. */
  failOpen: boolean;
  /** When set, `indexedDB.open()` fires `onblocked` (another tab holds
   *  the previous version open). Exercises the third terminal branch
   *  of `openDb()`. */
  blockOpen: boolean;
  /** When set, `indexedDB.open()` throws synchronously — mirrors
   *  older Safari private-mode behavior. */
  throwOpen: boolean;
  /** When set, the next `objectStore.get()` request fires `onerror`. */
  failNextGet: boolean;
  /** When set, the next `objectStore.put()` request fires `onerror`
   *  (mirrors a quota-exceeded write). */
  failNextPut: boolean;
  /** When set, the next `objectStore.delete()` request fires `onerror`. */
  failNextDelete: boolean;
  /** Controls the `objectStoreNames.contains()` return value. Default
   *  `true` so most tests skip the create branch in
   *  `onupgradeneeded`; flipping to `false` exercises
   *  `createObjectStore`. */
  storeExists: boolean;
}

// One module-level store so tests can seed / inspect entries between
// invocations of the cache module without re-importing.
let mockStore: MockStore;

function installMockIDB() {
  mockStore = {
    data: new Map(),
    failTransactions: false,
    failOpen: false,
    blockOpen: false,
    throwOpen: false,
    failNextGet: false,
    failNextPut: false,
    failNextDelete: false,
    storeExists: true,
  };

  function makeReq<T>(resolveValue: T, fail = false): IDBRequest<T> {
    // IDB callbacks are async — defer to microtask so the awaiter
    // has time to attach `onsuccess` / `onerror` before they fire.
    const req: Partial<IDBRequest<T>> & {
      onsuccess: ((this: IDBRequest, ev: Event) => unknown) | null;
      onerror: ((this: IDBRequest, ev: Event) => unknown) | null;
      result: T;
    } = {
      onsuccess: null,
      onerror: null,
      result: resolveValue,
    };
    queueMicrotask(() => {
      const ev = new Event(fail ? "error" : "success");
      const cb = fail ? req.onerror : req.onsuccess;
      cb?.call(req as IDBRequest, ev);
    });
    return req as IDBRequest<T>;
  }

  const makeObjectStore = () => ({
    get(key: string) {
      const fail = mockStore.failNextGet;
      mockStore.failNextGet = false;
      return makeReq<MockEntry | undefined>(mockStore.data.get(key), fail);
    },
    put(entry: MockEntry) {
      const fail = mockStore.failNextPut;
      mockStore.failNextPut = false;
      if (!fail) mockStore.data.set(entry.url, entry);
      return makeReq<string>(entry.url, fail);
    },
    delete(key: string) {
      const fail = mockStore.failNextDelete;
      mockStore.failNextDelete = false;
      if (!fail) mockStore.data.delete(key);
      return makeReq<undefined>(undefined, fail);
    },
  });

  const createdStores: string[] = [];
  const fakeDb: Partial<IDBDatabase> = {
    objectStoreNames: {
      contains: () => mockStore.storeExists,
    } as unknown as DOMStringList,
    createObjectStore: ((name: string) => {
      createdStores.push(name);
      return {} as IDBObjectStore;
    }) as IDBDatabase["createObjectStore"],
    transaction(_name: string | string[]) {
      if (mockStore.failTransactions) throw new Error("transaction blocked");
      return { objectStore: makeObjectStore } as unknown as IDBTransaction;
    },
  };
  // Expose for inspection by tests that exercise the create branch.
  (mockStore as MockStore & { createdStores: string[] }).createdStores = createdStores;

  const fakeIndexedDB = {
    open(_name: string, _version?: number) {
      if (mockStore.throwOpen) {
        // Mirrors the synchronous DOMException Safari private mode
        // sometimes throws from `indexedDB.open()`. The module wraps
        // the call in try/catch.
        throw new Error("private mode");
      }
      const req: Partial<IDBOpenDBRequest> & {
        onsuccess: ((this: IDBRequest, ev: Event) => unknown) | null;
        onerror: ((this: IDBRequest, ev: Event) => unknown) | null;
        onupgradeneeded: ((this: IDBRequest, ev: Event) => unknown) | null;
        onblocked: ((this: IDBRequest, ev: Event) => unknown) | null;
        result: IDBDatabase;
      } = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
        result: fakeDb as IDBDatabase,
      };
      queueMicrotask(() => {
        if (mockStore.failOpen) {
          req.onerror?.call(req as unknown as IDBRequest, new Event("error"));
          return;
        }
        if (mockStore.blockOpen) {
          // `onblocked` fires when another tab holds an older DB
          // version open. The module short-circuits to a null
          // connection in that case.
          req.onblocked?.call(req as unknown as IDBRequest, new Event("blocked"));
          return;
        }
        // Fire upgradeneeded once (first open) then success. When
        // `storeExists` is false the module's handler takes the
        // create branch (covered by the dedicated test below).
        req.onupgradeneeded?.call(req as unknown as IDBRequest, new Event("upgradeneeded"));
        req.onsuccess?.call(req as unknown as IDBRequest, new Event("success"));
      });
      return req as IDBOpenDBRequest;
    },
  };

  (globalThis as { indexedDB?: unknown }).indexedDB = fakeIndexedDB;
}

function uninstallMockIDB() {
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
}

// `lib/poster-cache.ts` does not cache the IDB connection across
// calls (each `openDb()` is fresh), so we can re-import once at the
// top and reuse — the mock store is what flips between tests.
import { getPoster, setPoster } from "@/lib/poster-cache";

const TINY_PNG = "data:image/jpeg;base64,/9j/AAA=";

describe("poster-cache", () => {
  beforeEach(() => installMockIDB());
  afterEach(() => uninstallMockIDB());

  it("round-trips: setPoster then getPoster returns the same data URL", async () => {
    await setPoster("https://example.com/a.mp4", TINY_PNG);
    const out = await getPoster("https://example.com/a.mp4");
    expect(out).toBe(TINY_PNG);
  });

  it("returns null on a miss (no entry for the URL)", async () => {
    const out = await getPoster("https://example.com/never-set.mp4");
    expect(out).toBeNull();
  });

  it("evicts entries older than the 30-day TTL on read", async () => {
    // Pre-seed an entry with a `capturedAt` past the TTL window so the
    // staleness check in `getPoster` triggers eviction. We do this
    // directly via the mock store rather than `setPoster` because the
    // public API stamps with `Date.now()`.
    mockStore.data.set("https://example.com/stale.mp4", {
      url: "https://example.com/stale.mp4",
      dataUrl: TINY_PNG,
      capturedAt: Date.now() - 31 * 24 * 60 * 60 * 1000, // 31 days ago
    });
    const out = await getPoster("https://example.com/stale.mp4");
    expect(out).toBeNull();
    // Eviction is fire-and-forget; let the deferred delete run.
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(mockStore.data.has("https://example.com/stale.mp4")).toBe(false);
  });

  it("falls back gracefully when IDB is unavailable", async () => {
    uninstallMockIDB();
    // Without `globalThis.indexedDB`, the module short-circuits to a
    // null/no-op outcome. Neither call should throw.
    await expect(getPoster("https://example.com/x.mp4")).resolves.toBeNull();
    await expect(setPoster("https://example.com/x.mp4", TINY_PNG)).resolves.toBeUndefined();
  });

  it("falls back gracefully when the IDB open() request errors", async () => {
    mockStore.failOpen = true;
    await expect(getPoster("https://example.com/x.mp4")).resolves.toBeNull();
    await expect(setPoster("https://example.com/x.mp4", TINY_PNG)).resolves.toBeUndefined();
  });

  it("falls back gracefully when a transaction throws", async () => {
    mockStore.failTransactions = true;
    await expect(getPoster("https://example.com/x.mp4")).resolves.toBeNull();
    await expect(setPoster("https://example.com/x.mp4", TINY_PNG)).resolves.toBeUndefined();
  });

  it("falls back gracefully when indexedDB.open() throws synchronously", async () => {
    // Older Safari private mode throws synchronously rather than
    // firing `onerror`. The module wraps the `indexedDB.open()`
    // call in try/catch to handle that path.
    mockStore.throwOpen = true;
    await expect(getPoster("https://example.com/x.mp4")).resolves.toBeNull();
    await expect(setPoster("https://example.com/x.mp4", TINY_PNG)).resolves.toBeUndefined();
  });

  it("falls back gracefully when the IDB open() request is blocked", async () => {
    // Another tab holds an older DB version open. IDB fires
    // `onblocked` and we treat it the same as a failed open.
    mockStore.blockOpen = true;
    await expect(getPoster("https://example.com/x.mp4")).resolves.toBeNull();
    await expect(setPoster("https://example.com/x.mp4", TINY_PNG)).resolves.toBeUndefined();
  });

  it("creates the object store on first open (upgradeneeded path)", async () => {
    mockStore.storeExists = false;
    // Round-trip still works — the upgradeneeded handler calls
    // `createObjectStore("video_posters")` and `setPoster` then
    // persists into the mock store.
    await setPoster("https://example.com/upgrade.mp4", TINY_PNG);
    // Inspect the createdStores escape hatch.
    const created = (mockStore as MockStore & { createdStores: string[] }).createdStores;
    expect(created).toContain("video_posters");
  });

  it("returns null when the underlying get() request errors", async () => {
    // QuotaExceeded or transient IDB error on the read side. The
    // module's `req.onerror` handler maps that to `null`.
    mockStore.failNextGet = true;
    await expect(getPoster("https://example.com/x.mp4")).resolves.toBeNull();
  });

  it("resolves cleanly when the underlying put() request errors", async () => {
    // Quota-exceeded write — the cache is best-effort, so we
    // swallow the error and the caller continues without a poster.
    mockStore.failNextPut = true;
    await expect(setPoster("https://example.com/quota.mp4", TINY_PNG)).resolves.toBeUndefined();
    // And the value did NOT land in the mock store (mock honors
    // failNextPut by skipping the set).
    expect(mockStore.data.has("https://example.com/quota.mp4")).toBe(false);
  });

  it("tolerates a delete() error during stale-entry eviction", async () => {
    // The internal eviction path (called from a stale `getPoster`)
    // is fire-and-forget. Even if the delete request errors, the
    // main read must still resolve to null without surfacing the
    // failure to the caller.
    mockStore.data.set("https://example.com/stale-err.mp4", {
      url: "https://example.com/stale-err.mp4",
      dataUrl: TINY_PNG,
      capturedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
    });
    mockStore.failNextDelete = true;
    await expect(getPoster("https://example.com/stale-err.mp4")).resolves.toBeNull();
  });
});
