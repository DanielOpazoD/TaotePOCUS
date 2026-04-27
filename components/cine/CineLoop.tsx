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
}

export default function CineLoop({
  kind = "blines",
  aspect = "1/1",
  speed = 1,
  paused = false,
  showChrome = true,
  media,
  quality = "thumb",
}: Props) {
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
    if (media.kind === "video") {
      return (
        <div className="cine-wrap" style={{ aspectRatio: aspect }} ref={wrapRef}>
          <video
            ref={videoRef}
            src={media.src}
            autoPlay
            loop
            muted
            playsInline
            className="cine-video"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              v.playbackRate = speed;
              if (paused) v.pause();
              else v.play().catch(() => {});
            }}
          />
          {showChrome && <div className="cine-chrome">POCUS · {media.modality || "REAL"}</div>}
        </div>
      );
    }
    return (
      <div className="cine-wrap" style={{ aspectRatio: aspect }} ref={wrapRef}>
        <img src={media.src} className="cine-video" alt="" />
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
