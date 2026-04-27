// Admin-only views. Lazy-loaded by `App.tsx` (dynamic + ssr:false) so
// they don't ship with the public bundle.
export { default as AdminPanel } from "./AdminPanel";
export { default as CaseForm } from "./CaseForm";
