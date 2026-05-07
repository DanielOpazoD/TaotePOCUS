"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import {
  buildBackup,
  defaultBackupFilename,
  parseBackup,
  restoreBackup,
  type BackupEnvelope,
  type RestoreResult,
} from "@/lib/backup";
import { IS_NETLIFY_DB_ENABLED } from "@/lib/env";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { dbBulkImport } from "@/app/actions/db";

interface Props {
  /** Email of the current admin (best-effort tag inside the bundle). */
  currentEmail: string | null;
  /** Notification surface. We use the existing toast system so the
   *  feedback feels native to the rest of the admin panel. */
  notify: (msg: string) => void;
}

const LAST_BACKUP_KEY = STORAGE_KEYS.lastBackupAt;
const STALE_DAYS = 7;

function formatRelative(iso: string | null): string {
  if (!iso) return "nunca";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "nunca";
  const diffMs = Date.now() - t;
  const days = Math.floor(diffMs / (24 * 3600 * 1000));
  if (days < 1) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  return new Date(iso).toLocaleDateString("es");
}

/**
 * Backup / restore tab. Read-only export + REPLACE-on-import.
 *
 * The export reads the current localStorage and triggers a download.
 * The import asks for explicit confirmation, restores via
 * `restoreBackup`, then forces a full reload so every hook re-hydrates
 * from the new state — simpler and safer than trying to invalidate
 * each consumer manually.
 */
export default function BackupPanel({ currentEmail, notify }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<BackupEnvelope | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  // DB sync state — separate from the file flow because the dialog
  // copy and the failure modes are different.
  const [dbBusy, setDbBusy] = useState(false);
  const [dbConfirm, setDbConfirm] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // Read the last-backup-at timestamp once on mount and after each
  // successful export. Stored separately from the bundle itself so a
  // restore from an old file doesn't reset the "freshness" indicator.
  useEffect(() => {
    try {
      setLastBackupAt(localStorage.getItem(LAST_BACKUP_KEY));
    } catch {
      /* SSR or privacy mode — leave as null */
    }
  }, []);

  const handleExport = () => {
    const env = buildBackup(currentEmail);
    const blob = new Blob([JSON.stringify(env, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    // The href + download attribute pair is the standard approach for
    // synthesizing a file download from in-memory data without a server.
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultBackupFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    try {
      const now = new Date().toISOString();
      localStorage.setItem(LAST_BACKUP_KEY, now);
      setLastBackupAt(now);
    } catch {
      /* ignore — the download still happened */
    }
    notify(
      `Backup descargado · ${env.summary.overrides} reclasificaciones, ${env.summary.customCategories} categorías, ${env.summary.userCases} casos propios`,
    );
  };

  const handleFilePicked = async (file: File) => {
    setRestoreError(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setRestoreError("El archivo no es JSON válido.");
        return;
      }
      const env = parseBackup(parsed);
      if (!env) {
        setRestoreError(
          "El archivo no parece un backup válido (versión incorrecta o estructura distinta).",
        );
        return;
      }
      // Stage the envelope for confirm — the actual write happens
      // only after the admin confirms the dialog below.
      setPendingRestore(env);
    } catch {
      setRestoreError("No se pudo leer el archivo.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmRestore = () => {
    if (!pendingRestore) return;
    const result: RestoreResult = restoreBackup(pendingRestore);
    if (!result.ok) {
      setRestoreError(
        result.reason === "write-failed"
          ? "Falló la escritura en localStorage (¿espacio agotado?)."
          : "No se pudo restaurar — revisa la consola.",
      );
      setPendingRestore(null);
      return;
    }
    notify(
      `Backup restaurado · ${result.counts!.overrides} reclasificaciones, ${result.counts!.customCategories} categorías. Recargando…`,
    );
    // Reload so every hook re-hydrates from the new localStorage. A
    // tiny delay lets the toast paint before the navigation.
    setTimeout(() => window.location.reload(), 600);
  };

  const cancelRestore = () => {
    setPendingRestore(null);
  };

  // ─── DB upload ──────────────────────────────────────────────
  // Push the current localStorage state to Postgres in a single
  // atomic transaction. The server action wipes-and-rewrites every
  // table, so it's safe to re-run; partial state can't leak in.
  // Used for the initial migration and for re-syncing if drift ever
  // builds up between local and DB.
  const handleDbUpload = async () => {
    setDbError(null);
    setDbBusy(true);
    try {
      const env = buildBackup(currentEmail);
      // The BackupEnvelope shape is intentionally loose (`unknown`-typed
      // arrays / records) so file imports don't have to deep-validate
      // before parsing. For this code path the source is our own
      // `buildBackup`, which produces type-correct data — the cast
      // matches what's actually there at runtime.
      const result = await dbBulkImport(
        env.data as Parameters<typeof dbBulkImport>[0],
        currentEmail,
      );
      if (!result.ok) {
        setDbError(
          "No se pudo subir a la base de datos. Revisá los logs de Netlify Functions para el detalle.",
        );
        return;
      }
      const c = result.counts!;
      notify(
        `Subido a DB · ${c.overrides} reclasificaciones, ${c.categories} categorías, ${c.userCases} casos propios, ${c.favs} favoritos`,
      );
    } catch (err) {
      setDbError(
        err instanceof Error ? `Error: ${err.message}` : "Error desconocido durante la subida.",
      );
    } finally {
      setDbBusy(false);
      setDbConfirm(false);
    }
  };

  // Pre-flight summary of what's currently in storage (so the admin
  // can see "you'll be backing up X overrides" before clicking).
  // Recomputed on each render — cheap, the data is local.
  const preview = buildBackup(currentEmail);
  const isStale = (() => {
    if (!lastBackupAt) return true;
    const days = (Date.now() - new Date(lastBackupAt).getTime()) / (24 * 3600 * 1000);
    return days >= STALE_DAYS;
  })();

  return (
    <div className="backup-panel">
      <div className="backup-intro">
        <h2>Backup</h2>
        <p>
          Exportá un archivo JSON con todo lo que has hecho desde admin: reclasificaciones,
          categorías personalizadas, casos propios y favoritos. Guardalo en Drive / Dropbox / iCloud
          — es tu única red contra perder los datos del navegador, cambiar de máquina o reinstalar.
        </p>
      </div>

      <div className={`backup-status${isStale ? " is-stale" : ""}`}>
        <div className="backup-status-row">
          <span className="backup-status-label">Último backup</span>
          <span className="backup-status-value">{formatRelative(lastBackupAt)}</span>
        </div>
        {isStale && (
          <p className="backup-status-warn">
            {lastBackupAt
              ? `Hace más de ${STALE_DAYS} días — descargá uno nuevo si has clasificado casos desde entonces.`
              : "Aún no has hecho un backup. Descargá uno antes de seguir clasificando."}
          </p>
        )}
      </div>

      <section className="backup-section">
        <header className="backup-section-head">
          <h3>Exportar</h3>
          <p>Descarga un snapshot del estado actual.</p>
        </header>
        <ul className="backup-summary">
          <li>
            <strong>{preview.summary.overrides}</strong> reclasificaciones
          </li>
          <li>
            <strong>{preview.summary.customCategories}</strong> categorías personalizadas
          </li>
          <li>
            <strong>{preview.summary.userCases}</strong> casos propios
          </li>
          <li>
            <strong>{preview.summary.favorites}</strong> favoritos
          </li>
        </ul>
        <button type="button" className="btn-primary backup-action" onClick={handleExport}>
          <Icon.download /> Exportar backup
        </button>
      </section>

      <section className="backup-section">
        <header className="backup-section-head">
          <h3>Importar</h3>
          <p>
            Reemplaza el estado actual con el contenido del archivo. Esta operación{" "}
            <strong>sobrescribe</strong> tus datos locales — usa con cuidado.
          </p>
        </header>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="backup-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFilePicked(file);
          }}
        />
        <button
          type="button"
          className="btn-ghost backup-action"
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon.upload /> Elegir archivo JSON…
        </button>
        {restoreError && (
          <p className="backup-error" role="alert">
            {restoreError}
          </p>
        )}
      </section>

      {/* DB sync — only visible when the feature flag is on. Without
          it the server actions have nowhere to land and the section
          would be misleading. */}
      {IS_NETLIFY_DB_ENABLED && (
        <section className="backup-section">
          <header className="backup-section-head">
            <h3>Sincronizar con base de datos</h3>
            <p>
              Sube el estado actual de localStorage a Postgres (Netlify Database). La operación
              reemplaza todos los datos en la DB con los locales — usar para la migración inicial o
              para reconciliar drift después de un fallo de sincronización.
            </p>
          </header>
          <ul className="backup-summary">
            <li>
              <strong>{preview.summary.overrides}</strong> reclasificaciones
            </li>
            <li>
              <strong>{preview.summary.customCategories}</strong> categorías
            </li>
            <li>
              <strong>{preview.summary.userCases}</strong> casos propios
            </li>
            <li>
              <strong>{preview.summary.favorites}</strong> favoritos
            </li>
          </ul>
          <button
            type="button"
            className="btn-primary backup-action"
            onClick={() => setDbConfirm(true)}
            disabled={dbBusy}
          >
            <Icon.upload /> {dbBusy ? "Subiendo…" : "Subir a base de datos"}
          </button>
          {dbError && (
            <p className="backup-error" role="alert">
              {dbError}
            </p>
          )}
        </section>
      )}

      {dbConfirm && (
        <div className="backup-confirm" role="alertdialog" aria-modal="true">
          <div className="backup-confirm-card">
            <h3>¿Subir a la base de datos?</h3>
            <p>
              Se va a sobrescribir el contenido de Postgres con el estado actual de tu navegador.
              Esta operación es atómica — todo o nada.
            </p>
            <p className="backup-confirm-warn">
              Si trabajaste desde otro dispositivo y hay datos solo en la DB, vas a perderlos. Para
              casos así, primero exportá un backup desde el otro dispositivo.
            </p>
            <div className="backup-confirm-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setDbConfirm(false)}
                disabled={dbBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleDbUpload}
                disabled={dbBusy}
              >
                {dbBusy ? "Subiendo…" : "Subir y reemplazar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRestore && (
        <div className="backup-confirm" role="alertdialog" aria-modal="true">
          <div className="backup-confirm-card">
            <h3>¿Reemplazar tus datos locales?</h3>
            <p>
              Vas a sobrescribir el estado actual con este backup del{" "}
              <strong>{new Date(pendingRestore.exportedAt).toLocaleString("es")}</strong>
              {pendingRestore.exportedBy ? <> · {pendingRestore.exportedBy}</> : null}.
            </p>
            <ul className="backup-summary backup-summary--inline">
              <li>
                <strong>{pendingRestore.summary.overrides}</strong> reclasificaciones
              </li>
              <li>
                <strong>{pendingRestore.summary.customCategories}</strong> categorías
              </li>
              <li>
                <strong>{pendingRestore.summary.userCases}</strong> casos propios
              </li>
              <li>
                <strong>{pendingRestore.summary.favorites}</strong> favoritos
              </li>
            </ul>
            <p className="backup-confirm-warn">
              Tus datos actuales se perderán. Si tenés cambios sin exportar, cancelá y descargá un
              backup nuevo primero.
            </p>
            <div className="backup-confirm-actions">
              <button type="button" className="btn-ghost" onClick={cancelRestore}>
                Cancelar
              </button>
              <button type="button" className="btn-primary btn-danger" onClick={confirmRestore}>
                Reemplazar y recargar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
