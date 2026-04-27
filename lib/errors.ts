/**
 * Domain error types and the `Result<T, E>` utility.
 *
 * Two patterns are used in this codebase:
 *
 * 1. **`Result<T, E>`** — for failures that are *part of the contract*
 *    (e.g. `localStorage` quota exceeded, validation rejected an input).
 *    Callers are expected to branch on `.ok`. No `try/catch` needed.
 *
 * 2. **Typed `throw`** — for failures that are *exceptional*: an admin
 *    typed the wrong password, a programmer passed null, the network
 *    rejected a request. Callers can `catch` and narrow on `instanceof`.
 *
 * Pick the pattern that matches the call site's reality. Async repo
 * methods use `throw` for auth (the UI shows an error message and stops)
 * and `Result` for writes (the UI may want to retry, prompt the user to
 * free space, or fall back).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Result<T, E>
// ─────────────────────────────────────────────────────────────────────────────

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = Error> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

/** True if the result is `Ok<T>`. Narrows the result type. */
export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
/** True if the result is `Err<E>`. Narrows the result type. */
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/**
 * Unwrap an `Ok<T>` or throw the error. Use sparingly — the whole point
 * of `Result` is to avoid throwing. Useful in tests.
 */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  if (r.error instanceof Error) throw r.error;
  throw new Error(String(r.error));
}

// ─────────────────────────────────────────────────────────────────────────────
// Error classes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminator for `AuthError`. Add a code only when callers need to
 * branch on it — random one-off failures should pass through as
 * `code: "unknown"`.
 */
export type AuthErrorCode = "missing_email" | "wrong_admin_password" | "expired" | "unknown";

/**
 * Authentication / session failure. UI code can `catch (err)` and
 * narrow with `if (err instanceof AuthError)` to get the typed `code`.
 */
export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    // V8-specific but harmless elsewhere: clean up the stack trace.
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, AuthError);
    }
  }

  /** Human-readable Spanish message tuned for end-user toasts. */
  get userMessage(): string {
    switch (this.code) {
      case "missing_email":
        return "El correo es obligatorio.";
      case "wrong_admin_password":
        return "Credenciales de administrador incorrectas.";
      case "expired":
        return "Tu sesión expiró. Inicia sesión de nuevo.";
      case "unknown":
        return "No se pudo iniciar sesión.";
    }
  }
}

/**
 * Storage failure. Mostly used by the repo layer to lift a `WriteResult`
 * into a thrown error when retrying isn't part of the contract.
 */
export type StorageErrorReason = "quota" | "unavailable" | "unknown";

export class StorageError extends Error {
  readonly reason: StorageErrorReason;

  constructor(reason: StorageErrorReason, message?: string) {
    super(message || StorageError.defaultMessage(reason));
    this.name = "StorageError";
    this.reason = reason;
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, StorageError);
    }
  }

  static defaultMessage(reason: StorageErrorReason): string {
    switch (reason) {
      case "quota":
        return "Sin espacio. Borra casos antiguos o sube archivos más livianos.";
      case "unavailable":
        return "El almacenamiento del navegador no está disponible.";
      case "unknown":
        return "No se pudo guardar el cambio.";
    }
  }
}

/**
 * Type guard: does this look like an `AuthError`? Useful when error
 * objects cross a JSON boundary (where `instanceof` doesn't work).
 */
export function isAuthError(err: unknown): err is AuthError {
  return (
    err instanceof AuthError ||
    (typeof err === "object" && err !== null && (err as { name?: string }).name === "AuthError")
  );
}
