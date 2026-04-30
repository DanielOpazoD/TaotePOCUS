"use client";

import { useEffect, useRef, useState } from "react";
import type { Media } from "@/lib/types";
import { drawScene, drawChrome } from "./cineScenes";

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
}: Props) {
  // Resolve focus values once. Defaults match the no-override case
  // (centered, no zoom), so passing focus={undefined} is identical to
  // not passing it.
  const focusX = focus?.x ?? 50;
  const focusY = focus?.y ?? 50;
  const focusScale = focus?.scale ?? 1;
  // Style applied inline to <video>/<img>. Object-position handles the
  // pan; the transform scales the element relative to its center,
  // which over an `object-fit: cover` parent acts like a zoom in/out
  // without resizing the wrapper. We omit the transform when scale
  // is 1 to avoid creating a useless compositing layer.
  const mediaStyle: React.CSSProperties = {
    objectPosition: `${focusX}% ${focusY}%`,
    ...(focusScale !== 1 ? { transform: `scale(${focusScale})` } : {}),
  };
  // Native aspect ratio of the loaded media, captured after the video
  // emits `loadedmetadata` or the image emits `load`. Stays null until
  // the browser decodes the file — until then we render with the
  // caller-provided `aspect` so the wrapper has stable dimensions.
  const [nativeAspect, setNativeAspect] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(typeof performance !== "undefined" ? performance.now() : 0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Track whether the loop is in (or near) the viewport. When off-screen
  // we stop the RAF entirely — no more 15+ animation frames competing for
  // the main thread on the home grid (audit §9).
  const [visible, setVisible] = useState(true);
  // Respect prefers-reduced-motion: render a single static frame instead
  // of looping. Vestibular accessibility.
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setVisible(entry.isIntersecting);
      },
      { rootMargin: "200px" }, // start drawing slightly before scroll-in
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
      if (paused || !visible) videoRef.current.pause();
      else videoRef.current.play().catch(() => {});
    }
  }, [paused, speed, media, visible]);

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
      if (paused || !visible) {
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
      drawScene(ctx, W, H, t, kind, { refreshSpeckle });
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
  }, [kind, speed, paused, showChrome, media, visible, quality, reducedMotion]);

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
        <div className="cine-wrap" style={{ aspectRatio: resolvedAspect }} ref={wrapRef}>
          <video
            ref={videoRef}
            src={media.src}
            autoPlay
            loop
            muted
            playsInline
            className="cine-video"
            style={mediaStyle}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              v.playbackRate = speed;
              if (paused) v.pause();
              else v.play().catch(() => {});
              if (preserveNativeAspect && v.videoWidth > 0 && v.videoHeight > 0) {
                setNativeAspect(`${v.videoWidth} / ${v.videoHeight}`);
              }
            }}
          />
          {showChrome && <div className="cine-chrome">POCUS · {media.modality || "REAL"}</div>}
        </div>
      );
    }
    return (
      <div className="cine-wrap" style={{ aspectRatio: resolvedAspect }} ref={wrapRef}>
        <img
          src={media.src}
          className="cine-video"
          style={mediaStyle}
          alt=""
          onLoad={(e) => {
            const im = e.currentTarget;
            if (preserveNativeAspect && im.naturalWidth > 0 && im.naturalHeight > 0) {
              setNativeAspect(`${im.naturalWidth} / ${im.naturalHeight}`);
            }
          }}
        />
        {showChrome && <div className="cine-chrome">POCUS · {media.modality || "STILL"}</div>}
      </div>
    );
  }

  return (
    <div className="cine-wrap" style={{ aspectRatio: aspect }} ref={wrapRef}>
      <canvas ref={canvasRef} className="cine-canvas" />
    </div>
  );
}
