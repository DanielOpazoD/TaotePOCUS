"use client";

import { useEffect, useRef, useState } from "react";
import { SignIn } from "@clerk/nextjs";
import { Icon } from "@/lib/icons";
import { ADMIN_CREDENTIALS, IS_CLERK_ENABLED } from "@/lib/env";
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

/**
 * Authentication modal. Two render paths:
 *
 *   - Clerk enabled → `<ClerkSignInModal>` mounts Clerk's `<SignIn />`
 *     inside our existing dialog shell. The `onLogin` prop is unused
 *     in this path because Clerk owns the form submission; the parent
 *     still passes it so the contract stays type-stable.
 *   - Legacy → the original email+password form below. Used by tests
 *     and by deployments without Clerk env vars.
 *
 * Branch happens once at module load (`IS_CLERK_ENABLED` is a
 * build-time constant), so React only ever calls one of the two
 * inner components per session — no rules-of-hooks risk.
 */
export default function AuthModal(props: Props) {
  if (IS_CLERK_ENABLED) {
    return <ClerkSignInModal onClose={props.onClose} />;
  }
  return <LegacyAuthModal {...props} />;
}

function ClerkSignInModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  // Backdrop click closes (matches the legacy modal's behaviour).
  const onClickDialog = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="auth-modal-host"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={onClickDialog}
      aria-label="Iniciar sesión"
    >
      {/* Minimal positioning wrapper — no background, no padding, no
          border. Clerk's <SignIn /> ships its own card chrome (shadow
          + radius + padding); duplicating ours on top stacks two
          cards with mismatched paddings. The close button floats
          over the card top-right corner. */}
      <div className="auth-modal-clerk-wrap">
        <button
          type="button"
          className="modal-close auth-modal-clerk-close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          {Icon.close()}
        </button>
        {/* `routing="hash"` keeps Clerk's multi-step flow inside the
            same modal — it uses the URL fragment (#) for internal
            transitions instead of pushing real navigations.
            `appearance.variables` maps the app's design tokens onto
            Clerk's CSS custom properties so the card inherits our
            font + colors automatically. `appearance.elements`
            overrides remaining bits where the variables aren't
            granular enough (e.g., the "Development mode" footer
            stripe in test instances). */}
        <SignIn
          routing="hash"
          appearance={{
            variables: {
              colorPrimary: "var(--ink)",
              colorText: "var(--ink)",
              colorTextSecondary: "var(--ink-soft)",
              colorBackground: "var(--bg)",
              colorInputBackground: "var(--input-bg)",
              colorInputText: "var(--ink)",
              colorDanger: "var(--crit)",
              borderRadius: "var(--radius-md)",
              fontFamily: "var(--sans)",
              fontFamilyButtons: "var(--sans)",
            },
            elements: {
              rootBox: { width: "100%" },
              card: {
                boxShadow: "var(--shadow-3)",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-lg)",
              },
            },
          }}
        />
      </div>
    </dialog>
  );
}

function LegacyAuthModal({ onClose, onLogin }: Props) {
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
      // See CaseModal for why we don't listen to the dialog's native
      // `close` event — it re-fires during unmount cleanup and can
      // cancel a freshly-mounted modal. All explicit close paths
      // (Escape, backdrop, cancel) below call onClose directly.
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
