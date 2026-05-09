// Public-facing readouts about the storage backend. UI components
// can import from here without tripping the ESLint guard against
// `lib/store` (the backend implementation is private to the repo
// facade, but high-level status flags are part of the user-visible
// surface and need a path through to chrome components).
//
// The actual probe + fallback logic lives in `lib/store.ts`; this
// module is just the re-export surface.

export { isUsingMemoryStorage } from "./store";
