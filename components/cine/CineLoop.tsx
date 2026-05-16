"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { useT } from "@/hooks/useLanguage";
import type { Media } from "@/lib/types";
import { drawScene, drawChrome, type SceneLabels } from "./cineScenes";

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
}: Props) {
  const t = useT();
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
  // Native aspect ratio of the loaded media, captured after the video
  // emits `loadedmetadata` or the image emits `load`. Stays null until
  // the browser decodes the file — until then we render with the
  // caller-provided `aspect` so the wrapper has stable dimensions.
  const [nativeAspect, setNativeAspect] = useState<string | null>(null);
  // Loading state for the image/video paths. The wrapper carries
  // `data-loaded="false"` until the asset paints, which CSS uses to
  // show a shimmer skeleton + fade the asset in. Without this, a
  // category click switches the DOM instantly but the user sees
  // empty cells (transparent <Image> / blank <video>) for the
  // duration of the CDN fetch — reads as "the page is frozen".
  // Synthetic-canvas loops skip this entirely (RAF paints the first
  // frame on the next tick, so there's no perceptible blank window).
  const [loaded, setLoaded] = useState(false);
  // Two-stage video loading: `metadataLoaded` flips when the browser
  // has the first frame painted (cheap, via `preload="metadata"`);
  // `loaded` flips when there's enough buffer to start playing. The
  // gap between the two is where we replace the shimmer skeleton
  // with a spinner overlay on top of the visible first frame — so
  // the reader sees a real preview of the case content + a clear
  // "still loading" cue, instead of a generic gray block.
  const [metadataLoaded, setMetadataLoaded] = useState(false);
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
  useEffect(() => {
    setLoaded(false);
  }, [media?.src]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      if (paused || !visible || !tabVisible) videoRef.current.pause();
      else videoRef.current.play().catch(() => {});
    }
  }, [paused, speed, media, visible, tabVisible]);

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
    // (browsers can't paint mp4 inside <img>). Treat anything that
    // ends in .mp4 / .webm / .mov as video; .gif as gif inside <img>;
    // everything else as static image.
    const src = media.src || "";
    const isVideoFile = media.kind === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src);
    // Resolved aspect: native if requested AND known, otherwise the
    // caller-provided value. Falling back keeps the wrapper from
    // collapsing to 0×0 during the brief window before metadata loads.
    const resolvedAspect = preserveNativeAspect && nativeAspect ? nativeAspect : aspect;
    if (isVideoFile) {
      return (
        <div
          className="cine-wrap"
          style={{ aspectRatio: resolvedAspect }}
          ref={wrapRef}
          // For videos `data-loaded` flips at metadata-load time (NOT
          // at full data-load) so the existing CSS fades the first
          // frame in as soon as it's available. The spinner overlay
          // below carries the "still buffering" cue from there until
          // the data buffer is ready. Image / GIF branches stay on
          // the original semantics — `data-loaded` = "paint complete"
          // — see the `<Image>` block below for that branch's flag.
          data-loaded={metadataLoaded}
        >
          <video
            ref={videoRef}
            src={media.src}
            autoPlay
            loop
            muted
            playsInline
            // `preload="metadata"` is the single biggest perf win on
            // the catalog grid. Default `auto` makes the browser
            // download the full file as soon as the element mounts —
            // with ~15 visible cards × an N-MB clip each, the network
            // saturates and playback stutters across the page.
            // `metadata` fetches just the headers + first frame, so
            // every card paints a still preview cheaply and the byte
            // pipeline only opens for the cards that actually start
            // playing (gated by IntersectionObserver above).
            preload="metadata"
            className="cine-video"
            style={mediaStyle}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              v.playbackRate = speed;
              // Only start playing if the card is in view AND the tab
              // is visible. Without these guards the metadata-load
              // event would force a play even on cards 10 rows below
              // the fold, defeating the point of `preload="metadata"`.
              if (paused || !visible || !tabVisible) v.pause();
              else v.play().catch(() => {});
              if (preserveNativeAspect && v.videoWidth > 0 && v.videoHeight > 0) {
                setNativeAspect(`${v.videoWidth} / ${v.videoHeight}`);
              }
              // First frame is now available — flip the skeleton off
              // so the user sees what the case content actually looks
              // like, and let the spinner overlay below carry the
              // "still loading" signal until `onLoadedData` fires.
              setMetadataLoaded(true);
            }}
            // First frame painted AND enough buffer to start playing.
            // `loadeddata` fires earlier than `canplay` and matches
            // when there's actually a picture to show. Flips `loaded`
            // which removes the spinner overlay entirely.
            onLoadedData={() => setLoaded(true)}
          />
          {/* Three-stage overlay:
              1. Skeleton — shown while metadata hasn't loaded (no
                 first frame yet, the <video> is a black rectangle).
              2. Spinner — shown after metadata loads but before the
                 buffer is ready. The video's first frame is visible
                 underneath; the spinner sits on top so the reader
                 sees real preview content plus a clear "loading"
                 cue, which is what they asked for.
              3. Nothing — once `loaded` flips, both overlays unmount
                 and the video plays unobstructed. */}
          {!metadataLoaded && <div className="cine-skeleton" aria-hidden="true" />}
          {metadataLoaded && !loaded && (
            <div className="cine-spinner" role="status" aria-label={t("cine.loadingAria")}>
              <span className="cine-spinner-dot" aria-hidden="true" />
            </div>
          )}
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
            if (preserveNativeAspect && im.naturalWidth > 0 && im.naturalHeight > 0) {
              setNativeAspect(`${im.naturalWidth} / ${im.naturalHeight}`);
            }
            // Mark the cell as loaded so the skeleton fades out and
            // the image fades in. `<Image>` fires `onLoad` after the
            // browser has decoded the resource, which is exactly when
            // there's something to look at.
            setLoaded(true);
          }}
          onError={() => {
            // On error, drop the skeleton too so we don't show the
            // shimmer forever. The Image element renders its broken
            // state behind the now-revealed wrapper.
            setLoaded(true);
          }}
        />
        {!loaded && <div className="cine-skeleton" aria-hidden="true" />}
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
