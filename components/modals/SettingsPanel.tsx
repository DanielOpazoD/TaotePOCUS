"use client";

// Account-scoped settings dialog. Surfaced from the avatar
// UserMenu's "Configuración" row. Three sections:
//
//   1. Apariencia — density + reduced-motion override.
//   2. Reproducción — autoplay opt-in (default off after PR #109).
//   3. Offline — list of cases saved for offline + storage usage
//      + per-case remove + "Liberar todo" purge.
//
// The first two sections drive `usePreferences()` directly. The
// third reads from the existing `useOfflineCases()` plumbing (PR
// #112) — no new persistence layer, the dialog is purely a surface.

import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { useLanguage } from "@/hooks/useLanguage";
import { useNativeDialog } from "@/hooks/useNativeDialog";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { usePreferences } from "@/hooks/usePreferences";
import { purgeAllOffline, readStorageEstimate } from "@/lib/offline-cases";
import { getCaseTitle } from "@/lib/case-localized";
import { isMediaVideo } from "@/lib/media-kind";
import type { CaseRecord } from "@/lib/types";

interface Props {
  onClose: () => void;
  /** Full case corpus — used by the offline section to resolve
   *  `caseId → { title, media }` for the saved list. */
  allCases: CaseRecord[];
  /** Currently-saved-for-offline case IDs (from useOfflineCases).
   *  Passed in rather than read directly here so the parent can
   *  reconcile/refresh after a purge. */
  savedOfflineIds: Set<string>;
  /** Drops a single id from the offline cache + the parent's state.
   *  Wired in App.tsx to `offlineCases.remove`. */
  onRemoveOffline: (caseId: string) => void;
  /** Drops every offline-cached case. Wired in App.tsx to the
   *  `useOfflineCases` set + the SW purge message. */
  onPurgeOffline: () => void;
}

export default function SettingsPanel({
  onClose,
  allCases,
  savedOfflineIds,
  onRemoveOffline,
  onPurgeOffline,
}: Props) {
  const { t, lang } = useLanguage();
  const { prefs, setPreference } = usePreferences();
  const dialogRef = useNativeDialog<HTMLDialogElement>();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  // Storage estimate (usage + quota from `navigator.storage.estimate()`).
  // Polled once on open + after a purge so the "Liberaste X MB" feedback
  // is accurate. Browsers without the API return null → we hide the bar.
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  // Counter forces the estimate re-read after purge / individual remove.
  const [estimateNonce, setEstimateNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await readStorageEstimate();
      if (!cancelled) setEstimate(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [estimateNonce]);

  // Backdrop click closes — matches every other modal in the app.
  const onClickDialog = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Build the saved-case list. Each entry is the case from the
  // corpus + its byte size hint (we don't know exact cached size
  // without IDB metadata, so we omit it and only show case-level
  // metadata + the storage-usage total at the bottom of the section).
  const savedCases = allCases.filter((c) => savedOfflineIds.has(c.id));

  return (
    <dialog
      ref={dialogRef}
      className="settings-host"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={onClickDialog}
      aria-labelledby="settings-title"
    >
      <div className="settings-panel" ref={trapRef}>
        <header className="settings-head">
          <h2 id="settings-title">{t("settings.title")}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label={t("settings.close.aria")}
          >
            {Icon.close()}
          </button>
        </header>
        <div className="settings-body">
          {/* ─── Apariencia ─────────────────────────────────────── */}
          <section className="settings-section" aria-labelledby="settings-appearance-title">
            <h3 id="settings-appearance-title">{t("settings.appearance.title")}</h3>
            <p className="settings-section-sub">{t("settings.appearance.sub")}</p>
            <div className="settings-field">
              <label className="settings-field-label">{t("settings.density.label")}</label>
              {/* Radio group via two toggle buttons — same visual
                  vocabulary as the metrics-window picker. */}
              <div
                className="settings-segmented"
                role="radiogroup"
                aria-label={t("settings.density.label")}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={prefs.density === "comfortable"}
                  className={
                    "settings-segmented-btn" + (prefs.density === "comfortable" ? " is-active" : "")
                  }
                  onClick={() => setPreference("density", "comfortable")}
                >
                  {t("settings.density.comfortable")}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={prefs.density === "compact"}
                  className={
                    "settings-segmented-btn" + (prefs.density === "compact" ? " is-active" : "")
                  }
                  onClick={() => setPreference("density", "compact")}
                >
                  {t("settings.density.compact")}
                </button>
              </div>
              <p className="settings-help">{t("settings.density.help")}</p>
            </div>
            <div className="settings-field">
              <label className="settings-field-label">{t("settings.motion.label")}</label>
              <div
                className="settings-segmented"
                role="radiogroup"
                aria-label={t("settings.motion.label")}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={prefs.reducedMotion === "auto"}
                  className={
                    "settings-segmented-btn" + (prefs.reducedMotion === "auto" ? " is-active" : "")
                  }
                  onClick={() => setPreference("reducedMotion", "auto")}
                >
                  {t("settings.motion.auto")}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={prefs.reducedMotion === "always"}
                  className={
                    "settings-segmented-btn" +
                    (prefs.reducedMotion === "always" ? " is-active" : "")
                  }
                  onClick={() => setPreference("reducedMotion", "always")}
                >
                  {t("settings.motion.always")}
                </button>
              </div>
              <p className="settings-help">{t("settings.motion.help")}</p>
            </div>
          </section>

          {/* ─── Reproducción ───────────────────────────────────── */}
          <section className="settings-section" aria-labelledby="settings-playback-title">
            <h3 id="settings-playback-title">{t("settings.playback.title")}</h3>
            <p className="settings-section-sub">{t("settings.playback.sub")}</p>
            <div className="settings-field">
              {/* Single toggle row — checkbox semantics for the
                  on/off pair, no segmented control needed. */}
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={prefs.autoplay}
                  onChange={(e) => setPreference("autoplay", e.target.checked)}
                />
                <span className="settings-toggle-track" aria-hidden="true" />
                <span className="settings-toggle-text">
                  <span className="settings-toggle-title">{t("settings.autoplay.label")}</span>
                  <span className="settings-toggle-help">{t("settings.autoplay.help")}</span>
                </span>
              </label>
            </div>
          </section>

          {/* ─── Offline ────────────────────────────────────────── */}
          <section className="settings-section" aria-labelledby="settings-offline-title">
            <h3 id="settings-offline-title">{t("settings.offline.title")}</h3>
            <p className="settings-section-sub">{t("settings.offline.sub")}</p>

            {/* Storage usage bar. Hidden on browsers without the API. */}
            {estimate && (
              <div className="settings-storage">
                <div className="settings-storage-text">
                  <span>
                    {t("settings.storage.used", {
                      used: formatBytes(estimate.usage),
                      quota: formatBytes(estimate.quota),
                    })}
                  </span>
                  <span className="settings-storage-pct">
                    {Math.round((estimate.usage / Math.max(estimate.quota, 1)) * 100)}%
                  </span>
                </div>
                <div
                  className="settings-storage-bar"
                  role="progressbar"
                  aria-valuenow={estimate.usage}
                  aria-valuemin={0}
                  aria-valuemax={estimate.quota}
                  aria-label={t("settings.storage.aria")}
                >
                  <div
                    className="settings-storage-fill"
                    style={{
                      width: `${Math.min(100, (estimate.usage / Math.max(estimate.quota, 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {savedCases.length === 0 ? (
              <p className="settings-empty">{t("settings.offline.empty")}</p>
            ) : (
              <>
                <ul className="settings-offline-list">
                  {savedCases.map((c) => (
                    <li key={c.id} className="settings-offline-row">
                      <span className="settings-offline-title">
                        {getCaseTitle(c, lang).value}
                        {isMediaVideo(c.media) && (
                          <span className="settings-offline-kind" aria-hidden="true">
                            {" "}
                            · video
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="settings-offline-remove"
                        onClick={() => {
                          onRemoveOffline(c.id);
                          setEstimateNonce((n) => n + 1);
                        }}
                        aria-label={t("settings.offline.remove.aria", {
                          title: getCaseTitle(c, lang).value,
                        })}
                      >
                        {t("settings.offline.remove")}
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="settings-offline-purge"
                  onClick={async () => {
                    // Defer to the parent for state reconciliation +
                    // SW purge. Then refresh the storage estimate so
                    // the bar reflects the freed space.
                    onPurgeOffline();
                    await purgeAllOffline();
                    setEstimateNonce((n) => n + 1);
                  }}
                >
                  {t("settings.offline.purge")}
                </button>
              </>
            )}
          </section>
        </div>
      </div>
    </dialog>
  );
}

/** Bytes → human readable. KB / MB / GB; matches the existing
 *  `formatBytes` in `case-form/MediaPanel.tsx` (kept inline rather
 *  than imported because that one is in an admin-only path). */
function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}
