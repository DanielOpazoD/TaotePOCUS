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
import { useLanguage, useT } from "@/hooks/useLanguage";
import { localeOf } from "@/lib/i18n";

interface Props {
  /** Email of the current admin (best-effort tag inside the bundle). */
  currentEmail: string | null;
  /** Notification surface. We use the existing toast system so the
   *  feedback feels native to the rest of the admin panel. */
  notify: (msg: string) => void;
}

const LAST_BACKUP_KEY = STORAGE_KEYS.lastBackupAt;
const STALE_DAYS = 7;

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
  const t = useT();
  const { lang } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<BackupEnvelope | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  // DB sync state — separate from the file flow because the dialog
  // copy and the failure modes are different.
  const [dbBusy, setDbBusy] = useState(false);
  const [dbConfirm, setDbConfirm] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  /** Format a "last backup" timestamp as a localized relative string. */
  const formatRelative = (iso: string | null): string => {
    if (!iso) return t("backup.relative.never");
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return t("backup.relative.never");
    const diffMs = Date.now() - ts;
    const days = Math.floor(diffMs / (24 * 3600 * 1000));
    if (days < 1) return t("backup.relative.today");
    if (days === 1) return t("backup.relative.yesterday");
    if (days < 30) return t("backup.relative.daysAgo", { days });
    return new Date(iso).toLocaleDateString(localeOf(lang));
  };

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
      t("backup.toast.exported", {
        overrides: env.summary.overrides,
        categories: env.summary.customCategories,
        userCases: env.summary.userCases,
      }),
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
        setRestoreError(t("backup.error.invalidJson"));
        return;
      }
      const env = parseBackup(parsed);
      if (!env) {
        setRestoreError(t("backup.error.invalidEnvelope"));
        return;
      }
      // Stage the envelope for confirm — the actual write happens
      // only after the admin confirms the dialog below.
      setPendingRestore(env);
    } catch {
      setRestoreError(t("backup.error.read"));
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
          ? t("backup.error.writeFailed")
          : t("backup.error.restoreUnknown"),
      );
      setPendingRestore(null);
      return;
    }
    notify(
      t("backup.toast.restored", {
        overrides: result.counts!.overrides,
        categories: result.counts!.customCategories,
      }),
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
        setDbError(t("backup.db.error"));
        return;
      }
      const c = result.counts!;
      notify(
        t("backup.db.toast", {
          overrides: c.overrides ?? 0,
          categories: c.categories ?? 0,
          userCases: c.userCases ?? 0,
          favs: c.favs ?? 0,
        }),
      );
    } catch (err) {
      setDbError(
        err instanceof Error
          ? t("backup.db.error.exception", { message: err.message })
          : t("backup.db.error.unknown"),
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
        <h2>{t("backup.intro.title")}</h2>
        <p>{t("backup.intro.body")}</p>
      </div>

      <div className={`backup-status${isStale ? " is-stale" : ""}`}>
        <div className="backup-status-row">
          <span className="backup-status-label">{t("backup.status.label")}</span>
          <span className="backup-status-value">{formatRelative(lastBackupAt)}</span>
        </div>
        {isStale && (
          <p className="backup-status-warn">
            {lastBackupAt
              ? t("backup.status.warn.stale", { days: STALE_DAYS })
              : t("backup.status.warn.never")}
          </p>
        )}
      </div>

      <section className="backup-section">
        <header className="backup-section-head">
          <h3>{t("backup.export.title")}</h3>
          <p>{t("backup.export.body")}</p>
        </header>
        <ul className="backup-summary">
          <li>
            <strong>{preview.summary.overrides}</strong> {t("backup.summary.overrides")}
          </li>
          <li>
            <strong>{preview.summary.customCategories}</strong> {t("backup.summary.categories")}
          </li>
          <li>
            <strong>{preview.summary.userCases}</strong> {t("backup.summary.userCases")}
          </li>
          <li>
            <strong>{preview.summary.favorites}</strong> {t("backup.summary.favorites")}
          </li>
        </ul>
        <button type="button" className="btn-primary backup-action" onClick={handleExport}>
          <Icon.download /> {t("backup.export.action")}
        </button>
      </section>

      <section className="backup-section">
        <header className="backup-section-head">
          <h3>{t("backup.import.title")}</h3>
          <p>
            {t("backup.import.body.prefix")} <strong>{t("backup.import.body.strong")}</strong>{" "}
            {t("backup.import.body.suffix")}
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
          <Icon.upload /> {t("backup.import.action")}
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
            <h3>{t("backup.db.title")}</h3>
            <p>{t("backup.db.body")}</p>
          </header>
          <ul className="backup-summary">
            <li>
              <strong>{preview.summary.overrides}</strong> {t("backup.summary.overrides")}
            </li>
            <li>
              <strong>{preview.summary.customCategories}</strong>{" "}
              {t("backup.summary.categoriesShort")}
            </li>
            <li>
              <strong>{preview.summary.userCases}</strong> {t("backup.summary.userCases")}
            </li>
            <li>
              <strong>{preview.summary.favorites}</strong> {t("backup.summary.favorites")}
            </li>
          </ul>
          <button
            type="button"
            className="btn-primary backup-action"
            onClick={() => setDbConfirm(true)}
            disabled={dbBusy}
          >
            <Icon.upload /> {dbBusy ? t("backup.db.action.busy") : t("backup.db.action")}
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
            <h3>{t("backup.db.confirm.title")}</h3>
            <p>{t("backup.db.confirm.body")}</p>
            <p className="backup-confirm-warn">{t("backup.db.confirm.warn")}</p>
            <div className="backup-confirm-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setDbConfirm(false)}
                disabled={dbBusy}
              >
                {t("backup.confirm.cancel")}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleDbUpload}
                disabled={dbBusy}
              >
                {dbBusy ? t("backup.db.action.busy") : t("backup.db.confirm.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRestore && (
        <div className="backup-confirm" role="alertdialog" aria-modal="true">
          <div className="backup-confirm-card">
            <h3>{t("backup.confirm.restore.title")}</h3>
            <p>
              {/* Body has a `<strong>{date}</strong>` insert + an
                  optional " · {exportedBy}" suffix; we render the
                  three slots inline rather than concatenating in JS
                  so the strong wrapper stays semantic. */}
              {(() => {
                const date = new Date(pendingRestore.exportedAt).toLocaleString(localeOf(lang));
                const by = pendingRestore.exportedBy ? ` · ${pendingRestore.exportedBy}` : "";
                return t("backup.confirm.restore.body", { date, by });
              })()}
            </p>
            <ul className="backup-summary backup-summary--inline">
              <li>
                <strong>{pendingRestore.summary.overrides}</strong> {t("backup.summary.overrides")}
              </li>
              <li>
                <strong>{pendingRestore.summary.customCategories}</strong>{" "}
                {t("backup.summary.categoriesShort")}
              </li>
              <li>
                <strong>{pendingRestore.summary.userCases}</strong> {t("backup.summary.userCases")}
              </li>
              <li>
                <strong>{pendingRestore.summary.favorites}</strong> {t("backup.summary.favorites")}
              </li>
            </ul>
            <p className="backup-confirm-warn">{t("backup.confirm.restore.warn")}</p>
            <div className="backup-confirm-actions">
              <button type="button" className="btn-ghost" onClick={cancelRestore}>
                {t("backup.confirm.cancel")}
              </button>
              <button type="button" className="btn-primary btn-danger" onClick={confirmRestore}>
                {t("backup.confirm.restore.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
