// Backwards-compat re-export. The bulk-edit feature was extracted
// into `./bulk-edit/*` in May-2026 (one orchestrator + one row
// component + five cell components, each in its own file). The
// previous monolithic file (~870 LOC) lived here. Keeping this
// path as a re-export so existing imports — including the test
// suite — don't break; new code should import from
// `./bulk-edit` directly.
export { default, BulkEditTagSuggestions } from "./bulk-edit";
