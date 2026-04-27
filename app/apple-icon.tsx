import { ImageResponse } from "next/og";

// iOS / iPadOS look for /apple-icon.png at the root. We generate a 180×180
// PNG dynamically from JSX so the asset stays in lockstep with the brand
// mark in the header — no separate design file to maintain.

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
      <div
        style={{
          width: 130,
          height: 130,
          borderRadius: "50%",
          border: "8px solid #15171a",
          background: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: "50%",
            background: "#15171a",
          }}
        />
      </div>
    </div>,
    { ...size },
  );
}
