import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import MobileDrawer from "@/components/chrome/MobileDrawer";
import { renderWithLanguage as render } from "./test-utils";
import type { User, View } from "@/lib/types";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("../components/chrome/ThemeToggle", () => ({
  __esModule: true,
  default: () => <button aria-label="theme">theme</button>,
}));

const view: View = { kind: "section", section: "atlas" };

const baseProps = {
  open: true,
  onClose: vi.fn(),
  view,
  user: null,
  onLogin: vi.fn(),
  onLogout: vi.fn(),
  favCount: 0,
  onNewCase: vi.fn(),
};

describe("MobileDrawer", () => {
  it("does not render when closed", () => {
    const { container } = render(<MobileDrawer {...baseProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the four section links and Favoritos", () => {
    render(<MobileDrawer {...baseProps} />);
    expect(screen.getByRole("link", { name: "Atlas POCUS" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "ECG" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Casos clínicos" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Infografías" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Favoritos/ })).toBeTruthy();
  });

  it("hides the admin link for anonymous users", () => {
    render(<MobileDrawer {...baseProps} />);
    expect(screen.queryByRole("link", { name: "Administrar" })).toBeNull();
  });

  it("shows admin link + 'Nuevo caso' button when admin is signed in", () => {
    const admin: User = {
      email: "admin@taote.pocus",
      name: "Administrador",
      initials: "AD",
      role: "admin",
      issuedAt: 0,
      expiresAt: Date.now() + 1000,
    };
    render(<MobileDrawer {...baseProps} user={admin} />);
    expect(screen.getByRole("link", { name: "Administrar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Nuevo caso/ })).toBeTruthy();
    expect(screen.getByText("Administrador")).toBeTruthy();
  });

  it("invokes onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<MobileDrawer {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar menú" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes onClose on Escape", () => {
    const onClose = vi.fn();
    render(<MobileDrawer {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes onLogin and closes when 'Entrar' is clicked", () => {
    const onLogin = vi.fn();
    const onClose = vi.fn();
    render(<MobileDrawer {...baseProps} onLogin={onLogin} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Entrar/ }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("displays the favorite count badge", () => {
    render(<MobileDrawer {...baseProps} favCount={5} />);
    const link = screen.getByRole("link", { name: /Favoritos/ });
    expect(link.textContent).toContain("5");
  });

  it("marks the active section with aria-current", () => {
    render(<MobileDrawer {...baseProps} view={{ kind: "section", section: "ecg" }} />);
    const ecg = screen.getByRole("link", { name: "ECG" });
    expect(ecg.getAttribute("aria-current")).toBe("page");
  });
});
