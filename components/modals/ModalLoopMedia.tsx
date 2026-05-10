"use client";

import { useEffect, useRef, useState } from "react";

import { CineLoop } from "../cine";
import { Icon } from "@/lib/icons";
import type { CaseRecord, Media } from "@/lib/types";

/**
 * Modal media surface — extracted out of `CaseModal.tsx` so the modal
 * shell stays focused on layout / shortcuts / actions and the
 * carousel concern lives in one place.
 *
 * Two render paths:
 *
 *   - 0 or 1 item: a single `<CineLoop>` filling the loop pane, the
 *     same single-image render the modal had before multi-media
 *     support landed. Empty `mediaList` falls through to the
 *     synthetic cine-loop via the `caso.media` fallback.
 *   - 2+ items: a horizontal scroll-snap carousel with one CineLoop
 *     per slide, prev/next chevrons, and dot indicators below. Touch
 *     swipe, mouse drag, and arrow keys (when the track has focus)
 *     all work natively via scroll-snap; we only track the active
 *     index so the dots and the surrounding play/pause/speed
 *     controls drive the right slide.
 *
 * The carousel pauses every off-screen slide (`paused || i !== active`)
 * so a 4-image case isn't running 4 video decoders at once. Only the
 * visible one plays.
 */
export interface ModalLoopMediaProps {
  /** The whole case — needed for the synthetic-loop kind fallback. */
  caso: CaseRecord;
  /** Resolved media list from `getCaseMedia(caso)`. May be empty. */
  mediaList: Media[];
  /** Playback speed driven by the modal's controls. */
  speed: number;
  /** Pause state driven by the modal's play/pause toggle. */
  paused: boolean;
}

export default function ModalLoopMedia({ caso, mediaList, speed, paused }: ModalLoopMediaProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  const isMulti = mediaList.length > 1;

  // Track active slide via scroll position. Cheaper than IntersectionObserver
  // for a small slide count, and works during smooth-scroll animations
  // where the IO callback fires only at threshold crossings.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !isMulti) return;
    const onScroll = () => {
      const w = track.clientWidth;
      if (w === 0) return;
      const i = Math.round(track.scrollLeft / w);
      setActive(Math.max(0, Math.min(mediaList.length - 1, i)));
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, [isMulti, mediaList.length]);

  const goTo = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
  };

  // Single-item path — render exactly what the modal used to render
  // before multi-media support, so the visual is byte-for-byte
  // unchanged for the 326 imported cases that have one media or none.
  if (!isMulti) {
    return (
      <CineLoop
        kind={caso.loop}
        aspect="1/1"
        speed={speed}
        paused={paused}
        showChrome={true}
        media={mediaList[0] ?? caso.media}
        quality="full"
        preserveNativeAspect={true}
      />
    );
  }

  return (
    <div className="modal-loop-carousel" role="region" aria-label="Galería del caso">
      <div className="modal-loop-track" ref={trackRef}>
        {mediaList.map((m, i) => (
          <div
            className="modal-loop-slide"
            key={m.src}
            aria-roledescription="slide"
            aria-label={`Imagen ${i + 1} de ${mediaList.length}`}
          >
            <CineLoop
              kind={caso.loop}
              aspect="1/1"
              speed={speed}
              paused={paused || i !== active}
              showChrome={true}
              media={m}
              quality="full"
              preserveNativeAspect={true}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="modal-loop-nav modal-loop-nav--prev"
        onClick={() => goTo(Math.max(0, active - 1))}
        disabled={active === 0}
        aria-label="Imagen anterior"
      >
        {Icon.arrowLeft()}
      </button>
      <button
        type="button"
        className="modal-loop-nav modal-loop-nav--next"
        onClick={() => goTo(Math.min(mediaList.length - 1, active + 1))}
        disabled={active === mediaList.length - 1}
        aria-label="Imagen siguiente"
      >
        {Icon.arrowRight()}
      </button>
      <div className="modal-loop-dots" role="tablist" aria-label="Seleccionar imagen del caso">
        {mediaList.map((m, i) => (
          <button
            key={m.src}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Ir a imagen ${i + 1}`}
            className={`modal-loop-dot${i === active ? " active" : ""}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  );
}
