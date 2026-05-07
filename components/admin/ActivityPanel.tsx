"use client";

// Admin activity feed. Reads the `admin_actions` audit log via
// `dbListAdminActions` and renders a chronological list of every
// admin mutation (overrides set, categories added, cases deleted,
// etc.). Append-only by design — there's no edit / delete affordance.
//
// Why a Server Action and not a static prop: this view sees data
// that's accumulated since the last deploy, possibly from other
// admins on other browsers. A direct fetch on mount keeps it fresh
// without piping the rows through the parent's hook tree.

import { useEffect, useState } from "react";
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

export default function ActivityPanel() {
  const [rows, setRows] = useState<AdminActionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await dbListAdminActions(100, 0);
        if (cancelled) return;
        if (res.ok) {
          setRows(res.rows);
          setError(null);
        } else {
          setError(
            res.reason === "auth_required"
              ? "Necesitás iniciar sesión para ver la actividad."
              : res.reason === "forbidden"
                ? "Tu cuenta no tiene permisos de administrador."
                : "No se pudo cargar la actividad. Reintentá más tarde.",
          );
        }
      } catch {
        if (!cancelled) setError("Error de red. Reintentá más tarde.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="categories-editor">
      <div className="categories-intro">
        <h2>Actividad</h2>
        <p>
          Registro append-only de cada cambio admin: overrides, categorías, casos eliminados o
          restaurados, importaciones. Útil para auditar quién hizo qué y cuándo.
        </p>
      </div>
      {loading ? (
        <p className="categories-empty">Cargando…</p>
      ) : error ? (
        <p className="categories-empty" role="alert">
          {error}
        </p>
      ) : !rows || rows.length === 0 ? (
        <p className="categories-empty">
          Aún no se registraron acciones. Cualquier edición admin que hagas a partir de ahora
          aparece acá.
        </p>
      ) : (
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
            {rows.map((r) => (
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
          </tbody>
        </table>
      )}
    </div>
  );
}
