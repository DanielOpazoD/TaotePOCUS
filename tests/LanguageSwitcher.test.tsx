// LanguageSwitcher integration: trigger renders the active language,
// dropdown opens / closes, selecting an item flips state through the
// provider, and ESC dismisses the menu.

import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import LanguageSwitcher from "@/components/chrome/LanguageSwitcher";
import { renderWithLanguage } from "./test-utils";
import { STORAGE_KEYS } from "@/lib/storage-keys";

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    document.documentElement.lang = "";
  });

  it("shows the active language abbreviation in the trigger", () => {
    renderWithLanguage(<LanguageSwitcher />, { lang: "es" });
    const trigger = screen.getByRole("button", { name: /Cambiar idioma/i });
    expect(trigger.textContent).toContain("ES");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the menu on click and shows both options", () => {
    renderWithLanguage(<LanguageSwitcher />, { lang: "es" });
    const trigger = screen.getByRole("button", { name: /Cambiar idioma/i });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox")).toBeTruthy();
    // Each language is a row; "Español" and "English" are the
    // human-readable labels (always shown in their native form).
    expect(screen.getByRole("option", { name: /Español/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /English/ })).toBeTruthy();
  });

  it("marks the active language row as aria-selected", () => {
    renderWithLanguage(<LanguageSwitcher />, { lang: "en" });
    fireEvent.click(screen.getByRole("button", { name: /Change language/i }));
    const en = screen.getByRole("option", { name: /English/ });
    const es = screen.getByRole("option", { name: /Español/ });
    expect(en.getAttribute("aria-selected")).toBe("true");
    expect(es.getAttribute("aria-selected")).toBe("false");
  });

  it("clicking an option flips the language and closes the menu", () => {
    renderWithLanguage(<LanguageSwitcher />, { lang: "es" });
    const trigger = screen.getByRole("button", { name: /Cambiar idioma/i });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: /English/ }));

    // Provider state propagated: localStorage, URL and <html lang>
    // all reflect the new value, and the menu closed.
    expect(localStorage.getItem(STORAGE_KEYS.lang)).toBe("en");
    expect(window.location.search).toBe("?lang=en");
    expect(document.documentElement.lang).toBe("en");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("ESC closes the menu and returns focus to the trigger", () => {
    renderWithLanguage(<LanguageSwitcher />, { lang: "es" });
    const trigger = screen.getByRole("button", { name: /Cambiar idioma/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("clicking outside the switcher closes the menu", () => {
    const { container } = renderWithLanguage(
      <>
        <LanguageSwitcher />
        <button data-testid="outside">outside</button>
      </>,
      { lang: "es" },
    );
    fireEvent.click(screen.getByRole("button", { name: /Cambiar idioma/i }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.mouseDown(container.querySelector("[data-testid=outside]")!);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
