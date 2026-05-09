"use client";

// Admin activity feed. Reads the `admin_actions` audit log via
// `dbListAdminActions` and renders a chronological list of every
// admin mutation (overrides set, categories added, cases deleted,
// etc.). Append-only by design — there's no edit / delete affordance.
//
// Two affordances on top of the raw list:
//
//   - **Kind filter**: dropdown with every action kind, each with
//     its Spanish label. Filtering happens client-side over the
//     loaded set so a quick toggle doesn't fire a Server Action.
//   - **Cargar más**: pagination. Each click pulls the next 100
//     rows and appends. Stops appending when the server returns
//     fewer than the page size (we've reached the end).
//
// Why client-side filter even though we paginate server-side: the
// dataset stays small for years (one admin × ~10 actions/day),
// the kind dropdown is bounded, and a server-side filter pass
// would split the cursor logic into kind-aware shards. Once the
// table grows past 10k rows we'll add a `dbListAdminActions(kind, …)`
// signature.

import { useCallback, useEffect, useMemo, useState } from "react";
import { dbListAdminActions, type AdminActionRow } from "@/app/actions/db";
import { useLanguage, useT } from "@/hooks/useLanguage";
import { localeOf, type DictKey } from "@/lib/i18n";

/** Action `kind` → translation-key suffix. The dict ships the labels
 *  under `activity.kind.<suffix>` for both languages. Unknown kinds
 *  fall back to the raw kind string at the call site. */
const KIND_KEYS = [
  "override_set",
  "override_cleared",
  "category_added",
  "category_renamed",
  "category_removed",
  "user_case_saved",
  "user_case_soft_deleted",
  "user_case_restored",
  "import_purged",
  "bulk_imported",
] as const;

const PAGE_SIZE = 100;

function formatTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Six fake rows that match the table column layout while the
 *  Server Action resolves. Avoids the empty-then-pop UX. */
function ActivitySkeleton({ ariaLabel }: { ariaLabel: string }) {
  return (
    <div aria-busy="true" aria-label={ariaLabel}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skeleton-table-row is-narrow">
          <span className="skeleton-line" style={{ width: "100%" }} />
          <span className="skeleton-line" style={{ width: "70%" }} />
          <span className="skeleton-line" style={{ width: "85%" }} />
          <span className="skeleton-line" style={{ width: "60%" }} />
        </div>
      ))}
    </div>
  );
}

export default function ActivityPanel() {
  const t = useT();
  const { lang } = useLanguage();
  const [rows, setRows] = useState<AdminActionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingFirst, setLoadingFirst] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [kindFilter, setKindFilter] = useState<string>("");

  /** Resolve a server-side `kind` to its translated label, falling
   *  back to the raw id when the kind is one we don't have a key
   *  for (defensive — every kind in `KIND_KEYS` is covered). */
  const labelForKind = useCallback(
    (kind: string): string => {
      if ((KIND_KEYS as readonly string[]).includes(kind)) {
        return t(`activity.kind.${kind}` as DictKey);
      }
      return kind;
    },
    [t],
  );

  const fetchPage = useCallback(
    async (offset: number): Promise<AdminActionRow[] | null> => {
      try {
        const res = await dbListAdminActions(PAGE_SIZE, offset);
        if (res.ok) {
          setError(null);
          return res.rows;
        }
        setError(
          res.reason === "auth_required"
            ? t("activity.error.auth")
            : res.reason === "forbidden"
              ? t("activity.error.forbidden")
              : t("activity.error.load"),
        );
        return null;
      } catch {
        setError(t("activity.error.network"));
        return null;
      }
    },
    [t],
  );

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const page = await fetchPage(0);
      if (cancelled) return;
      if (page) {
        setRows(page);
        setHasMore(page.length === PAGE_SIZE);
      }
      setLoadingFirst(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const page = await fetchPage(rows.length);
    if (page) {
      setRows((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  };

  // Apply the client-side kind filter (no-op when empty).
  const visibleRows = useMemo(
    () => (kindFilter ? rows.filter((r) => r.kind === kindFilter) : rows),
    [rows, kindFilter],
  );

  // The set of kinds that actually appear in the loaded rows —
  // surfaced as the filter dropdown. Sorted by the localized label
  // so the dropdown reads alphabetically in the active language.
  const availableKinds = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.kind);
    const collator = localeOf(lang);
    return Array.from(set).sort((a, b) => labelForKind(a).localeCompare(labelForKind(b), collator));
  }, [rows, lang, labelForKind]);

  const locale = localeOf(lang);
  return (
    <div className="categories-editor">
      <div className="categories-intro">
        <h2>{t("activity.intro.title")}</h2>
        <p>{t("activity.intro.body")}</p>
      </div>

      {!loadingFirst && rows.length > 0 && (
        <div className="bulk-edit-head" style={{ marginBottom: "var(--space-3)" }}>
          <div className="bulk-edit-filters">
            <select
              className="bulk-edit-filter"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              aria-label={t("activity.filter.aria")}
            >
              <option value="">{t("activity.filter.all")}</option>
              {availableKinds.map((k) => (
                <option key={k} value={k}>
                  {labelForKind(k)}
                </option>
              ))}
            </select>
          </div>
          <div className="bulk-edit-meta">
            <span className="bulk-edit-count">
              {visibleRows.length}
              {kindFilter ? ` ${t("activity.count.of", { total: rows.length })}` : ""}{" "}
              {t("activity.count.suffix")}
            </span>
          </div>
        </div>
      )}

      {loadingFirst ? (
        <ActivitySkeleton ariaLabel={t("activity.skeleton.aria")} />
      ) : error ? (
        <p className="categories-empty" role="alert">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="categories-empty">{t("activity.empty")}</p>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("activity.col.date")}</th>
                <th>{t("activity.col.action")}</th>
                <th>{t("activity.col.target")}</th>
                <th>{t("activity.col.admin")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.id}>
                  <td className="admin-date">{formatTime(r.created_at, locale)}</td>
                  <td>
                    <span className="admin-pill">{labelForKind(r.kind)}</span>
                  </td>
                  <td className="admin-title-cell">
                    {r.target_id ? (
                      <span className="admin-trash-title" title={r.target_id}>
                        {r.target_id}
                      </span>
                    ) : (
                      <span style={{ color: "var(--ink-mute)" }}>—</span>
                    )}
                  </td>
                  <td className="admin-date">{r.actor_email}</td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="bulk-edit-empty">
                    {t("activity.empty.filtered", { label: labelForKind(kindFilter) })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {hasMore && (
            <div className="bulk-edit-pagination">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? t("activity.loadMore.busy") : t("activity.loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
