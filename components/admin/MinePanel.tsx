"use client";

// "Mis casos" tab content for `AdminPanel`. Three stacked sections:
//   - Stats strip (totals + counts).
//   - Your published cases (live).
//   - Trash + imported trash (when non-empty).
//
// Pulled out of `AdminPanel.tsx` in a structural pass — each tab now
// has its own component file. The tab strip + dispatch stays in the
// parent; this file only knows how to render the "mine" surface.

import Image from "next/image";
import { CineLoop } from "../cine";
import EmptyState from "../EmptyState";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { categoryLabelEs } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";
import { isMediaVideo } from "@/lib/media-kind";
import type { CaseRecord } from "@/lib/types";

interface Props {
  allCases: CaseRecord[];
  userCases: CaseRecord[];
  trashedCases: CaseRecord[];
  /** Soft-deleted seed/imported cases. Only renders the section
   *  when non-empty + handler provided. */
  trashedImports?: CaseRecord[];
  onEdit: (c: CaseRecord) => void;
  onDelete: (c: CaseRecord) => void;
  onRestore: (c: CaseRecord) => void;
  onPurge: (c: CaseRecord) => void;
  onRestoreImport?: (c: CaseRecord) => void;
  onPurgeImport?: (c: CaseRecord) => void;
  onNew: () => void;
}

/* `formatDateTime` removed in favor of `useLanguage().formatDateTime`,
 * which threads the active UI locale (es-CL / en-US) through
 * `Intl.DateTimeFormat`. The previous hardcoded "es" produced a
 * Spanish stamp even for an EN reader on the trash table. */

export function MinePanel({
  allCases,
  userCases,
  trashedCases,
  trashedImports,
  onEdit,
  onDelete,
  onRestore,
  onPurge,
  onRestoreImport,
  onPurgeImport,
  onNew,
}: Props) {
  const { t, formatDateTime } = useLanguage();
  const trashOne = (n: number) =>
    t(n === 1 ? "admin.mine.trash.count.one" : "admin.mine.trash.count.many", { count: n });
  return (
    <>
      <div className="admin-stats">
        <div className="admin-stat">
          <span className="admin-stat-num">{allCases.length}</span>
          <span className="admin-stat-label">{t("admin.mine.stats.total")}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-num">{userCases.length}</span>
          <span className="admin-stat-label">{t("admin.mine.stats.uploaded")}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-num">{userCases.filter((c) => c.media).length}</span>
          <span className="admin-stat-label">{t("admin.mine.stats.realMedia")}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-num">{CATEGORIES.length}</span>
          <span className="admin-stat-label">{t("admin.mine.stats.categories")}</span>
        </div>
      </div>

      <div className="admin-section-head">
        <h3>{t("admin.mine.publications")}</h3>
        <button className="btn-primary" onClick={onNew}>
          <Icon.plus /> {t("newCase.label")}
        </button>
      </div>

      {userCases.length === 0 ? (
        // Routed through the shared `EmptyState`. Pre-refactor this
        // was a bespoke `.admin-empty` div with a CTA button — same
        // semantics but visually disconnected from the public-grid
        // empties. EmptyState's BookGlyph for the admin view ties
        // the two surfaces together, and the `action` prop replaces
        // the inline button with the standardised `empty-action`
        // affordance. Note: this branch loses the inline `Icon.plus`
        // ornament — EmptyState's button is text-only by design, so
        // the CTA copy carries the verb.
        <EmptyState
          view={{ kind: "admin" }}
          title={t("admin.mine.empty.title")}
          message={t("admin.mine.empty.body")}
          action={{
            label: t("admin.mine.empty.cta"),
            onClick: onNew,
          }}
        />
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th></th>
              <th>{t("admin.mine.col.title")}</th>
              <th>{t("admin.mine.col.category")}</th>
              <th>{t("admin.mine.col.type")}</th>
              <th>{t("admin.mine.col.date")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {userCases.map((c) => {
              const cat = CATEGORIES.find((x) => x.id === c.category);
              const mediaLabel = c.media ? c.media.kind.toUpperCase() : t("admin.mine.synthetic");
              return (
                <tr key={c.id}>
                  <td>
                    <div className="admin-thumb">
                      {/* `isMediaVideo` covers the `kind: "gif"` +
                          `.mp4` corpus case (218 entries) — without
                          it those thumbs fell through to `<Image>`
                          which can't decode mp4 and rendered blank. */}
                      {isMediaVideo(c.media) ? (
                        <video src={c.media!.src} muted />
                      ) : c.media ? (
                        // Fixed 56×56 thumb; explicit dimensions let
                        // the optimizer pick the right size for the
                        // srcSet without us measuring.
                        <Image src={c.media.src} alt="" width={56} height={56} />
                      ) : (
                        <CineLoop kind={c.loop} aspect="1/1" speed={1} showChrome={false} />
                      )}
                    </div>
                  </td>
                  {/* Admin surfaces always render the canonical Spanish
                      slot — the editor works with the source of truth
                      and reads the ES original even when the public
                      site is in EN mode. */}
                  <td className="admin-title-cell">{c.title.es}</td>
                  <td>{cat ? categoryLabelEs(cat) : ""}</td>
                  <td>
                    <span className="admin-pill">{mediaLabel}</span>
                  </td>
                  <td className="admin-date">{c.date}</td>
                  <td className="admin-actions-cell">
                    <button
                      className="icon-btn"
                      onClick={() => onEdit(c)}
                      aria-label={t("admin.mine.action.edit")}
                    >
                      {Icon.edit()}
                    </button>
                    <button
                      className="icon-btn icon-btn-danger"
                      onClick={() => onDelete(c)}
                      aria-label={t("admin.mine.action.trash")}
                    >
                      {Icon.trash()}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {trashedCases.length > 0 && (
        <>
          <div className="admin-section-head">
            <h3>{t("admin.mine.trash.title")}</h3>
            <span className="admin-trash-count">{trashOne(trashedCases.length)}</span>
          </div>
          <table className="admin-table admin-table-trash">
            <thead>
              <tr>
                <th>{t("admin.mine.trash.col.title")}</th>
                <th>{t("admin.mine.trash.col.deletedAt")}</th>
                <th>{t("admin.mine.trash.col.deletedBy")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trashedCases.map((c) => (
                <tr key={c.id}>
                  <td className="admin-title-cell">
                    <span className="admin-trash-title">{c.title.es}</span>
                  </td>
                  <td className="admin-date">{formatDateTime(c.deletedAt)}</td>
                  <td className="admin-date">{c.deletedBy || "—"}</td>
                  <td className="admin-actions-cell">
                    <button
                      className="btn-ghost"
                      onClick={() => onRestore(c)}
                      style={{ marginRight: 6 }}
                    >
                      {t("admin.mine.action.restore")}
                    </button>
                    <button
                      className="icon-btn icon-btn-danger"
                      onClick={() => onPurge(c)}
                      aria-label={t("admin.mine.action.purge")}
                    >
                      {Icon.trash()}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {trashedImports && trashedImports.length > 0 && onRestoreImport && (
        <>
          <div className="admin-section-head">
            <h3>{t("admin.mine.imports.title")}</h3>
            <span className="admin-trash-count">{trashOne(trashedImports.length)}</span>
          </div>
          {/* Twitter-imported cases the admin soft-deleted from the
              classifier. Restored via `clearOverride`-on-deletedAt so
              any other admin edits to the case (category, title,
              reviewed flag) survive the round trip. */}
          <table className="admin-table admin-table-trash">
            <thead>
              <tr>
                <th>{t("admin.mine.trash.col.title")}</th>
                <th>{t("admin.mine.trash.col.deletedAt")}</th>
                <th>{t("admin.mine.trash.col.deletedBy")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trashedImports.map((c) => (
                <tr key={c.id}>
                  <td className="admin-title-cell">
                    <span className="admin-trash-title">{c.title.es}</span>
                  </td>
                  <td className="admin-date">{formatDateTime(c.deletedAt)}</td>
                  <td className="admin-date">{c.deletedBy || "—"}</td>
                  <td className="admin-actions-cell">
                    <button
                      className="btn-ghost"
                      onClick={() => onRestoreImport(c)}
                      style={{ marginRight: 6 }}
                    >
                      {t("admin.mine.action.restore")}
                    </button>
                    {onPurgeImport && (
                      <button
                        className="icon-btn icon-btn-danger"
                        onClick={() => onPurgeImport(c)}
                        aria-label={t("admin.mine.action.purge")}
                        title={t("admin.mine.imports.purge.title")}
                      >
                        {Icon.trash()}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
