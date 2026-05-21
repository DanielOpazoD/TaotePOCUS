import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import Header from "@/components/chrome/Header";
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
  user: null,
  onLogin: vi.fn(),
  onLogout: vi.fn(),
  query: "",
  setQuery: vi.fn(),
  view,
  favCount: 0,
  onNewCase: vi.fn(),
  onOpenDrawer: vi.fn(),
};

describe("Header", () => {
  it("shows the brand and the four section links", () => {
    render(<Header {...baseProps} />);
    // Brand is "Taote POCUS" split across <span> + <em> for typography.
    // Match by the outer link's accessible name.
    expect(screen.getByRole("link", { name: /Taote POCUS/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Atlas POCUS" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "ECG" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Casos clínicos" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Infografías" })).toBeTruthy();
  });

  it("marks the active section with aria-current=page", () => {
    render(<Header {...baseProps} view={{ kind: "section", section: "ecg" }} />);
    const ecg = screen.getByRole("link", { name: "ECG" });
    expect(ecg.getAttribute("aria-current")).toBe("page");
    const atlas = screen.getByRole("link", { name: "Atlas POCUS" });
    expect(atlas.getAttribute("aria-current")).toBeNull();
  });

  it("hides admin chrome (avatar menu trigger + Nuevo caso) for anonymous users", () => {
    render(<Header {...baseProps} />);
    // Avatar-anchored UserMenu is rendered only when there's a user;
    // anonymous gets the "Entrar" affordance instead.
    expect(screen.queryByRole("button", { name: /menú de la cuenta/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Nuevo caso/ })).toBeNull();
  });

  it("shows the avatar UserMenu trigger + Nuevo caso when user is admin", () => {
    const admin: User = {
      email: "admin@taote.pocus",
      name: "Administrador",
      initials: "AD",
      role: "admin",
      issuedAt: 0,
      expiresAt: Date.now() + 1000,
    };
    render(<Header {...baseProps} user={admin} />);
    // The header chrome cleanup (May-2026) removed the standalone
    // "Administrar" link in the section nav, the "ADMIN" pill, and
    // the standalone "Salir" button. Admin-scoped actions now live
    // INSIDE the avatar UserMenu — closed by default.
    expect(screen.queryByRole("link", { name: "Administrar" })).toBeNull();
    expect(screen.queryByText("ADMIN")).toBeNull();
    // What stays visible at rest: the avatar trigger + Nuevo caso.
    expect(screen.getByRole("button", { name: /menú de la cuenta/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Nuevo caso/ })).toBeTruthy();
  });

  it("opens the user menu on avatar click and reveals admin + logout rows", () => {
    const admin: User = {
      email: "admin@taote.pocus",
      name: "Administrador",
      initials: "AD",
      role: "admin",
      issuedAt: 0,
      expiresAt: Date.now() + 1000,
    };
    const onLogout = vi.fn();
    render(<Header {...baseProps} user={admin} onLogout={onLogout} />);
    // Click the avatar — opens the dropdown.
    fireEvent.click(screen.getByRole("button", { name: /menú de la cuenta/i }));
    // Administrar link is admin-only and now lives inside the menu.
    expect(screen.getByRole("menuitem", { name: /Administrar/ })).toBeTruthy();
    // Salir row inside the menu calls onLogout.
    const logout = screen.getByRole("menuitem", { name: /Salir/ });
    fireEvent.click(logout);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("user menu omits Administrar row for non-admin users", () => {
    const user: User = {
      email: "user@taote.pocus",
      name: "Usuaria",
      initials: "U",
      role: "user",
      issuedAt: 0,
      expiresAt: Date.now() + 1000,
    };
    render(<Header {...baseProps} user={user} />);
    fireEvent.click(screen.getByRole("button", { name: /menú de la cuenta/i }));
    expect(screen.queryByRole("menuitem", { name: /Administrar/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Salir/ })).toBeTruthy();
  });

  it("shows the favorite count badge when favCount > 0", () => {
    render(<Header {...baseProps} favCount={3} />);
    const link = screen.getByRole("link", { name: /Favoritos/ });
    expect(link.textContent).toContain("3");
  });

  it("invokes onLogin when Entrar is clicked (anonymous user)", () => {
    const onLogin = vi.fn();
    render(<Header {...baseProps} onLogin={onLogin} />);
    fireEvent.click(screen.getByRole("button", { name: /Entrar/ }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it("invokes setQuery as the user types in the search field", () => {
    const setQuery = vi.fn();
    render(<Header {...baseProps} setQuery={setQuery} />);
    const input = screen.getByLabelText(/Buscar/i);
    fireEvent.change(input, { target: { value: "infarto" } });
    expect(setQuery).toHaveBeenCalledWith("infarto");
  });

  it("invokes onOpenDrawer when the hamburger is clicked", () => {
    const onOpenDrawer = vi.fn();
    render(<Header {...baseProps} onOpenDrawer={onOpenDrawer} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
  });
});
