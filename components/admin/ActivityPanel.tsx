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

const KIND_LABELS: Record<string, string> = {
  override_set: "Override aplicado",
  override_cleared: "Override descartado",
  category_added: "Categoría creada",
  category_renamed: "Categoría renombrada",
  category_removed: "Categoría eliminada",
  user_case_saved: "Caso guardado",
  user_case_soft_deleted: "Caso a papelera",
  user_case_restored: "Caso restaurado",
  import_purged: "Caso eliminado permanentemente",
  bulk_imported: "Importación masiva",
};

const PAGE_SIZE = 100;

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es", {
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
function ActivitySkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando actividad…">
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
  const [rows, setRows] = useState<AdminActionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingFirst, setLoadingFirst] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [kindFilter, setKindFilter] = useState<string>("");

  const fetchPage = useCallback(async (offset: number): Promise<AdminActionRow[] | null> => {
    try {
      const res = await dbListAdminActions(PAGE_SIZE, offset);
      if (res.ok) {
        setError(null);
        return res.rows;
      }
      setError(
        res.reason === "auth_required"
          ? "Necesitás iniciar sesión para ver la actividad."
          : res.reason === "forbidden"
            ? "Tu cuenta no tiene permisos de administrador."
            : "No se pudo cargar la actividad. Reintentá más tarde.",
      );
      return null;
    } catch {
      setError("Error de red. Reintentá más tarde.");
      return null;
    }
  }, []);

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
  // surfaced as the filter dropdown. Sorted by their Spanish label
  // so the dropdown reads alphabetically.
  const availableKinds = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.kind);
    return Array.from(set).sort((a, b) =>
      (KIND_LABELS[a] ?? a).localeCompare(KIND_LABELS[b] ?? b, "es"),
    );
  }, [rows]);

  return (
    <div className="categories-editor">
      <div className="categories-intro">
        <h2>Actividad</h2>
        <p>
          Registro append-only de cada cambio admin: overrides, categorías, casos eliminados o
          restaurados, importaciones. Útil para auditar quién hizo qué y cuándo.
        </p>
      </div>

      {!loadingFirst && rows.length > 0 && (
        <div className="bulk-edit-head" style={{ marginBottom: "var(--space-3)" }}>
          <div className="bulk-edit-filters">
            <select
              className="bulk-edit-filter"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              aria-label="Filtrar por tipo de acción"
            >
              <option value="">Todas las acciones</option>
              {availableKinds.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k] ?? k}
                </option>
              ))}
            </select>
          </div>
          <div className="bulk-edit-meta">
            <span className="bulk-edit-count">
              {visibleRows.length}
              {kindFilter ? ` de ${rows.length}` : ""} acciones
            </span>
          </div>
        </div>
      )}

      {loadingFirst ? (
        <ActivitySkeleton />
      ) : error ? (
        <p className="categories-empty" role="alert">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="categories-empty">
          Aún no se registraron acciones. Cualquier edición admin que hagas a partir de ahora
          aparece acá.
        </p>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Acción</th>
                <th>Caso / objeto</th>
                <th>Admin</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.id}>
                  <td className="admin-date">{formatTime(r.created_at)}</td>
                  <td>
                    <span className="admin-pill">{KIND_LABELS[r.kind] ?? r.kind}</span>
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
                    Ninguna acción de tipo «{KIND_LABELS[kindFilter] ?? kindFilter}» en el rango
                    cargado.
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
                {loadingMore ? "Cargando…" : "Cargar más"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
