"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { useT } from "@/hooks/useLanguage";
import type { Media } from "@/lib/types";
import { getMediaCacheEntry, markMediaLoaded } from "@/lib/media-cache";
import { getPoster, setPoster } from "@/lib/poster-cache";
import { isMediaVideo } from "@/lib/media-kind";
import { drawScene, drawChrome, type SceneLabels } from "./cineScenes";
import { usePreferences } from "@/hooks/usePreferences";

interface Props {
  kind?: string;
  aspect?: string;
  speed?: number;
  paused?: boolean;
  showChrome?: boolean;
  media?: Media;
  /**
   * "thumb"  — clamps DPR to 1 to keep many cards in the grid cheap.
   * "full"   — clamps DPR to 2 for the modal/presentation where quality matters.
   * Default: "thumb".
   */
  quality?: "thumb" | "full";
  /**
   * When true, the wrapper adapts to the media's intrinsic dimensions
   * once they're known (after `loadedmetadata` for video / `load` for
   * image), overriding the `aspect` prop. The grid keeps `false` so
   * thumbnails stay uniform; the modal sets `true` so a chest x-ray
   * doesn't get cropped to a square.
   */
  preserveNativeAspect?: boolean;
  /**
   * Optional focal-point + zoom override. Applied as `object-position`
   * (x/y as percentages) and `transform: scale()` on the underlying
   * video/img. The wrapper itself stays at the caller-provided
   * `aspect`, so the layout is unaffected — only the framing of the
   * media inside the wrapper changes.
   *
   * `x` / `y` default to 50 (centered); `scale` defaults to 1 (no
   * zoom). Has no effect on the synthetic-loop canvas renderer.
   */
  focus?: { x?: number; y?: number; scale?: number };
  /**
   * When true, the underlying `<Image>` is rendered with
   * `priority` (eager loading + `fetchPriority="high"`) so the
   * browser pulls the asset ahead of below-the-fold cards. Reserve
   * for the first ~6 cards in the grid — those above the fold and
   * candidates for LCP.
   */
  priority?: boolean;
  /**
   * Whether the centered play-button overlay is interactive
   * (clicking it starts playback) or purely decorative (visual
   * "this is a video" cue with `pointer-events: none`).
   *
   * Default `false` — used by every grid surface, where the card
   * itself is the click target (it opens the modal) and the
   * decorative overlay just communicates "video inside, you'll
   * be able to play it after opening". `true` in the modal
   * (`ModalLoopMedia`) where the user has expressed intent and
   * clicking play in-place is the expected affordance.
   *
   * Videos NEVER autoplay regardless of this flag — the play
   * button is the only way to start playback. This is intentional
   * data-saving behavior (see the file header comment on
   * `preload="metadata"` for the broader strategy).
   */
  playable?: boolean;
  /**
   * Optional callback fired when the user clicks the center play
   * button. The CineLoop already toggles its own internal play
   * state; this hook lets a parent that also tracks playback
   * (e.g. the modal's chrome play/pause toggle) stay in sync.
   *
   * Without this, the modal's `paused=true` initial state would
   * race against the button's local `playRequested=true` — the
   * reconciler would call play() then immediately pause(). The
   * modal handler clears its `paused` state, the reconciler
   * re-runs in agreement, and playback starts cleanly.
   */
  onPlayRequest?: () => void;
}

export default function CineLoop({
  kind = "blines",
  aspect = "1/1",
  speed = 1,
  paused = false,
  showChrome = true,
  media,
  quality = "thumb",
  preserveNativeAspect = false,
  focus,
  priority = false,
  playable = false,
  onPlayRequest,
}: Props) {
  const t = useT();
  // Per-device preference: if the user explicitly opted back into
  // autoplay via SettingsPanel, treat every "visible" state as an
  // implicit play request. Default `false` keeps PR #109's
  // play-on-demand behavior — the data-saver opt-out.
  const { prefs: userPrefs } = usePreferences();
  // Resolve all synthetic-scene labels once per language change.
  // The `drawScene` call below runs inside the animation loop —
  // recomputing the object every frame would allocate ~6 strings ×
  // 60 fps × every CineLoop on the page. `useMemo` keyed on `t`
  // (which is itself memoized by language change inside
  // `LanguageProvider`) makes this a one-allocation-per-language-
  // switch cost.
  const sceneLabels = useMemo<SceneLabels>(
    () => ({
      ecg: {
        stemi: t("scene.ecg.stemi"),
        afib: t("scene.ecg.afib"),
        bav: t("scene.ecg.bav"),
      },
      info: {
        blue: t("scene.info.blue.sub"),
        rush: t("scene.info.rush.sub"),
        fast: t("scene.info.fast.sub"),
      },
    }),
    [t],
  );
  // Resolve focus values once. Defaults match the no-override case
  // (centered, no zoom), so passing focus={undefined} is identical to
  // not passing it.
  const focusX = focus?.x ?? 50;
  const focusY = focus?.y ?? 50;
  const focusScale = focus?.scale ?? 1;
  // Style applied inline to <video>/<img>. Three pieces:
  //
  //   - `objectPosition` handles the pan (x/y as percentages).
  //   - `transform: scale(...)` zooms the element relative to its
  //     center. Omitted at scale=1 to avoid a useless compositing
  //     layer.
  //   - `objectFit` SWITCHES from the default `cover` (set in
  //     `app/styles/cine.css`) to `contain` whenever the user pulls
  //     the focus zoom below 1. Cover crops to fill the cell, so a
  //     transform scale<1 just shrinks the *cropped* view inside the
  //     same cell — the cropped sides never reappear, which is
  //     counterintuitive and was the user-reported bug. Contain fits
  //     the whole image inside the cell (with letterbox), so going
  //     below 1 reveals the previously-cropped regions. The transform
  //     scale<1 then composes on top to shrink further within the
  //     letterbox if the admin really wants a small inset preview.
  //     At scale=1 we inherit `cover` unchanged so existing card
  //     framings are byte-for-byte preserved.
  const mediaStyle: React.CSSProperties = {
    objectPosition: `${focusX}% ${focusY}%`,
    ...(focusScale < 1 ? { objectFit: "contain" as const } : {}),
    ...(focusScale !== 1 ? { transform: `scale(${focusScale})` } : {}),
  };
  // Session-level cache lookup. If we've already painted this URL
  // at least once during this page session, we seed every loading-
  // related state to its "loaded" value so the spinner / skeleton
  // never render on remount. The HTTP cache will paint the image
  // synchronously and the user perceives no flash. See
  // `lib/media-cache.ts` header for the full rationale.
  //
  // Computed once per render rather than memoized — the lookup is
  // a `Map.get` on a small in-memory map, microsecond-cost.
  const cached = media ? getMediaCacheEntry(media.src) : undefined;
  // Native aspect ratio of the loaded media, captured after the video
  // emits `loadedmetadata` or the image emits `load`. Stays null until
  // the browser decodes the file — until then we render with the
  // caller-provided `aspect` so the wrapper has stable dimensions.
  // Seeded from the cache so a remount doesn't briefly relayout from
  // the caller `aspect` back to the resolved native aspect.
  const [nativeAspect, setNativeAspect] = useState<string | null>(cached?.nativeAspect ?? null);
  // Loading state for the image/video paths. The wrapper carries
  // `data-loaded="false"` until the asset paints, which CSS uses to
  // show a shimmer skeleton + fade the asset in. Without this, a
  // category click switches the DOM instantly but the user sees
  // empty cells (transparent <Image> / blank <video>) for the
  // duration of the CDN fetch — reads as "the page is frozen".
  // Synthetic-canvas loops skip this entirely (RAF paints the first
  // frame on the next tick, so there's no perceptible blank window).
  const [loaded, setLoaded] = useState(cached?.loaded ?? false);
  // Two-stage video loading: `metadataLoaded` flips when the browser
  // has the first frame painted (cheap, via `preload="metadata"`);
  // `loaded` flips when there's enough buffer to start playing. Post
  // play-on-demand, `metadataLoaded` is the one that matters — once
  // the poster is ready we unmount the skeleton and the play-button
  // overlay takes over. `loaded` is kept for the cache contract
  // (markMediaLoaded) and the image-branch reuse below.
  // Same cache-seed treatment as `loaded` above — if we know the
  // asset was loaded before, both flags start at `true` and the
  // skeleton skips rendering entirely on remount.
  const [metadataLoaded, setMetadataLoaded] = useState(cached?.loaded ?? false);
  // Play-on-demand state. Three flags, intentional separation:
  //
  //   - `playRequested`: did the user click the play button at some
  //     point during this card's lifetime? Sticky — only resets when
  //     `media.src` changes. Lets us resume on scroll-back-into-view
  //     without re-prompting the user.
  //   - `isPlaying`: is the <video> element actively playing right
  //     now? Mirror of native `play`/`pause` events. Drives whether
  //     the play-button overlay is rendered.
  //   - `buffering`: did the user just click play and we're waiting
  //     for the first frame to actually start? Drives the spinner
  //     INSIDE the play button. Clears as soon as `playing` event
  //     fires, OR if the play() promise rejects.
  //
  // The previous (PR #X) implementation autoplayed every visible
  // card via IntersectionObserver. With ~15 cards × N-MB clips, the
  // page used disposable bandwidth on every Atlas open even when the
  // user only clicked into one or two. Play-on-demand keeps the
  // poster (free with `preload="metadata"`) and gates byte transfer
  // on an explicit click.
  const [playRequested, setPlayRequested] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  // Bridges the modal's chrome play/pause toggle (which writes
  // `paused`) into our internal `playRequested` flag, so the two
  // controls speak the same language: clicking chrome-play has the
  // same effect as clicking the center badge.
  //
  // We can't naively set `playRequested = true` whenever `paused`
  // is false — that would autoplay every grid surface (which
  // mounts with the default `paused: false`). The ref skips the
  // initial render so only a SUBSEQUENT flip from true→false counts
  // as an explicit play intent. Grid: never flips (always false),
  // skipped on mount → no autoplay. Modal: starts true, user
  // clicks chrome-play → flips to false → counts as intent.
  const skipInitialPausedSyncRef = useRef(true);
  // Tier 1 of the poster strategy (see `lib/poster-cache.ts` header).
  // `cachedPoster` holds the JPEG data URL for the current `media.src`
  // — hydrated from IndexedDB on src change, or filled in by the
  // `onLoadedMetadata` / `onLoadedData` handlers below as soon as the
  // video element has a paintable frame. Applied to `<video poster>`
  // so engines that DON'T paint the metadata frame on their own
  // (notably iOS Safari) still show the still preview immediately
  // on the next visit. The data URL is a few KB so it's safe to
  // inline in the attribute.
  const [cachedPoster, setCachedPoster] = useState<string | null>(null);
  // Guards against re-capturing the same `media.src` more than once
  // during a single mount: `loadedmetadata` and `loadeddata` both
  // fire, and `loadedmetadata` can re-fire on seek. Also covers the
  // "we already have a cached poster from IDB" case — capturing
  // again would just re-encode the same frame. Reset whenever
  // `media.src` changes (see the hydration effect below).
  const captureAttemptedRef = useRef<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(typeof performance !== "undefined" ? performance.now() : 0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Track whether the loop is in (or near) the viewport. Off-screen
  // cards pause their work (RAF for synthetic canvas, play() for real
  // videos). Threshold is tighter for `<video>` (50px) than for the
  // canvas loop (200px) because every active <video> costs a decoder
  // slot + bandwidth, while RAF skip is essentially free. Both stay
  // generous enough that cards "wake up" before they reach the
  // user's eye on a normal scroll.
  const [visible, setVisible] = useState(true);
  // Respect prefers-reduced-motion: render a single static frame instead
  // of looping. Vestibular accessibility.
  const [reducedMotion, setReducedMotion] = useState(false);
  // Document-visibility: when the user switches tabs / minimizes the
  // window, pause everything. Most browsers throttle background tabs
  // anyway, but explicit pause stops decoders, saves battery, and
  // makes the return-to-tab feel instant rather than buffered.
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Real video cards trigger this branch via the `media.src` path;
    // canvas cine-loops use the same observer, just with a wider
    // margin tuned to anticipate scroll without a decoder cost.
    const isVideo = !!media;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setVisible(entry.isIntersecting);
      },
      { rootMargin: isVideo ? "50px" : "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [media]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Reset the load flag whenever the source changes so the skeleton
  // re-appears for the new asset. Without this, an admin editing a
  // case's media (rare path) would carry the previous asset's
  // "loaded" state into the new fetch.
  //
  // The cache check below makes the reset cache-aware: if the NEW
  // src has already been loaded in this session, we skip the reset
  // entirely so the skeleton doesn't flash for an asset the browser
  // is about to paint from cache. This matters because `media.src`
  // CAN change on the same mounted CineLoop (admin media edit) — we
  // don't want to lose the optimization in that case either.
  useEffect(() => {
    // src change always resets the user's "play me" intent — a new
    // video isn't an implicit continuation of the previous one.
    // Without this, an admin swapping the case media (rare path)
    // would auto-resume the new video as if it were the same clip.
    setPlayRequested(false);
    setIsPlaying(false);
    setBuffering(false);
    if (!media?.src) {
      setLoaded(false);
      setMetadataLoaded(false);
      return;
    }
    const entry = getMediaCacheEntry(media.src);
    if (entry?.loaded) {
      setLoaded(true);
      setMetadataLoaded(true);
      if (entry.nativeAspect) setNativeAspect(entry.nativeAspect);
    } else {
      setLoaded(false);
      setMetadataLoaded(false);
    }
  }, [media?.src]);

  // Hydrate the cached poster (if any) from IndexedDB on src change.
  // Async: the poster paints on the next React tick after the IDB
  // read resolves — typically <10 ms but can be longer on cold-start.
  // Until then `<video poster>` is unset and the browser falls back
  // to its native first-frame behavior (which iOS Safari skips,
  // hence the cache). The capture guard is reset here too so the
  // new src gets a fresh attempt to capture if the cache misses.
  useEffect(() => {
    captureAttemptedRef.current = null;
    setCachedPoster(null);
    if (!media?.src) return;
    const src = media.src;
    let cancelled = false;
    void getPoster(src).then((poster) => {
      if (cancelled || !poster) return;
      setCachedPoster(poster);
      // If we hit the IDB cache there's nothing left to capture for
      // this src — mark attempted so the loadedmetadata handler
      // doesn't redundantly re-encode the same frame.
      captureAttemptedRef.current = src;
    });
    return () => {
      cancelled = true;
    };
  }, [media?.src]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Watch parent `paused`: any transition to false (after mount)
  // counts as a play intent. See the comment on
  // `skipInitialPausedSyncRef` above for why we skip the first
  // render. Also covers the carousel case: when a slide becomes
  // the active one, its `paused` flips false → it auto-resumes if
  // the user had played any slide in this modal session.
  useEffect(() => {
    if (skipInitialPausedSyncRef.current) {
      skipInitialPausedSyncRef.current = false;
      return;
    }
    if (!paused) setPlayRequested(true);
  }, [paused]);

  useEffect(() => {
    // Play-on-demand reconciler. The video plays IFF:
    //   1. The user has clicked play at least once (playRequested).
    //   2. The parent isn't force-pausing us (e.g. the modal's
    //      chrome pause toggle, or the carousel parking off-screen
    //      slides via `paused || i !== active`).
    //   3. The card is on-screen (visible) — pause when scrolled
    //      away to free decoder slots & bandwidth.
    //   4. The tab is in the foreground (tabVisible) — pause when
    //      the user switches tabs.
    //
    // When all four are true, calling play() is idempotent (no-op
    // if already playing). When any becomes false we pause but
    // DON'T clear playRequested — coming back into view resumes
    // automatically, which matches user expectation ("I asked you
    // to play this; the brief scroll-away shouldn't be a re-prompt").
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
    // `userPrefs.autoplay` is the SettingsPanel opt-back-in: when
    // true, the user has explicitly chosen the pre-#109 behavior
    // (autoplay on visible). Treat it as a permanent play intent
    // so the reconciler plays anytime the card is visible + the
    // tab is foregrounded, without the user having to tap the
    // center play button each time.
    const shouldPlay = (playRequested || userPrefs.autoplay) && !paused && visible && tabVisible;
    if (shouldPlay) {
      v.play().catch(() => {
        // Autoplay policies can reject (browsers gate even muted
        // autoplay sometimes). Clear buffering so the spinner
        // doesn't linger.
        setBuffering(false);
      });
    } else {
      v.pause();
    }
  }, [playRequested, paused, speed, media, visible, tabVisible, userPrefs.autoplay]);

  useEffect(() => {
    if (media) return;
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const dprMax = quality === "full" ? 2 : 1;
    const dpr = Math.min(window.devicePixelRatio || 1, dprMax);

    function resize() {
      if (!cvs) return;
      const rect = cvs.getBoundingClientRect();
      cvs.width = rect.width * dpr;
      cvs.height = rect.height * dpr;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cvs);

    let frame = 0;
    function draw(now: number) {
      if (!ctx || !cvs) return;
      if (paused || !visible || !tabVisible) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const t = ((now - startRef.current) / 1000) * speed;
      const W = cvs.width;
      const H = cvs.height;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      // Speckle is the heaviest op (getImageData/putImageData). For thumbs
      // we update it every 3rd frame; the eye doesn't catch the difference
      // but CPU drops by ~60%. Full quality runs every frame.
      const refreshSpeckle = quality === "full" || frame % 3 === 0;
      drawScene(ctx, W, H, t, kind, { refreshSpeckle, labels: sceneLabels });
      if (showChrome) drawChrome(ctx, W, H, dpr, kind);
      frame++;
      // Reduced-motion users: render exactly one frame and stop.
      if (reducedMotion) return;
      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
    // `sceneLabels` is memoized on language change (see useMemo above)
    // — without including it the animation loop never re-renders the
    // ECG / info scenes when the user toggles language while a synthetic
    // loop is on screen.
  }, [
    kind,
    speed,
    paused,
    showChrome,
    media,
    visible,
    tabVisible,
    quality,
    reducedMotion,
    sceneLabels,
  ]);

  if (media && (media.kind === "video" || media.kind === "image" || media.kind === "gif")) {
    // Pick the right renderer based on the actual file extension, not
    // just the declared kind. Twitter's "animated_gif" media type is
    // shipped as an .mp4 file in the archive — declaring kind="gif"
    // with an .mp4 src and rendering as <img> would break the thumbnail
    // (browsers can't paint mp4 inside <img>). The `isMediaVideo`
    // helper in `lib/media-kind.ts` encodes the dispatch logic;
    // every renderer that handles user-provided `Media` should use
    // it instead of inline checks. Audit on the seed corpus showed
    // 218/326 cases trip the kind-vs-extension mismatch — anything
    // that didn't go through the helper rendered blank.
    const src = media.src || "";
    const isVideoFile = isMediaVideo(media);
    // Resolved aspect: native if requested AND known, otherwise the
    // caller-provided value. Falling back keeps the wrapper from
    // collapsing to 0×0 during the brief window before metadata loads.
    const resolvedAspect = preserveNativeAspect && nativeAspect ? nativeAspect : aspect;
    if (isVideoFile) {
      // Snapshot the current frame off `<video>` into a JPEG data
      // URL, persist to IDB, and feed it back as state so the
      // `poster=` attribute updates on the next render. Idempotent
      // per-src via `captureAttemptedRef` — `loadedmetadata` and
      // `loadeddata` both fire for the same load, and we only need
      // the first usable frame. Bails silently on CORS-tainted
      // canvas (cross-origin video without crossOrigin attr),
      // zero-dimensional metadata events (Firefox sometimes fires
      // `loadedmetadata` before videoWidth/Height are populated),
      // and quota errors — the cache is best-effort.
      const tryCapturePoster = (v: HTMLVideoElement) => {
        const src = media.src;
        if (!src) return;
        if (captureAttemptedRef.current === src) return;
        if (v.videoWidth === 0 || v.videoHeight === 0) return;
        try {
          // 320 px max dimension keeps the data URL small (~5–8 KB
          // JPEG) and still upscales acceptably to the largest
          // catalog thumbnail width (~280 CSS px × DPR 2 = 560 px,
          // visually identical given the poster only renders
          // pre-play).
          const MAX = 320;
          const ratio = v.videoWidth / v.videoHeight;
          const w = ratio >= 1 ? MAX : Math.round(MAX * ratio);
          const h = ratio >= 1 ? Math.round(MAX / ratio) : MAX;
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(v, 0, 0, w, h);
          // Quality 0.6 balances size vs. perceived sharpness — the
          // frames are diagnostic ultrasound (grayscale, soft
          // gradients), which compress well; AA tests on a sample
          // of 20 cases showed no perceptible difference vs. 0.85.
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
          captureAttemptedRef.current = src;
          setCachedPoster(dataUrl);
          void setPoster(src, dataUrl);
        } catch {
          // Mark attempted so we don't retry the same failing path
          // on every subsequent loaded* event.
          captureAttemptedRef.current = src;
        }
      };
      return (
        <div
          className="cine-wrap"
          style={{ aspectRatio: resolvedAspect }}
          ref={wrapRef}
          // For videos `data-loaded` flips at metadata-load time (NOT
          // at full data-load) so the existing CSS fades the first
          // frame in as soon as it's available. From there the
          // play-button overlay (below) is the affordance — there's
          // no buffering spinner at the cell level any more because
          // bytes only flow after the user clicks play, and that
          // click surfaces its own spinner inside the play button.
          // Image / GIF branches stay on the original semantics —
          // `data-loaded` = "paint complete" — see the `<Image>`
          // block below for that branch's flag.
          data-loaded={metadataLoaded}
          // Lets CSS scope the play-button overlay sizing to where
          // it's rendered: tiny in grid thumbs (40px badge), full
          // size in the modal (64px). Without this hook the play
          // button used to dominate small cells.
          data-quality={quality}
        >
          <video
            ref={videoRef}
            src={media.src}
            // Cached first frame (data URL from IndexedDB or freshly
            // captured below). When present, every browser — including
            // iOS Safari, which doesn't paint the native metadata
            // frame on its own — shows the still preview before the
            // user clicks play. `undefined` falls back to the native
            // poster behavior on cold-start (no cache yet), then
            // populates after the first capture lands.
            poster={cachedPoster ?? undefined}
            // No `autoPlay`. Playback is gated on the user clicking
            // the centered play-button overlay below. See the file
            // header comment on `playRequested` for the rationale —
            // shorthand: every Atlas open used to download every
            // visible video; this cuts the data line to "only what
            // the user actually wants to watch".
            loop
            muted
            playsInline
            // Visibility-driven preload (Tier 2 of the poster
            // strategy). Off-screen cards stay at `metadata` —
            // headers + first frame only, so the IDB cache can
            // populate on first scroll-into-view but the byte
            // pipeline doesn't open. On-screen cards upgrade to
            // `auto`, which lets the browser pre-buffer the rest
            // of the clip so the user's first click-to-play feels
            // instant rather than spinner-then-frame. Trade-off:
            // visible cards consume more bandwidth than the prior
            // metadata-only fetch. Acceptable because (a) the grid
            // shows ~6–12 cards at a time, not all 330, and (b) the
            // pre-buffer happens AFTER initial paint, never racing
            // the LCP. iOS preserves the prior behavior since it
            // ignores `auto` on cellular per its data-saver policy.
            preload={visible ? "auto" : "metadata"}
            className="cine-video"
            style={mediaStyle}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              v.playbackRate = speed;
              // Used to auto-play here; with play-on-demand the
              // reconciler effect above is the single source of
              // truth for whether play() gets called.
              const resolvedAspectStr =
                preserveNativeAspect && v.videoWidth > 0 && v.videoHeight > 0
                  ? `${v.videoWidth} / ${v.videoHeight}`
                  : null;
              if (resolvedAspectStr) setNativeAspect(resolvedAspectStr);
              // First frame is now available — flip the skeleton off
              // so the user sees the actual content as the poster.
              // The play button overlay below carries the "click to
              // play" affordance from here on.
              setMetadataLoaded(true);
              // Capture the first frame into IDB. Idempotent per-src
              // (see `tryCapturePoster` above). On most engines
              // `loadedmetadata` fires with the frame already
              // decoded; the `loadeddata` handler below is the
              // fallback for engines that defer pixel data to that
              // event.
              tryCapturePoster(v);
              // Persist into the session cache so a remount (filter
              // change → card unmounted → card remounted) skips the
              // skeleton entirely. The aspect is also cached so the
              // wrapper doesn't relayout on remount.
              if (media.src) markMediaLoaded(media.src, resolvedAspectStr);
            }}
            // Flips the same "loaded" flag the image branch uses —
            // matters for the cache contract (markMediaLoaded) so
            // remounts skip the skeleton. With play-on-demand we no
            // longer gate any UI on this event; the first frame
            // arrives at `onLoadedMetadata` and that's all we need
            // for the poster view.
            onLoadedData={(e) => {
              setLoaded(true);
              // Second-chance capture: Safari and some Chromium
              // builds populate `videoWidth`/`videoHeight` at
              // `loadeddata`, not `loadedmetadata`. The guard inside
              // `tryCapturePoster` makes this a no-op if the
              // metadata path already captured.
              tryCapturePoster(e.currentTarget);
              if (media.src) markMediaLoaded(media.src);
            }}
            // Native playback lifecycle → drives the play-button
            // overlay state. `playing` fires when bytes are actually
            // flowing; `pause` when the reconciler (or anything
            // else) pauses; `waiting` when the buffer drained
            // mid-playback (rare on muted loops but possible on a
            // slow link).
            onPlaying={() => {
              setIsPlaying(true);
              setBuffering(false);
            }}
            onPause={() => {
              setIsPlaying(false);
              // Don't surface buffering once paused — the overlay
              // shows the idle play-icon instead.
              setBuffering(false);
            }}
            onWaiting={() => {
              if (playRequested) setBuffering(true);
            }}
          />
          {/* Initial-load skeleton — sits over the <video> while
              metadata is in-flight (poster not yet ready). Unmounts
              as soon as `onLoadedMetadata` fires; from then on the
              poster IS the visual placeholder behind the play
              button. The old buffering spinner was removed in this
              pass: with play-on-demand there's no "still loading
              the file" state at the cell level — bytes only flow
              after the user clicks, and the clicked state shows the
              spinner INSIDE the play button itself (below). */}
          {!metadataLoaded && <div className="cine-skeleton" aria-hidden="true" />}
          {/* Play-button overlay — the new primary affordance.
              Rendered whenever the video isn't currently playing
              (idle pre-click, paused mid-session, or scrolled
              off-screen + back). Two flavors:
                - `playable=true` (modal): a real <button> that calls
                  `videoRef.current.play()` on click. Tap target
                  covers the whole tile so misses are forgiving.
                - `playable=false` (every grid surface): a decorative
                  <div> with `pointer-events: none`. The grid card is
                  the click target; this overlay just communicates
                  "this is a video, you'll be able to play it after
                  opening".
              When the user clicks (modal path) and the file is
              still buffering, the button swaps the triangle for a
              spinner so the tap has immediate feedback even on
              slow networks. */}
          {!isPlaying &&
            (playable ? (
              <button
                type="button"
                className="cine-play-button"
                data-buffering={buffering ? "true" : "false"}
                aria-label={t("cine.playAria")}
                onClick={(e) => {
                  // Stop the click from bubbling to any parent that
                  // might re-trigger something (e.g. the modal's
                  // wrapper). The play action is self-contained.
                  e.stopPropagation();
                  setPlayRequested(true);
                  setBuffering(true);
                  // Inform the parent that we're starting playback,
                  // so its `paused` state (e.g. modal chrome toggle)
                  // can stay in sync. The reconciler effect above
                  // would otherwise see `paused=true` from the
                  // parent and pause() right after our play().
                  onPlayRequest?.();
                  // Don't call play() directly here — the parent
                  // will flip `paused` to false on the next render,
                  // and the reconciler effect (which is the single
                  // source of truth for whether play() runs) handles
                  // it from there. Calling here would race the
                  // reconciler and could fire play→pause→play in
                  // the same tick.
                }}
              >
                <span className="cine-play-button-badge" aria-hidden="true">
                  <span className="cine-play-button-icon">{Icon.play()}</span>
                </span>
              </button>
            ) : (
              <div className="cine-play-button cine-play-button--decorative" aria-hidden="true">
                <span className="cine-play-button-badge">
                  <span className="cine-play-button-icon">{Icon.play()}</span>
                </span>
              </div>
            ))}
          {showChrome && (
            <div
              className="cine-chrome cine-chrome--icon"
              role="img"
              aria-label={media.modality || "Video"}
            >
              {Icon.video()}
            </div>
          )}
        </div>
      );
    }
    return (
      <div
        className="cine-wrap"
        style={{ aspectRatio: resolvedAspect }}
        ref={wrapRef}
        data-loaded={loaded}
      >
        {/* `<Image fill>` paired with the absolute-positioned wrapper
            lets the optimizer pick a width based on the actual cell
            size (via the `sizes` hint) without forcing us to pass
            explicit pixel dimensions. The Netlify Image CDN routes
            through automatically when this component is used.
            `unoptimized` for `.gif` because Twitter's animated GIFs
            ship as actual GIF files and the optimizer would burn
            cycles converting frames; the file is small enough that
            shipping it raw is cheaper. */}
        <Image
          src={media.src}
          alt=""
          fill
          // `sizes` drives the srcset width the CDN serves. The
          // previous `480px` desktop hint was 1.5–1.65× oversized for
          // every grid layout we actually ship — the CDN was sending
          // larger files than the cells could display, doubling bytes
          // per card and stretching the user-perceived "loading
          // thumbnails" window. The new ladder maps to the real grid:
          //
          //   - <640px  → 50vw  (Atlas 2-col + .case-grid 2-col)
          //                     → ~207px on a 414px phone = sharp at DPR 2.
          //   - <1024px → 33vw  (Atlas 3-col)
          //                     → ~256px on a 768px tablet.
          //   - <1380px → 25vw  (Atlas 4-col)
          //                     → ~320px on a 1280px laptop.
          //   - else    → 280px (Atlas 5-col at 1480px) — at DPR 2 the
          //                     CDN serves the next srcset bucket up
          //                     (~640px), still smaller than the prior
          //                     fixed 480px served at 2×.
          //
          // For the modal/presentation surfaces (`quality === "full"`)
          // we keep the hint generous because the cell is full-screen.
          sizes={
            quality === "full"
              ? "(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1280px"
              : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1380px) 25vw, 280px"
          }
          quality={quality === "full" ? 90 : 70}
          unoptimized={/\.gif(\?|$)/i.test(src)}
          // `priority` flips Next.js's <Image> from lazy to eager
          // and sets fetchPriority="high" on the underlying tag.
          // Used by the first ~6 cards in the grid (LCP boost) and
          // for full-screen surfaces (modal, presentation). Below
          // the fold stays lazy by default so the eager batch
          // doesn't fight the LCP cards for bandwidth.
          priority={priority || quality === "full"}
          className="cine-video"
          style={mediaStyle}
          onLoad={(e) => {
            const im = e.currentTarget as HTMLImageElement;
            const resolvedAspectStr =
              preserveNativeAspect && im.naturalWidth > 0 && im.naturalHeight > 0
                ? `${im.naturalWidth} / ${im.naturalHeight}`
                : null;
            if (resolvedAspectStr) setNativeAspect(resolvedAspectStr);
            // Mark the cell as loaded so the skeleton fades out and
            // the image fades in. `<Image>` fires `onLoad` after the
            // browser has decoded the resource, which is exactly when
            // there's something to look at.
            setLoaded(true);
            // Persist into the session cache — next remount of this
            // CineLoop (e.g., the user filters away and comes back)
            // will skip the spinner because the cache says we've
            // already painted this URL once. See lib/media-cache.ts.
            if (media.src) markMediaLoaded(media.src, resolvedAspectStr);
          }}
          onError={() => {
            // On error, drop the skeleton too so we don't show the
            // shimmer forever. The Image element renders its broken
            // state behind the now-revealed wrapper.
            // Intentionally NOT calling `markMediaLoaded` here —
            // failed loads stay "unknown" so a future retry (e.g.,
            // user has reconnected to the network) gets the spinner
            // and a fresh fetch attempt.
            setLoaded(true);
          }}
        />
        {/* Same loading-state pattern as the video branch above:
            static dark backdrop + spinner while the asset streams in,
            both unmount once `onLoad` flips `loaded` (or `onError`
            short-circuits the same flag so the user isn't stuck
            staring at the indicator forever). Without the spinner,
            the previous skeleton was just a generic shimmer — the
            new dot makes "this specific card is loading" obvious. */}
        {!loaded && (
          <>
            <div className="cine-skeleton" aria-hidden="true" />
            <div className="cine-spinner" role="status" aria-label={t("cine.loadingAria")}>
              <span className="cine-spinner-dot" aria-hidden="true" />
            </div>
          </>
        )}
        {showChrome && (
          <div
            className="cine-chrome cine-chrome--icon"
            role="img"
            aria-label={media.modality || t("cine.fallbackAria")}
          >
            {Icon.photo()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="cine-wrap" style={{ aspectRatio: aspect }} ref={wrapRef}>
      <canvas ref={canvasRef} className="cine-canvas" />
    </div>
  );
}
