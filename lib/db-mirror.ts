// Single-process pub/sub for DB mirror failures.
//
// Stage 4 of the localStorage→Postgres transition: when a write
// makes it to localStorage but fails to land in the DB, surface that
// to the UI so the admin knows their work might not be on the server
// yet. The mirror-write itself stays fire-and-forget (we keep the
// optimistic UX), but the failure isn't silent anymore.
//
// Why a global singleton instead of a React context: the writes that
// trigger mirrors live inside `lib/repo.ts` and `hooks/useCustomCategories.ts`,
// neither of which has React state. Threading a context through every
// repo call would balloon the surface area for what is, conceptually,
// "tell the toast layer something went wrong."
//
// The handler is registered once on app mount (`App.tsx`) and cleared
// on unmount. SSR-safe: no listener is registered in server contexts,
// so `notifyMirrorFailure` is a no-op there.

type Handler = (area: string) => void;

let _handler: Handler | null = null;

/**
 * Register the global mirror-failure handler. Pass `null` to clear.
 * Calling twice replaces the previous handler — there's only ever one.
 */
export function setMirrorFailureHandler(fn: Handler | null): void {
  _handler = fn;
}

/**
 * Called from inside the repo / hooks when a DB mirror write fails.
 * The `area` string identifies which subsystem (e.g. `cases.setOverride`,
 * `favs.toggle`, `categories.add`) so the handler can decide what to
 * say — though the default UI just shows a generic "drift detected"
 * toast.
 */
export function notifyMirrorFailure(area: string): void {
  _handler?.(area);
}
