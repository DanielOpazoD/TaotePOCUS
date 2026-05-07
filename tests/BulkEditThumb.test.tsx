import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { BulkEditThumb } from "@/components/admin/bulk-edit/cells/Thumb";
import { caseFactory } from "./fixtures";

// `next/image` ships an optimizer pipeline that emits a noisy srcset.
// The thumb dispatch logic is what we're testing here, not the image
// chrome — replace with a plain img stub that forwards onError so the
// fallback path is still exercised.
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { src, onError } = props as {
      src: string;
      onError?: React.ReactEventHandler<HTMLImageElement>;
    };
    return <img src={src} alt="" onError={onError} />;
  },
}));

describe("BulkEditThumb", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders the placeholder when there is no media", () => {
    const c = caseFactory({ media: undefined });
    const { container } = render(<BulkEditThumb caso={c} />);
    expect(container.querySelector(".bulk-edit-thumb-placeholder")).not.toBeNull();
  });

  it("renders an <img> for image media", () => {
    const c = caseFactory({
      media: { kind: "image", src: "https://example.test/photo.png" },
    });
    const { container } = render(<BulkEditThumb caso={c} />);
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("renders a <video> for video media", () => {
    const c = caseFactory({
      media: { kind: "video", src: "https://example.test/clip.mp4" },
    });
    const { container } = render(<BulkEditThumb caso={c} />);
    expect(container.querySelector("video")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("dispatches by file extension when kind is wrong (image kind, .mp4 src)", () => {
    // Imported Twitter "animated_gif" cases come through as kind="image"
    // with .mp4 src. The renderer should follow the extension.
    const c = caseFactory({
      media: { kind: "image", src: "https://example.test/clip.mp4" },
    });
    const { container } = render(<BulkEditThumb caso={c} />);
    expect(container.querySelector("video")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to placeholder after onError on image", () => {
    const c = caseFactory({
      media: { kind: "image", src: "https://example.test/photo.png" },
    });
    const { container } = render(<BulkEditThumb caso={c} />);
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    expect(container.querySelector(".bulk-edit-thumb-placeholder")).not.toBeNull();
  });

  it("falls back to placeholder after onError on video", () => {
    const c = caseFactory({
      media: { kind: "video", src: "https://example.test/clip.mp4" },
    });
    const { container } = render(<BulkEditThumb caso={c} />);
    const video = container.querySelector("video")!;
    fireEvent.error(video);
    expect(container.querySelector(".bulk-edit-thumb-placeholder")).not.toBeNull();
  });

  it("renders as a static span when onOpen is not provided", () => {
    const c = caseFactory({ media: undefined });
    const { container } = render(<BulkEditThumb caso={c} />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders as a button when onOpen is provided", () => {
    const c = caseFactory({ media: undefined, title: "Foo" });
    render(<BulkEditThumb caso={c} onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Abrir edición completa de Foo/ })).toBeTruthy();
  });

  it("calls onOpen when the button is clicked", () => {
    const onOpen = vi.fn();
    const c = caseFactory({ media: undefined, title: "Foo" });
    render(<BulkEditThumb caso={c} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
