"use server";

// One-shot sanity probe of the Netlify migration tracker. Returns the
// rows of `netlify.migrations` alongside `netlify.migration_checksums`
// so an admin can spot drift without opening the Neon SQL editor.
// See `docs/runbooks/migration-tracker-recovery.md` for what to look
// for and how to fix.
//
// Admin-only: the tables live in a system schema and the operator
// could in principle infer the deployment cadence from them.

import { getDatabase } from "@netlify/database";
import { withAdmin } from "./_authz";

export interface MigrationsHealth {
  ok: true;
  tracker: Array<{ id: number; version_id: number; is_applied: boolean }>;
  checksums: Array<{ version: number; name: string; sha256: string }>;
  drift: Array<{
    kind: "tracker_without_checksum" | "checksum_without_tracker";
    version_id: number;
    name?: string;
  }>;
}

export async function dbCheckMigrations(): Promise<
  MigrationsHealth | { ok: false; reason: "auth_required" | "forbidden" | "unknown" }
> {
  return withAdmin("checkMigrations", async () => {
    const db = getDatabase();
    const tracker = await db.sql<{
      id: number;
      version_id: number;
      is_applied: boolean;
    }>`
      SELECT id, version_id, is_applied
      FROM netlify.migrations
      ORDER BY version_id
    `;
    const checksums = await db.sql<{ version: number; name: string; sha256: string }>`
      SELECT version, name, sha256
      FROM netlify.migration_checksums
      ORDER BY version
    `;
    // Drift detection: phantom rows are tracker entries WITHOUT a
    // matching checksum. The inverse (a checksum without a tracker
    // entry) is also surfaced — that would mean a file recorded as
    // applied that no longer counts as applied, also worth a look.
    const checksumVersions = new Set(checksums.map((c) => c.version));
    const trackerVersions = new Set(
      tracker.filter((t) => t.version_id > 0).map((t) => t.version_id),
    );
    const drift: MigrationsHealth["drift"] = [];
    for (const t of tracker) {
      if (t.version_id <= 0) continue; // skip the (-1) init marker
      if (!checksumVersions.has(t.version_id)) {
        drift.push({ kind: "tracker_without_checksum", version_id: t.version_id });
      }
    }
    for (const c of checksums) {
      if (!trackerVersions.has(c.version)) {
        drift.push({
          kind: "checksum_without_tracker",
          version_id: c.version,
          name: c.name,
        });
      }
    }
    return { ok: true, tracker, checksums, drift } as MigrationsHealth;
  });
}
