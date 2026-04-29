import { beforeEach, describe, expect, it } from "vitest";
import { repo } from "@/lib/repo";
import { ADMIN_CREDS } from "@/lib/store";
import type { CaseRecord } from "@/lib/types";

const mkCase = (overrides: Partial<CaseRecord> = {}): CaseRecord => ({
  id: "u_test",
  section: "atlas",
  title: "Test case",
  category: "cardiac",
  tags: ["Test"],
  modality: "Test mod",
  loop: "blines",
  author: "Tester",
  role: "QA",
  date: "2026-04-26",
  findings: "f",
  diagnosis: "d",
  summary: "s",
  ...overrides,
});

describe("repo.auth", () => {
  beforeEach(() => localStorage.clear());

  it("rejects missing email", async () => {
    await expect(repo.auth.login("", "")).rejects.toMatchObject({ code: "missing_email" });
  });

  it("rejects wrong admin password", async () => {
    await expect(repo.auth.login(ADMIN_CREDS.email, "wrong")).rejects.toMatchObject({
      code: "wrong_admin_password",
    });
  });

  it("admin login produces role admin and persists", async () => {
    const u = await repo.auth.login(ADMIN_CREDS.email, ADMIN_CREDS.password);
    expect(u.role).toBe("admin");
    expect(u.initials).toBe("AD");
    const current = await repo.auth.current();
    expect(current?.role).toBe("admin");
  });

  it("issues a session with expiresAt and issuedAt", async () => {
    const before = Date.now();
    const u = await repo.auth.login("x@y.z", "p");
    expect(u.issuedAt).toBeGreaterThanOrEqual(before);
    expect(u.expiresAt).toBeGreaterThan(u.issuedAt);
  });

  it("admin sessions expire faster than user sessions", async () => {
    const admin = await repo.auth.login(ADMIN_CREDS.email, ADMIN_CREDS.password);
    await repo.auth.logout();
    const user = await repo.auth.login("plain@user.com", "x");
    const adminLifetime = admin.expiresAt - admin.issuedAt;
    const userLifetime = user.expiresAt - user.issuedAt;
    expect(adminLifetime).toBeLessThan(userLifetime);
  });

  it("current() returns null and clears storage when the session is expired", async () => {
    await repo.auth.login("x@y.z", "p");
    // Forge an expired session.
    const stored = JSON.parse(localStorage.getItem("pocus_user")!);
    stored.expiresAt = Date.now() - 1000;
    localStorage.setItem("pocus_user", JSON.stringify(stored));
    expect(await repo.auth.current()).toBeNull();
    expect(localStorage.getItem("pocus_user")).toBeNull();
  });

  it("current() rejects sessions missing expected fields", async () => {
    localStorage.setItem("pocus_user", JSON.stringify({ email: "x@y.z", role: "admin" }));
    expect(await repo.auth.current()).toBeNull();
  });

  it("regular email login has role user", async () => {
    const u = await repo.auth.login("dr.maria@example.com", "x", "Dra. María Pérez");
    expect(u.role).toBe("user");
    expect(u.name).toBe("Dra. María Pérez");
  });

  it("logout clears the user", async () => {
    await repo.auth.login("x@y.z", "p");
    await repo.auth.logout();
    expect(await repo.auth.current()).toBeNull();
  });

  it("msUntilExpiry returns 0 when no session", async () => {
    expect(await repo.auth.msUntilExpiry()).toBe(0);
  });
});

describe("repo.cases", () => {
  beforeEach(() => localStorage.clear());

  it("listSeed returns the bundled cases", async () => {
    const seed = await repo.cases.listSeed();
    expect(seed.length).toBeGreaterThan(10);
    expect(seed.every((c) => c.id && c.title)).toBe(true);
  });

  it("save inserts when absent and updates when present", async () => {
    const c = mkCase();
    const r1 = await repo.cases.save(c, []);
    expect(r1.ok).toBe(true);
    let user = await repo.cases.listUser();
    expect(user).toHaveLength(1);

    const updated = { ...c, title: "Updated" };
    await repo.cases.save(updated, user);
    user = await repo.cases.listUser();
    expect(user).toHaveLength(1);
    expect(user[0]!.title).toBe("Updated");
  });

  it("remove drops the case by id", async () => {
    const c = mkCase();
    await repo.cases.save(c, []);
    const before = await repo.cases.listUser();
    await repo.cases.remove(c.id, before);
    expect(await repo.cases.listUser()).toEqual([]);
  });

  it("listAll merges user cases ahead of seed", async () => {
    await repo.cases.save(mkCase({ id: "u_1", title: "Mine" }), []);
    const all = await repo.cases.listAll();
    expect(all[0]!.id).toBe("u_1");
    expect(all.length).toBeGreaterThan(10);
  });

  it("remove soft-deletes by stamping deletedAt/deletedBy", async () => {
    const c = mkCase();
    await repo.cases.save(c, []);
    let raw = await repo.cases.listUserRaw();
    await repo.cases.remove(c.id, raw, "admin@taote.pocus");
    raw = await repo.cases.listUserRaw();
    expect(raw[0]!.deletedAt).toBeTruthy();
    expect(raw[0]!.deletedBy).toBe("admin@taote.pocus");
    // listUser excludes soft-deleted; listTrashed surfaces them.
    expect(await repo.cases.listUser()).toEqual([]);
    const trashed = await repo.cases.listTrashed();
    expect(trashed).toHaveLength(1);
  });

  it("listAll excludes soft-deleted cases (public flow)", async () => {
    const c = mkCase();
    await repo.cases.save(c, []);
    const raw = await repo.cases.listUserRaw();
    await repo.cases.remove(c.id, raw, "admin@taote.pocus");
    const all = await repo.cases.listAll();
    expect(all.find((x) => x.id === c.id)).toBeUndefined();
    expect(all.length).toBeGreaterThan(10); // seed cases still there
  });

  describe("listAllPaged", () => {
    it("returns the first page when no cursor is provided", async () => {
      const result = await repo.cases.listAllPaged({ limit: 5 });
      expect(result.items).toHaveLength(5);
      expect(result.nextCursor).not.toBeNull();
      // Local backend can answer the total cheaply.
      expect(result.total).toBeGreaterThan(5);
    });

    it("walks every case in order across pages", async () => {
      // Pull all cases page-by-page and verify the union matches listAll.
      const expected = await repo.cases.listAll();
      const collected: string[] = [];
      let cursor: string | null | undefined = undefined;
      // Defensive iteration cap so a contract regression can't loop forever.
      for (let i = 0; i < 100; i++) {
        const page = await repo.cases.listAllPaged({ cursor, limit: 4 });
        collected.push(...page.items.map((c) => c.id));
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      expect(collected).toEqual(expected.map((c) => c.id));
    });

    it("returns nextCursor: null on the last page", async () => {
      const all = await repo.cases.listAll();
      const total = all.length;
      // Request a single page that consumes the whole set.
      const result = await repo.cases.listAllPaged({ limit: total });
      expect(result.items).toHaveLength(total);
      expect(result.nextCursor).toBeNull();
    });

    it("returns an empty page (and null cursor) past the end", async () => {
      const all = await repo.cases.listAll();
      // Past-the-end cursor — local backend encodes index as a numeric string.
      const result = await repo.cases.listAllPaged({
        cursor: String(all.length + 50),
        limit: 5,
      });
      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    it("treats malformed / null cursors as 'start from beginning'", async () => {
      const a = await repo.cases.listAllPaged({ cursor: null, limit: 3 });
      const b = await repo.cases.listAllPaged({ cursor: "garbage", limit: 3 });
      const c = await repo.cases.listAllPaged({ cursor: "-5", limit: 3 });
      expect(a.items.map((x) => x.id)).toEqual(b.items.map((x) => x.id));
      expect(a.items.map((x) => x.id)).toEqual(c.items.map((x) => x.id));
    });
  });

  it("restore brings a soft-deleted case back to listUser", async () => {
    const c = mkCase();
    await repo.cases.save(c, []);
    const raw1 = await repo.cases.listUserRaw();
    await repo.cases.remove(c.id, raw1, "admin@taote.pocus");
    const raw2 = await repo.cases.listUserRaw();
    await repo.cases.restore(c.id, raw2);
    const live = await repo.cases.listUser();
    expect(live).toHaveLength(1);
    expect(live[0]!.deletedAt).toBeUndefined();
  });

  it("purge hard-deletes from storage", async () => {
    const c = mkCase();
    await repo.cases.save(c, []);
    const raw = await repo.cases.listUserRaw();
    await repo.cases.purge(c.id, raw);
    expect(await repo.cases.listUserRaw()).toEqual([]);
  });
});

describe("repo.favs", () => {
  beforeEach(() => localStorage.clear());

  it("toggle adds the id when missing and removes it when present", async () => {
    let { result, next } = await repo.favs.toggle("a@b.c", "c001", []);
    expect(result.ok).toBe(true);
    expect(next).toEqual(["c001"]);

    ({ result, next } = await repo.favs.toggle("a@b.c", "c001", next));
    expect(next).toEqual([]);
  });

  it("favs are scoped per user email", async () => {
    await repo.favs.toggle("a@b.c", "c001", []);
    expect(await repo.favs.list("a@b.c")).toEqual(["c001"]);
    expect(await repo.favs.list("other@b.c")).toEqual([]);
  });
});
