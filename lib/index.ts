// Barrel for the most common imports — lets callers write
// `import { repo, log } from "@/lib"` when they need several things.
// Direct paths (`@/lib/repo`) are still fine and slightly faster for
// tree-shaking; use whichever reads better at the call site.

export { repo, auth, cases, favs } from "./repo";
export { log } from "./log";
export {
  AuthError,
  StorageError,
  isAuthError,
  isOk,
  isErr,
  ok,
  err,
  unwrap,
  type Result,
  type AuthErrorCode,
  type StorageErrorReason,
} from "./errors";
export { ADMIN_CREDENTIALS, SITE_URL, IS_PRODUCTION } from "./env";
export { derivePageHead, type PageHead } from "./headers";
export {
  parseViewState,
  applyViewPatch,
  pathToView,
  viewToPath,
  type ViewPatch,
  type ViewState,
  type SortOrder,
} from "./url";
export { SECTIONS, CATEGORIES, COMMON_TAGS } from "./data";
// Bundled cases corpus — async loader (code-split). See `lib/seed-cases.ts`.
export { loadSeedCases, getSeedCasesSync } from "./seed-cases";
export type {
  CaseRecord,
  Category,
  CategoryId,
  LoopKind,
  Media,
  MediaKind,
  Section,
  SectionId,
  User,
  View,
} from "./types";
