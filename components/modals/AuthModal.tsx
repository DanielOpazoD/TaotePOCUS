"use client";

import { useEffect, useRef, useState } from "react";
import { SignIn } from "@clerk/nextjs";
import { Icon } from "@/lib/icons";
import { ADMIN_CREDENTIALS, IS_CLERK_ENABLED } from "@/lib/env";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useT } from "@/hooks/useLanguage";
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
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      // Strip Clerk's hash-routing artifacts on unmount. <SignIn
      // routing="hash" /> uses fragments like `#/factor-one`,
      // `#/sso-callback`, `#/verify-email-address` to navigate
      // between its internal steps without a full reload. When the
      // modal closes those fragments stick to the URL until the
      // next manual refresh — visually noisy. Replace history with
      // the bare path + search so the URL goes back to clean.
      if (typeof window !== "undefined" && window.location.hash.startsWith("#/")) {
        const cleanUrl = window.location.pathname + window.location.search;
        window.history.replaceState(null, "", cleanUrl);
      }
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
      aria-label={t("auth.aria")}
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
          aria-label={t("auth.close.aria")}
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
        {/* Social-only sign-in. Per user request (May-2026), we want
            ONLY the Google OAuth path — no email/password form, no
            sign-up link, no "or" divider. The Clerk widget shows
            whatever the dashboard has enabled, so we layer
            `appearance.elements` overrides to HIDE the form-based
            sections while keeping the social-buttons block visible.

            **Important ops note for the maintainer**: this CSS-side
            hide is belt-and-suspenders. The Clerk dashboard should
            ALSO be configured to allow only Google OAuth (Sign-in &
            Sign-up → Strategies). Otherwise an email/password user
            with credentials could still sign in via a direct API
            call. To configure:

              Clerk dashboard → User & Authentication → Email,
              Phone, Username  → disable everything except OAuth.
              Then in "Social Connections" enable only Google.
        */}
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
              // Google-only mode: hide every non-OAuth surface.
              // The `socialButtons*` blocks stay visible; everything
              // form-based collapses to `display: none`.
              dividerRow: { display: "none" },
              formFieldRow: { display: "none" },
              formFieldInput: { display: "none" },
              formButtonPrimary: { display: "none" },
              footer: { display: "none" },
              footerAction: { display: "none" },
              // Make the social button feel like THE primary CTA
              // since it's now the only one.
              socialButtonsBlockButton: {
                fontSize: "15px",
                padding: "12px 16px",
              },
            },
          }}
        />
      </div>
    </dialog>
  );
}

function LegacyAuthModal({ onClose, onLogin }: Props) {
  const t = useT();
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
          aria-label={t("auth.close.aria")}
        >
          {Icon.close()}
        </button>
        <h2 id="auth-title">
          {mode === "login" ? t("auth.title.login") : t("auth.title.register")}
        </h2>
        <p>{mode === "login" ? t("auth.intro.login") : t("auth.intro.register")}</p>
        {mode === "register" && (
          <>
            <label htmlFor="auth-name">{t("auth.label.name")}</label>
            <input
              id="auth-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("auth.placeholder.name")}
            />
          </>
        )}
        <label htmlFor="auth-email">{t("auth.label.email")}</label>
        <input
          id="auth-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.placeholder.email")}
          required
          autoFocus
          autoComplete="email"
        />
        <label htmlFor="auth-password">{t("auth.label.password")}</label>
        <input
          id="auth-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("auth.placeholder.password")}
          required
          autoComplete="current-password"
        />
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy
            ? t("auth.action.busy")
            : mode === "login"
              ? t("auth.action.login")
              : t("auth.action.register")}
        </button>
        <div className="alt">
          {mode === "login" ? t("auth.alt.toRegister") : t("auth.alt.toLogin")}
          <button
            type="button"
            className="link-btn"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? t("auth.action.register") : t("auth.action.login")}
          </button>
        </div>
        <div className="auth-hint">
          <strong>{t("auth.demo.title")}</strong> {ADMIN_CREDENTIALS.email} ·{" "}
          {ADMIN_CREDENTIALS.password}
        </div>
      </form>
    </dialog>
  );
}
