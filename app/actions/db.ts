// Barrel for the Server Action surface against Netlify Database.
//
// Note: NO `"use server"` directive on the barrel. Each submodule below
// IS a `"use server"` file — that's where Next.js identifies the
// individual actions and stamps them as POST endpoints. A `"use server"`
// directive on a barrel that does `export { ... } from "..."` is
// rejected by the Next.js compiler ("Only async functions are allowed
// to be exported in a use-server file"). Removing it lets the barrel
// be a regular ES module that re-references the action symbols; the
// underlying server-action identity travels with the symbol from the
// submodule.
//
// Each action lives in its own domain submodule under `app/actions/db/`:
//
//   - overrides.ts      — case_overrides (per-case admin edits) +
//                         media purge endpoints (deleteMedia,
//                         purgeImported).
//   - user-cases.ts     — user_cases (admin-uploaded cases).
//   - categories.ts     — custom_categories (admin-defined categories).
//   - favs.ts           — favorites (per-user lists, "guest" bucket).
//   - bulk-import.ts    — Backup → Restore-into-DB single-shot import.
//   - migrations.ts     — Netlify migration tracker health probe.
//   - audit.ts          — admin_actions read endpoint for the
//                         "Actividad" view.
//   - _authz.ts         — shared helpers (withAdmin/withAuth/
//                         withDbRead, fail, recordAdminAction,
//                         authorizeUserCase, ActionResult). NOT a
//                         Server Action file.
//
// Why the split: the previous monolith was 846 LOC concentrating all
// dispatch + authz + audit + transaction work in one file. Splitting
// by table reflects the existing authorization boundaries (admin-only
// vs. per-user vs. public-read) and makes `git blame` a reading aid
// instead of a chore. The `withAdmin / withAuth / withDbRead`
// decorators in `_authz.ts` deduplicate ~19 copies of the
// session-resolve + try/fail boilerplate that the old file repeated
// inline in every action body.
//
// Consumers (`lib/repo/dual-write.ts`, `hooks/useCustomCategoriesData.ts`,
// `components/admin/ActivityPanel.tsx`, `components/admin/BackupPanel.tsx`)
// import from this barrel; the split is invisible to them.

export {
  dbClearOverride,
  dbDeleteMedia,
  dbListOverrides,
  dbPurgeImported,
  dbSetOverride,
} from "./db/overrides";

export {
  dbListUserCases,
  dbPurgeUserCase,
  dbRemoveUserCase,
  dbRestoreUserCase,
  dbSaveUserCase,
} from "./db/user-cases";

export {
  dbAddCategory,
  dbListCategories,
  dbRemoveCategory,
  dbRenameCategory,
} from "./db/categories";

export { dbListFavs, dbSetFavs } from "./db/favs";

export { dbBulkImport } from "./db/bulk-import";

export { dbCheckMigrations } from "./db/migrations";

export { dbListAdminActions } from "./db/audit";

// Type-only re-exports. The barrel is `"use server"` so runtime
// exports must be async functions; types are erased at compile time
// and so are safe via `export type`. Consumers (e.g. ActivityPanel)
// can keep importing the row shape from the barrel rather than
// having to know the submodule path.
export type { AdminActionRow } from "./db/audit";
export type { BulkImportPayload } from "./db/bulk-import";
export type { MigrationsHealth } from "./db/migrations";
