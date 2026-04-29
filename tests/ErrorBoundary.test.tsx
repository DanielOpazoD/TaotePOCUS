import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ErrorBoundary from "@/components/ErrorBoundary";

// Mock the central log so we can verify boundaries forward errors
// without polluting test output. The real `log` module touches Sentry
// loading async — we don't want any of that here.
vi.mock("@/lib/log", () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { log } from "@/lib/log";

function Boom({ message = "kaboom" }: { message?: string }): never {
  throw new Error(message);
}
function Ok() {
  return <div data-testid="ok">ok</div>;
}

describe("ErrorBoundary", () => {
  // React logs errors to console.error during error-boundary tests;
  // silencing keeps the suite output readable. We don't assert on the
  // console output — just on what the boundary itself does.
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary name="test">
        <Ok />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("ok").textContent).toBe("ok");
  });

  it("renders the default fallback when a descendant throws", () => {
    render(
      <ErrorBoundary name="grid">
        <Boom message="bad render" />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    // The fallback exposes the error message in <details>.
    expect(screen.getByText(/bad render/i)).toBeTruthy();
  });

  it("forwards the error to lib/log with the boundary name as area", () => {
    render(
      <ErrorBoundary name="modal">
        <Boom message="dialog crashed" />
      </ErrorBoundary>,
    );
    expect(log.error).toHaveBeenCalled();
    const call = (log.error as ReturnType<typeof vi.fn>).mock.calls[0];
    // log.error(message, ctx, err) — ctx.area should match the name.
    expect(call?.[1]).toMatchObject({ area: "boundary:modal" });
    expect(call?.[2]).toBeInstanceOf(Error);
  });

  it("recovers when the user clicks Reintentar and the next render succeeds", () => {
    let shouldThrow = true;
    function Conditional(): React.ReactElement {
      if (shouldThrow) throw new Error("transient");
      return <div data-testid="recovered">recovered</div>;
    }
    render(
      <ErrorBoundary name="grid">
        <Conditional />
      </ErrorBoundary>,
    );
    expect(screen.queryByTestId("recovered")).toBeNull();
    // Flip the flag so the next render succeeds.
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(screen.getByTestId("recovered").textContent).toBe("recovered");
  });

  it("uses a custom fallback when one is supplied", () => {
    render(
      <ErrorBoundary
        name="modal"
        fallback={(error, reset) => (
          <div>
            <span data-testid="custom-msg">Custom: {error.message}</span>
            <button onClick={reset}>Custom retry</button>
          </div>
        )}
      >
        <Boom message="oops" />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("custom-msg").textContent).toBe("Custom: oops");
    expect(screen.getByRole("button", { name: "Custom retry" })).toBeTruthy();
  });

  it("does not show the modal-floating fallback on a generic boundary", () => {
    // The floating variant is opt-in via the parent's custom fallback;
    // the default fallback renders inline.
    const { container } = render(
      <ErrorBoundary name="grid">
        <Boom />
      </ErrorBoundary>,
    );
    expect(container.querySelector(".boundary-fallback--floating")).toBeNull();
    expect(container.querySelector(".boundary-fallback")).toBeTruthy();
  });
});
