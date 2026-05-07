import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBackup, defaultBackupFilename, parseBackup, restoreBackup } from "@/lib/backup";

// Each test starts from a clean storage so we don't leak state between
// cases (vitest with happy-dom shares the global window across files).
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe("buildBackup", () => {
  it("produces a versioned envelope with summary counts", () => {
    localStorage.setItem(
      "pocus_case_overrides",
      JSON.stringify({ "tw-1": { category: "lung" }, "tw-2": { reviewed: true } }),
    );
    localStorage.setItem(
      "customCategories",
      JSON.stringify([{ id: "c:peds", label: "Pediatría" }]),
    );
    localStorage.setItem("pocus_favs_admin@x", JSON.stringify(["tw-1", "tw-2", "tw-3"]));
    localStorage.setItem("pocus_user_cases", JSON.stringify([{ id: "u-1", title: "Mio" }]));

    const env = buildBackup("admin@x");

    expect(env.version).toBe(1);
    expect(env.exportedBy).toBe("admin@x");
    expect(env.summary).toEqual({
      overrides: 2,
      customCategories: 1,
      favorites: 3,
      userCases: 1,
    });
    expect(env.data.caseOverrides).toEqual({
      "tw-1": { category: "lung" },
      "tw-2": { reviewed: true },
    });
    expect(env.data.favsByEmail).toEqual({ "admin@x": ["tw-1", "tw-2", "tw-3"] });
  });

  it("returns empty buckets when storage is fresh", () => {
    const env = buildBackup(null);
    expect(env.summary).toEqual({
      overrides: 0,
      customCategories: 0,
      favorites: 0,
      userCases: 0,
    });
    expect(env.data.caseOverrides).toEqual({});
    expect(env.data.customCategories).toEqual([]);
    expect(env.data.userCases).toEqual([]);
    expect(env.data.favsByEmail).toEqual({});
  });

  it("captures favorites for every email key in storage", () => {
    localStorage.setItem("pocus_favs_a@x", JSON.stringify(["1"]));
    localStorage.setItem("pocus_favs_b@x", JSON.stringify(["2", "3"]));
    localStorage.setItem("pocus_favs_guest", JSON.stringify(["4"]));
    // Unrelated key — must be ignored.
    localStorage.setItem("pocus_user", JSON.stringify({ email: "z" }));

    const env = buildBackup(null);
    expect(env.data.favsByEmail).toEqual({
      "a@x": ["1"],
      "b@x": ["2", "3"],
      guest: ["4"],
    });
    expect(env.summary.favorites).toBe(4);
  });
});

describe("parseBackup", () => {
  it("rejects non-objects, wrong versions, and missing data", () => {
    expect(parseBackup(null)).toBeNull();
    expect(parseBackup(42)).toBeNull();
    expect(parseBackup({ version: 99, data: {} })).toBeNull();
    expect(parseBackup({ version: 1 })).toBeNull();
    expect(parseBackup({ version: 1, data: {} })).toBeNull();
  });

  it("accepts a fully-formed envelope", () => {
    const env = buildBackup("a@x");
    const roundtripped = parseBackup(JSON.parse(JSON.stringify(env)));
    expect(roundtripped).not.toBeNull();
    expect(roundtripped!.version).toBe(1);
  });
});

describe("restoreBackup", () => {
  it("replaces storage with the envelope contents", () => {
    // Pre-existing state that should be wiped by the restore.
    localStorage.setItem("pocus_favs_old@x", JSON.stringify(["leftover"]));
    localStorage.setItem(
      "pocus_case_overrides",
      JSON.stringify({ "stale-id": { category: "ms" } }),
    );

    const env = buildBackup(null); // empty starting envelope
    env.data.caseOverrides = { "tw-42": { category: "cardiac" } };
    env.data.customCategories = [{ id: "c:peds", label: "Pediatría" }];
    env.data.favsByEmail = { "new@x": ["tw-42"] };
    env.data.userCases = [];

    const result = restoreBackup(env);

    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({
      overrides: 1,
      customCategories: 1,
      favsEmails: 1,
      userCases: 0,
    });
    // Restored.
    expect(JSON.parse(localStorage.getItem("pocus_case_overrides")!)).toEqual({
      "tw-42": { category: "cardiac" },
    });
    expect(JSON.parse(localStorage.getItem("pocus_favs_new@x")!)).toEqual(["tw-42"]);
    // Old fav-email key is gone — favs are wiped before re-write so
    // accounts not in the bundle don't linger.
    expect(localStorage.getItem("pocus_favs_old@x")).toBeNull();
  });

  it("fails gracefully on a wrong-version envelope", () => {
    // Force-cast: the runtime check is what we're testing.
    const result = restoreBackup({ version: 2 } as never);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("wrong-version");
  });
});

describe("defaultBackupFilename", () => {
  it("formats as pocus-backup-YYYY-MM-DD-HHMM.json", () => {
    const d = new Date(2026, 3, 29, 14, 7); // April is month 3 (0-indexed)
    expect(defaultBackupFilename(d)).toBe("pocus-backup-2026-04-29-1407.json");
  });
});

// ─── Stability paths (Block N′) ─────────────────────────────────
// The audit flagged that the partial-failure surfaces of the backup
// module had no coverage. These tests pin the contract for the cases
// that are most likely to bite an admin during a real restore: a
// corrupt fav bucket on the source browser, and a quota overflow
// mid-restore that leaves storage in a half-written state.

describe("buildBackup — corrupt source storage", () => {
  it("treats a fav bucket with non-JSON contents as empty (does not throw)", () => {
    localStorage.setItem("pocus_favs_corrupt@x", "{not-json");
    localStorage.setItem("pocus_favs_good@x", JSON.stringify(["ok-1"]));
    const env = buildBackup(null);
    // Both buckets appear — the corrupt one as `[]` so the restore
    // round-trip doesn't carry malformed data forward.
    expect(env.data.favsByEmail["corrupt@x"]).toEqual([]);
    expect(env.data.favsByEmail["good@x"]).toEqual(["ok-1"]);
  });

  it("treats corrupt overrides / customCategories / userCases as empty", () => {
    localStorage.setItem("pocus_case_overrides", "not-json");
    localStorage.setItem("customCategories", "{}"); // wrong shape (not array)
    localStorage.setItem("pocus_user_cases", "[invalid");
    const env = buildBackup(null);
    expect(env.data.caseOverrides).toEqual({});
    // customCategories declared as `unknown[]` — the parsed `{}` is
    // forwarded as-is. The `summary.customCategories` checks
    // `Array.isArray` and reports 0.
    expect(env.summary.customCategories).toBe(0);
    expect(env.data.userCases).toEqual([]);
  });
});

describe("restoreBackup — partial failure (quota exceeded mid-restore)", () => {
  // Force `localStorage.setItem` to throw a QuotaExceededError on the
  // Nth call. The restore should report write-failed without rolling
  // back the writes that already succeeded — this matches the current
  // contract (admins are told to retry / free space).
  //
  // happy-dom defines setItem as an OWN property on the localStorage
  // instance (not via Storage.prototype), so we spy on the instance
  // directly. The vi.spyOn auto-restores in `afterEach` via the
  // global cleanup in `tests/setup.ts`.
  function spyQuotaOn(failOnCallNumber: number): { spy: ReturnType<typeof vi.spyOn> } {
    let calls = 0;
    const original = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      calls += 1;
      if (calls === failOnCallNumber) {
        const err: Error & { name?: string; code?: number } = new Error("quota");
        err.name = "QuotaExceededError";
        err.code = 22;
        throw err;
      }
      original(key, value);
    });
    return { spy };
  }

  it("returns ok:false / write-failed when the first write throws", () => {
    const env = buildBackup(null);
    env.data.caseOverrides = { "tw-1": { category: "lung" } };
    env.data.userCases = [];
    env.data.customCategories = [];
    env.data.favsByEmail = {};

    spyQuotaOn(1);
    const result = restoreBackup(env);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("write-failed");
  });

  it("returns write-failed when a fav-bucket write throws (after the metadata blocks succeed)", () => {
    // Three metadata writes succeed; the fav-bucket write throws.
    // The result reports write-failed; the metadata writes are NOT
    // rolled back — the contract is "tell the admin and let them
    // retry", not "atomic rollback".
    const env = buildBackup(null);
    env.data.caseOverrides = { "tw-1": { category: "lung" } };
    env.data.userCases = [];
    env.data.customCategories = [];
    env.data.favsByEmail = { "victim@x": ["tw-1"] };

    // The first 3 setItem calls are the three writeJson(metadata)
    // calls inside restoreBackup. The 4th is the fav-bucket write
    // we want to throw on.
    spyQuotaOn(4);
    const result = restoreBackup(env);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("write-failed");
    // Metadata landed (no rollback contract).
    expect(JSON.parse(localStorage.getItem("pocus_case_overrides")!)).toEqual({
      "tw-1": { category: "lung" },
    });
    // Victim fav bucket did NOT land.
    expect(localStorage.getItem("pocus_favs_victim@x")).toBeNull();
  });
});

describe("restoreBackup — empty bundle is a valid no-op", () => {
  it("succeeds with zero counts when the bundle has no data", () => {
    const env = buildBackup(null); // empty by construction
    const result = restoreBackup(env);
    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({
      overrides: 0,
      customCategories: 0,
      favsEmails: 0,
      userCases: 0,
    });
  });

  it("wipes ALL pre-existing pocus_favs_* keys when restoring an empty fav set", () => {
    // The wipe-then-write sequence is the only way to drop accounts
    // not present in the bundle. An empty bundle is a legitimate
    // request to clear all favorites.
    localStorage.setItem("pocus_favs_a@x", JSON.stringify(["1"]));
    localStorage.setItem("pocus_favs_b@x", JSON.stringify(["2"]));
    const env = buildBackup(null);
    env.data.favsByEmail = {};
    restoreBackup(env);
    expect(localStorage.getItem("pocus_favs_a@x")).toBeNull();
    expect(localStorage.getItem("pocus_favs_b@x")).toBeNull();
  });
});
