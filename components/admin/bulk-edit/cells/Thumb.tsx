"use client";

// Thumbnail cell for `BulkEditTable`. Three render states:
//
//   - image present + load OK → 40×40 cropped image via next/image.
//   - video present + load OK → 40×40 muted video via the native
//     element (next/image can't decode video).
//   - load failure / no media → ◎ placeholder.
//
// Renderer dispatch follows the actual file extension, not the
// declared `media.kind`: the imported corpus marks Twitter
// "animated_gif" cases with `kind: "image"` while the underlying
// file is `.mp4`. Same behaviour as `<CineLoop>` in the catalog
// grid; symmetric helps both surfaces fail or recover identically.
//
// `onError` flips a local state so a broken asset doesn't keep
// retrying. Without this fallback `<Image>` and `<video>` render
// an empty box on failure — visually invisible and confusing.
//
// When `onOpen` is provided the wrapper becomes a clickable button
// that opens the full edit modal (the same callback the row's ⋮
// "Abrir modal completo" uses). Hover shows a subtle ring.

import Image from "next/image";
import { useState } from "react";
import type { CaseRecord } from "@/lib/types";

interface Props {
  caso: CaseRecord;
  /** When provided, the thumbnail becomes a clickable button that
   *  opens the full edit flow. Without it the thumb renders as a
   *  static <span>. */
  onOpen?: () => void;
}

export function BulkEditThumb({ caso, onOpen }: Props) {
  const [errored, setErrored] = useState(false);

  const inner = (() => {
    if (errored || !caso.media) {
      return (
        <span className="bulk-edit-thumb-placeholder" aria-hidden="true">
          ◎
        </span>
      );
    }
    const src = caso.media.src;
    const isVideoFile = caso.media.kind === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src);
    if (isVideoFile) {
      return (
        <video
          src={src}
          muted
          playsInline
          preload="metadata"
          className="bulk-edit-thumb-media"
          onError={() => setErrored(true)}
        />
      );
    }
    return (
      <Image
        src={src}
        alt=""
        width={40}
        height={40}
        // Animated GIFs trip the Next.js optimizer at tiny sizes.
        unoptimized={/\.gif(\?|$)/i.test(src)}
        className="bulk-edit-thumb-media"
        onError={() => setErrored(true)}
      />
    );
  })();

  if (!onOpen) return inner;
  return (
    <button
      type="button"
      className="bulk-edit-thumb-btn"
      onClick={onOpen}
      aria-label={`Abrir edición completa de ${caso.title}`}
    >
      {inner}
    </button>
  );
}
