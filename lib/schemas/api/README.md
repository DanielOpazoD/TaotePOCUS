# API contract schemas (zod)

Runtime-validated contracts for each route in `app/api/**`. The pattern
overrides the no-zod policy documented in `lib/schemas.ts` for one
specific surface — the rationale is captured in this file rather than
buried in commit messages.

## Why zod here (and not in `lib/schemas.ts`)

`lib/schemas.ts` validates the case corpus — 326 entries with a fixed
shape that was hand-rolled deliberately ("Zero new runtime deps,
shapes are small and stable, the full power of a schema library is
overkill"). That logic stands; it isn't reopened by this PR.

API contracts are a different problem:

1. **The shapes change more often** than the corpus shape. Adding a
   field to `/api/admin/ai/translate`'s response should be a one-line
   schema edit, not a six-place ripple (validator + types +
   server-side input check + server-side output check + client parse
   - tests).

2. **Contract drift is silent without runtime validation.** TypeScript
   catches refactors that change the type, but if the server's actual
   response diverges from its declared type (e.g. middleware strips a
   field, a stub provider returns the wrong shape), the client gets
   `undefined` reads with no signal. zod's `parse()` throws at the
   boundary instead.

3. **The hand-rolled style produces noise.** Compare the 90-line
   `validateLocalizedContent` + `validateRequest` + `validateProviderOutput`
   chain in the pre-zod `translate/route.ts` to the ~15-line schema
   version. The expressiveness/code-size ratio is where zod earns the
   80KB.

## Bundle posture

zod is a **server-only runtime dependency**. The client never imports
zod's runtime — only the inferred TypeScript types via `import type`,
which the TypeScript compiler erases. To preserve this, every client
consumer follows this pattern:

```ts
// ✓ correct — types only, zod doesn't ship
import type { AIProvidersResponse } from "@/lib/schemas/api/ai-providers";

// ✗ wrong — runtime import drags zod into the client bundle
import { aiProvidersResponseSchema } from "@/lib/schemas/api/ai-providers";
```

`npm run analyze` (a bundle-analyzer build) confirms zod stays out of
the browser bundle. If a future change accidentally imports the
schema at runtime, the bundle-budget step in CI will trip on the
size jump.

## Adding a new route

For a new route `/api/foo/bar`:

1. Create `lib/schemas/api/foo-bar.ts` with:
   - The zod request schema (if the route takes a body)
   - The zod response schema
   - Inferred TS types via `z.infer`
   - A `parseFooBarResponse` helper for the client
2. In the route handler:
   - `requestSchema.safeParse(body)` for incoming bodies
   - `responseSchema.parse(payload)` before `Response.json` — fails
     loud if the route's logic produced the wrong shape
3. In the client fetcher:
   - `import type` the types
   - Optionally use the response parser to catch server drift

Tests live in `tests/lib/schemas/api/<route>.test.ts` and cover:
parse-success, parse-fail on each required field, parse-fail on a
trailing-unknown-field policy (we use `.strict()` by default).
