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
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
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

function formatDateTime(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

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
  return (
    <>
      <div className="admin-stats">
        <div className="admin-stat">
          <span className="admin-stat-num">{allCases.length}</span>
          <span className="admin-stat-label">Casos totales</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-num">{userCases.length}</span>
          <span className="admin-stat-label">Subidos por ti</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-num">{userCases.filter((c) => c.media).length}</span>
          <span className="admin-stat-label">Con media real</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-num">{CATEGORIES.length}</span>
          <span className="admin-stat-label">Categorías</span>
        </div>
      </div>

      <div className="admin-section-head">
        <h3>Tus publicaciones</h3>
        <button className="btn-primary" onClick={onNew}>
          <Icon.plus /> Nuevo caso
        </button>
      </div>

      {userCases.length === 0 ? (
        <div className="admin-empty">
          <p>Aún no has publicado casos. Empieza subiendo tu primer hallazgo ecográfico.</p>
          <button className="btn-primary" onClick={onNew}>
            {Icon.plus()} Publicar primero
          </button>
        </div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th></th>
              <th>Título</th>
              <th>Categoría</th>
              <th>Tipo</th>
              <th>Fecha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {userCases.map((c) => {
              const cat = CATEGORIES.find((x) => x.id === c.category);
              const mediaLabel = c.media ? c.media.kind.toUpperCase() : "Sintético";
              return (
                <tr key={c.id}>
                  <td>
                    <div className="admin-thumb">
                      {c.media?.kind === "video" ? (
                        <video src={c.media.src} muted />
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
                  <td className="admin-title-cell">{c.title}</td>
                  <td>{cat?.label}</td>
                  <td>
                    <span className="admin-pill">{mediaLabel}</span>
                  </td>
                  <td className="admin-date">{c.date}</td>
                  <td className="admin-actions-cell">
                    <button className="icon-btn" onClick={() => onEdit(c)} aria-label="Editar">
                      {Icon.edit()}
                    </button>
                    <button
                      className="icon-btn icon-btn-danger"
                      onClick={() => onDelete(c)}
                      aria-label="Mover a papelera"
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
            <h3>Papelera</h3>
            <span className="admin-trash-count">
              {trashedCases.length} eliminado{trashedCases.length === 1 ? "" : "s"}
            </span>
          </div>
          <table className="admin-table admin-table-trash">
            <thead>
              <tr>
                <th>Título</th>
                <th>Eliminado</th>
                <th>Por</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trashedCases.map((c) => (
                <tr key={c.id}>
                  <td className="admin-title-cell">
                    <span className="admin-trash-title">{c.title}</span>
                  </td>
                  <td className="admin-date">{formatDateTime(c.deletedAt)}</td>
                  <td className="admin-date">{c.deletedBy || "—"}</td>
                  <td className="admin-actions-cell">
                    <button
                      className="btn-ghost"
                      onClick={() => onRestore(c)}
                      style={{ marginRight: 6 }}
                    >
                      Restaurar
                    </button>
                    <button
                      className="icon-btn icon-btn-danger"
                      onClick={() => onPurge(c)}
                      aria-label="Eliminar definitivamente"
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
            <h3>Papelera de importados</h3>
            <span className="admin-trash-count">
              {trashedImports.length} eliminado{trashedImports.length === 1 ? "" : "s"}
            </span>
          </div>
          {/* Twitter-imported cases the admin soft-deleted from the
              classifier. Restored via `clearOverride`-on-deletedAt so
              any other admin edits to the case (category, title,
              reviewed flag) survive the round trip. */}
          <table className="admin-table admin-table-trash">
            <thead>
              <tr>
                <th>Título</th>
                <th>Eliminado</th>
                <th>Por</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trashedImports.map((c) => (
                <tr key={c.id}>
                  <td className="admin-title-cell">
                    <span className="admin-trash-title">{c.title}</span>
                  </td>
                  <td className="admin-date">{formatDateTime(c.deletedAt)}</td>
                  <td className="admin-date">{c.deletedBy || "—"}</td>
                  <td className="admin-actions-cell">
                    <button
                      className="btn-ghost"
                      onClick={() => onRestoreImport(c)}
                      style={{ marginRight: 6 }}
                    >
                      Restaurar
                    </button>
                    {onPurgeImport && (
                      <button
                        className="icon-btn icon-btn-danger"
                        onClick={() => onPurgeImport(c)}
                        aria-label="Eliminar definitivamente"
                        title="Eliminar definitivamente · borra metadata y archivo del blob store"
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
