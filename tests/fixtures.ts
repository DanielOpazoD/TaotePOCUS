// Shared test fixtures. Factories return fully-populated objects of
// the right shape with sensible defaults; callers override any fields
// they care about for the specific scenario. This keeps tests focused
// on the behavior under test rather than on object construction.
//
// When the domain types in `lib/types.ts` change, this file is the
// single place that needs to update — every test that uses the
// factories follows automatically.
//
// Convention: every factory accepts a `Partial<T>` of overrides as
// its first (only) argument. Use named overrides liberally:
//
//   const c = caseFactory({ id: "c042", featured: true });
//   const u = userFactory({ role: "admin", email: "boss@x.com" });

import type { CaseRecord, CategoryId, CategoryWithCount, SectionId, User, View } from "@/lib/types";

let __counter = 0;
/** Deterministic id generator scoped to the test run. Reset in setup. */
function nextId(prefix: string): string {
  __counter += 1;
  return `${prefix}-${__counter.toString().padStart(3, "0")}`;
}

/**
 * Build a `CaseRecord` with realistic-looking defaults. The default
 * scene is "blines" because it's the safest cine-loop type — most
 * tests don't render the canvas, but if one does, it works.
 */
export function caseFactory(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id: nextId("c"),
    section: "atlas",
    title: "Edema pulmonar agudo",
    category: "lung",
    tags: ["B-líneas", "Crítico"],
    modality: "Lung POCUS",
    loop: "blines",
    author: "Dr. Test Author",
    role: "Residente UCI",
    date: "2026-04-15",
    description:
      "Paciente con disnea súbita; eco rápido confirma sobrecarga de volumen. " +
      "Patrón B confluente bilateral, líneas pleurales engrosadas. " +
      "Edema pulmonar agudo cardiogénico.",
    featured: false,
    difficulty: "intermediate",
    ...overrides,
  };
}

/** Build a `User` (default role: regular user, session valid for 1 day). */
export function userFactory(overrides: Partial<User> = {}): User {
  const now = Date.now();
  return {
    email: "test@taote.pocus",
    name: "Test User",
    initials: "TU",
    role: "user",
    issuedAt: now,
    expiresAt: now + 24 * 3_600_000,
    ...overrides,
  };
}

/** Convenience: an admin user with default 8-hour session. */
export function adminFactory(overrides: Partial<User> = {}): User {
  return userFactory({
    email: "admin@taote.pocus",
    name: "Admin User",
    initials: "AU",
    role: "admin",
    expiresAt: Date.now() + 8 * 3_600_000,
    ...overrides,
  });
}

/**
 * Build a `View`. Use the named helpers below — they read better at
 * the call site than passing magic discriminator strings.
 */
export const viewFactory = {
  section: (section: SectionId = "atlas"): View => ({ kind: "section", section }),
  favs: (): View => ({ kind: "favs" }),
  admin: (): View => ({ kind: "admin" }),
};

/** Build a `CategoryWithCount` for sidebar tests. */
export function categoryFactory(id: CategoryId, label: string, count: number): CategoryWithCount {
  return { id, label, count };
}

/**
 * Convenience bundle: three categories that match what the catalog
 * actually ships, in the right order. Use when a test doesn't care
 * about exact labels and just needs realistic data.
 */
export const sampleCategories: CategoryWithCount[] = [
  categoryFactory("cardiac", "Cardíaco", 3),
  categoryFactory("lung", "Pulmonar", 5),
  categoryFactory("abdominal", "Abdominal", 2),
];

/**
 * Reset the deterministic id counter. Call in a `beforeEach` if your
 * test file asserts on specific generated ids. Most tests don't need
 * this — they pass overrides that pin the id directly.
 */
export function resetIdCounter() {
  __counter = 0;
}
