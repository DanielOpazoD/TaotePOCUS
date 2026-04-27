import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AuthModal from "@/components/modals/AuthModal";

describe("AuthModal", () => {
  it("renders the login form by default", () => {
    render(<AuthModal onClose={vi.fn()} onLogin={vi.fn().mockResolvedValue({ ok: true })} />);
    expect(screen.getByRole("dialog", { name: "Bienvenido de vuelta" })).toBeTruthy();
    expect(screen.getByLabelText("Correo")).toBeTruthy();
    expect(screen.getByLabelText("Contraseña")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
  });

  it("toggles to the register form when 'Crear cuenta' is clicked", () => {
    render(<AuthModal onClose={vi.fn()} onLogin={vi.fn().mockResolvedValue({ ok: true })} />);
    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(screen.getByLabelText("Nombre")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeTruthy(); // submit button
  });

  it("submits the typed credentials to onLogin", async () => {
    const onLogin = vi.fn().mockResolvedValue({ ok: true });
    render(<AuthModal onClose={vi.fn()} onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "x@y.z" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith({ email: "x@y.z", password: "password", name: "" });
    });
  });

  it("surfaces the error message when login fails", async () => {
    const onLogin = vi
      .fn()
      .mockResolvedValue({ ok: false, code: "wrong_admin_password", message: "Bad credentials" });
    render(<AuthModal onClose={vi.fn()} onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "x@y.z" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Bad credentials");
    });
  });

  it("invokes onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<AuthModal onClose={onClose} onLogin={vi.fn().mockResolvedValue({ ok: true })} />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables the submit button while busy", async () => {
    let resolve: (v: { ok: true }) => void = () => {};
    const onLogin = vi.fn().mockImplementation(
      () =>
        new Promise<{ ok: true }>((res) => {
          resolve = res;
        }),
    );
    render(<AuthModal onClose={vi.fn()} onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "x@y.z" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "p" } });
    const submit = screen.getByRole("button", { name: "Entrar" });
    fireEvent.click(submit);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Verificando…" })).toBeTruthy();
    });
    resolve({ ok: true });
  });
});
