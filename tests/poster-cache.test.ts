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
}

// One module-level store so tests can seed / inspect entries between
// invocations of the cache module without re-importing.
let mockStore: MockStore;

function installMockIDB() {
  mockStore = { data: new Map(), failTransactions: false, failOpen: false };

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
      return makeReq<MockEntry | undefined>(mockStore.data.get(key));
    },
    put(entry: MockEntry) {
      mockStore.data.set(entry.url, entry);
      return makeReq<string>(entry.url);
    },
    delete(key: string) {
      mockStore.data.delete(key);
      return makeReq<undefined>(undefined);
    },
  });

  const fakeDb: Partial<IDBDatabase> = {
    objectStoreNames: {
      contains: () => true,
    } as unknown as DOMStringList,
    transaction(_name: string | string[]) {
      if (mockStore.failTransactions) throw new Error("transaction blocked");
      return { objectStore: makeObjectStore } as unknown as IDBTransaction;
    },
  };

  const fakeIndexedDB = {
    open(_name: string, _version?: number) {
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
        // Fire upgradeneeded once (first open) then success. The
        // module only checks `objectStoreNames.contains` and creates
        // on miss; `contains: () => true` short-circuits the create
        // path, which is fine since the data lives in our Map.
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
});
