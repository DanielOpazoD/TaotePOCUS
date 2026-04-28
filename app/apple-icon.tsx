import { ImageResponse } from "next/og";

// iOS / iPadOS look for /apple-icon.png at the root. We generate a 180×180
// PNG dynamically from JSX so the asset stays in lockstep with the brand
// mark in the header — no separate design file to maintain.
//
// next/og's renderer doesn't support SVG <path> directly, so we emulate
// the sine-wave-in-ring brand mark with stacked divs and rounded
// rectangles (an SVG approximation good enough for the small asset size).

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fafaf7",
      }}
    >
      <svg width="140" height="140" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <circle
          cx="16"
          cy="16"
          r="13"
          fill="none"
          stroke="#15171a"
          strokeWidth="1.4"
          opacity="0.35"
        />
        <path
          d="M4 16 Q 8 8, 13 16 T 22 16 T 28 16"
          fill="none"
          stroke="#15171a"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>,
    { ...size },
  );
}
