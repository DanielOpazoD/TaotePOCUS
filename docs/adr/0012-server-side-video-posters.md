# ADR-0012 — Server-side video posters

**Status:** Proposed (scaffolding-only landed in PR #154; full ffmpeg pipeline + CineLoop wiring deferred).

**Date:** 2026-05-24

**Supersedes:** None. Augments PR #146 (client-side IDB poster cache).

## Context

The catalog ships ~300 video cases (`.mp4` blobs served via `/api/media/[id]`). On a cold first visit no thumbnail frame is available client-side, so video tiles paint black. PR #146 added a client-side capture path that:

1. Reads the first frame from `<video>` once metadata is decoded.
2. Persists a JPEG data URL to IndexedDB.
3. Re-applies it as `<video poster>` on subsequent visits.

This works **from the second visit onward**. The first visit (and any visitor on a private / fresh browser context) still sees black until the metadata fetch completes — and on iOS Safari, never (the platform does not paint the metadata frame at all).

The fix is a server-side poster: a `<base>.poster.jpg` JPEG generated at media-upload time, served by the existing `/api/media/[id]` route under image content-negotiation, and applied as `<video poster>` by default.

## Decision

Adopt the same pattern that the existing AVIF / WebP variants follow:

1. **Generation script** (`scripts/generate-video-posters.mjs`):
   - Walks the Netlify Blobs `imports` store for `.mp4` / `.webm` / `.mov` keys.
   - For each video, runs `ffmpeg` to extract the frame at t=0 (clamped to 320 px max dimension, JPEG quality 0.6).
   - Uploads the result as `<base>.poster.jpg` to the same store.
   - Idempotent (skip if `<base>.poster.jpg` already exists; `--force` to regenerate).
   - Driven by `@ffmpeg-installer/ffmpeg` so contributors don't need a global ffmpeg install.

2. **Negotiation contract** (`lib/blobs.ts > pickMediaCandidates`):
   - When the requested id has a video extension AND the request's `Accept` header advertises an image MIME (i.e. the browser is fetching this URL as a `<video poster>` or an `<img>` src), prepend `<base>.poster.jpg` to the candidate list.
   - The video extension itself stays as a fallback candidate so a missing poster still returns the original mp4 (the `<video>` element ignores non-image responses on the poster attribute → falls back to native behavior).
   - This is the contract change shipped in this PR. The script + wiring follow.

3. **CineLoop wiring** (`components/cine/CineLoop.tsx`):
   - Replace the `poster={cachedPoster ?? undefined}` line with `poster={cachedPoster ?? `/api/media/${encodeURIComponent(media.id)}`}`. The browser sends `Accept: image/*`, the route negotiates the JPG poster, frame paints synchronously on first load.
   - IDB cache becomes the fast-path for subsequent visits (saves a network round-trip even though the server poster is heavily CDN-cached).

4. **Storage cost:** ~325 videos × ~6 KB JPEG ≈ ~2 MB additional in Blobs. Trivial.

5. **Build pipeline:** Run the generator once after the next `apply-twitter-import.mjs` pass. Document it as a post-import step in `scripts/apply-twitter-import.mjs`'s header. Future imports add new videos; the script is idempotent so re-running is safe and cheap.

## Consequences

**Positive:**

- First-visit thumbnails render frame-accurate on every browser (including iOS Safari).
- No client-side CPU cost (the canvas capture + base64 encode in PR #146 becomes a fallback, not the primary path).
- CDN-cached posters are immutable (1-year cache, like the existing AVIF/WebP variants).

**Negative:**

- `@ffmpeg-installer/ffmpeg` adds ~75 MB to the devDep tree (the binary). Not in the production runtime — only the build-script consumer. Mitigated by it being an optional devDep used only when running the generator.
- Manual post-import step (one CLI invocation). Can be wired into the import pipeline later, but adding it to CI requires the GitHub Actions runner to install the ffmpeg binary (which `@ffmpeg-installer` does automatically).
- The PR #146 client capture path becomes legacy fallback. Keep it for browsers without server posters (transient — when a freshly-imported video hasn't had the poster generated yet).

## Rollback

Trivial:

- Revert the `pickMediaCandidates` change → server falls back to original mp4.
- The CineLoop wiring stays a no-op when the server returns a non-image response under image Accept (browsers ignore the poster attribute then).
- The generator script is opt-in (manual CLI), so leaving it unrun in a regression scenario doesn't affect anything.

## Scope of THIS PR (#154)

Only items 1 and 2 of the negotiation contract land:

- `lib/blobs.ts > pickMediaCandidates` — extend to insert `<base>.poster.jpg` candidate for video keys when Accept is image/\*.
- Test coverage for the new branch.

Items 3 (script), 4 (storage), and 5 (CineLoop wiring) are follow-ups, each in its own focused PR. Decoupling lets the negotiation contract be reviewed independently of the ffmpeg dev-dep introduction.

## Open questions

1. **Frame selection.** t=0 vs t=0.5s — many medical clips have a black intro frame. Heuristic options: (a) sample frames at t=0, 0.5, 1, pick the one with highest variance; (b) extract a few frames and let an admin pick. (a) is automated, (b) is editorial.
2. **Live re-encode on miss?** A Netlify Function could ffmpeg on first GET, cache the result. Avoids the manual script step but adds cold-start latency. Defer until a generation cycle proves slow.
3. **Aspect ratio.** Posters cropped to 320×320 or letterboxed at native aspect? PR #146 used a fitting algorithm; the server should match.
