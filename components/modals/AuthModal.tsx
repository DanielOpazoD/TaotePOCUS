"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { ADMIN_CREDENTIALS } from "@/lib/env";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { AuthErrorCode } from "@/lib/errors";

interface Props {
  onClose: () => void;
  onLogin: (input: {
    email: string;
    password: string;
    name?: string;
  }) => Promise<{ ok: true } | { ok: false; code: AuthErrorCode | "unknown"; message: string }>;
}

export default function AuthModal({ onClose, onLogin }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trapRef = useFocusTrap<HTMLFormElement>(true);

  // Open the native dialog on mount; auto-close on unmount.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  // Belt-and-braces Escape handling — see ConfirmDialog for the why.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setError("");
    setBusy(true);
    try {
      const res = await onLogin({ email, password, name });
      if (!res.ok) setError(res.message);
    } finally {
      setBusy(false);
    }
  };

  // Click on the dialog element itself = backdrop click = close.
  const onClickDialog = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="auth-modal-host"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={onClickDialog}
      aria-labelledby="auth-title"
    >
      <form className="auth-modal" onSubmit={submit} ref={trapRef}>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          style={{ top: 16, right: 16 }}
          aria-label="Cerrar"
        >
          {Icon.close()}
        </button>
        <h2 id="auth-title">{mode === "login" ? "Bienvenido de vuelta" : "Crea tu cuenta"}</h2>
        <p>
          {mode === "login"
            ? "Accede para guardar casos en tu colección."
            : "Guarda casos, sigue temas y construye tu propio atlas."}
        </p>
        {mode === "register" && (
          <>
            <label htmlFor="auth-name">Nombre</label>
            <input
              id="auth-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. María Pérez"
            />
          </>
        )}
        <label htmlFor="auth-email">Correo</label>
        <input
          id="auth-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          required
          autoFocus
          autoComplete="email"
        />
        <label htmlFor="auth-password">Contraseña</label>
        <input
          id="auth-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Verificando…" : mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>
        <div className="alt">
          {mode === "login" ? "¿Eres nuevo? " : "¿Ya tienes cuenta? "}
          <button
            type="button"
            className="link-btn"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Crear cuenta" : "Iniciar sesión"}
          </button>
        </div>
        <div className="auth-hint">
          <strong>Demo admin:</strong> {ADMIN_CREDENTIALS.email} · {ADMIN_CREDENTIALS.password}
        </div>
      </form>
    </dialog>
  );
}
