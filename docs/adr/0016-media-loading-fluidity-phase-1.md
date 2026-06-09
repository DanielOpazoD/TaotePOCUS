# ADR 0016 — Phase 1 media loading fluidity: LQIP, combined prefetch, immediate play feedback, and blob enforcement

- **Status**: Accepted
- **Date**: 2026-06-09
- **Decider(s)**: Project lead + implementation review

## Context

The exhaustive review of the audiovisual media pipeline (CineLoop, prefetch, poster strategy, persistence, admin upload) identified several user-visible friction points for fluidity:

- Cold-start thumbnails for real video cases often showed black or skeleton for the first visit (especially iOS Safari, which does not paint the native metadata frame).
- Modal open latency for media (300-800ms+ on 4G) because the full asset was only fetched on click.
- Play button had delayed visual feedback; the buffering state appeared after network events.
- Admin-created cases stored media as data: URLs (embedded base64). This bloats localStorage / case records, bypasses the CDN negotiation (AVIF/WebP), the server poster path, the SW offline cache, and the unified `/api/media` loading surface used by imported seed cases.

The existing Tier-1 client poster cache (ADR-0012 scaffolding + PR #146) and play-on-demand + hover prefetch were good but incomplete for first visit and non-hover scroll paths. The upload path in MediaPanel always went through `fileToDataUrl`.

These are user-facing performance / perceived performance issues in the core catalog experience (grid cards + modal).

## Decision

Implement **Phase 1** of the fluidity improvements with four targeted, low-overhead changes (no new major abstractions, no change to play-on-demand contract, no change to dual-write or seed corpus):

1. **LQIP (tiny placeholder) support**: Add optional `placeholder?: string` (small data URL) to the `Media` interface. In `CineLoop`, for real image media render a blurred low-res layer immediately under the skeleton (using the placeholder). For video, use it as ultimate cold-start fallback for the `poster` attribute. The layer is purely presentational and uses the existing `mediaStyle` for focus/zoom.

2. **Combined prefetch (hover + sustained visible)**: Extend `useHoverPrefetch` to expose `onVisible`. In `CaseCard`, add a lightweight IntersectionObserver (separate from CineLoop's render IO) that calls `onVisible` after ~320 ms of sustained visibility. This warms the HTTP cache for users who scroll without hovering. Hover path unchanged. Deduping and error swallowing preserved.

3. **Immediate play-button feedback**: In the playable `<button>` (modal path), on click set `buffering` synchronously and swap the icon content to the spinner immediately (optimistic). The data-buffering attribute and reconciler already existed; this makes the visual response feel instant before any video network work.

4. **Enforce blob-backed media for admin uploads**: Add `uploadMediaFile` Server Action (protected by `withAdmin`, records `media_uploaded` audit). In `MediaPanel.processFile`, prefer uploading the raw `File` via the action and storing the resulting stable `/api/media/<key>` URL. Fall back to dataURL only when the action fails or blobs are not wired (pure local/demo). This unifies the viewer pipeline for all published cases.

Existing dataURL media (old admin cases, local demo) continues to work unchanged (graceful fallback in rendering and upload).

No new ADR was written at implementation time because the changes were framed as "upkeep + small extensions of existing patterns" (poster cache, prefetch hook, server action shape already used elsewhere). The CI ADR gate later flagged the surface area (new wire in actions, extension of core Media + CineLoop loading states).

## Consequences

**Positive:**

- First meaningful paint for real media thumbnails is faster (blurred content instead of pure skeleton/black).
- Modal media is more often already in HTTP cache for both hover and scroll users.
- Click-to-play has immediate visual response.
- All published admin cases now go through the same high-quality loading path as seed (CDN, content negotiation, future server posters, SW, etc.).
- Storage bloat for new cases is avoided.

**Negative / trade-offs:**

- One extra (tiny) `<img>` DOM node per real-media card in the grid (data URL, so no network; cost is small).
- The visible prefetch IO is a second observer per card (lightweight, rootMargin generous; CineLoop's observer remains the one that controls playback).
- Admin form preview for a fresh upload in a no-blobs dev environment falls back to dataURL (the preview `<img>/<video>` still works).
- Added a small amount of new surface (the `placeholder` field, the `onVisible` handler, the upload action) that needs test coverage to keep coverage-delta happy.

**Follow-ups (for later phases):**

- Full server-side video poster generation + wiring (finish ADR-0012).
- Optional short "preview clip" on sustained hover/visible for even earlier video feel.
- Automatic population of `placeholder` during optimize-media and during admin blob upload.
- Expand LQIP usage to `mediaExtra` carousel and admin previews.

## Alternatives considered

- Pure server-side LQIP generation at import/upload time (deferred; client data URL is zero-cost and already works for the tiny size).
- Always using dataURL for admin (rejected; defeats the unified pipeline goal).
- Making the visible prefetch part of the existing CineLoop observer (would couple prefetch timing to render/playback margins; kept separate for independent tuning).
- Requiring a full ADR before any implementation (the gate script enforces it; we accepted the post-facto ADR + coverage work as the remediation).
