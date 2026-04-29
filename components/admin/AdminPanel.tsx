"use client";

import { useState } from "react";
import { CineLoop } from "../cine";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import type { CaseRecord, Category } from "@/lib/types";
import ClassifierBoard from "./ClassifierBoard";
import CategoriesEditor from "./CategoriesEditor";
import BackupPanel from "./BackupPanel";

interface Props {
  allCases: CaseRecord[];
  userCases: CaseRecord[];
  trashedCases: CaseRecord[];
  /**
   * Soft-deleted seed/imported cases. Stored as `deletedAt` overrides
   * so the deletion is reversible without mutating the source list.
   * Optional — `undefined` collapses the section.
   */
  trashedImports?: CaseRecord[];
  onEdit: (c: CaseRecord) => void;
  onDelete: (c: CaseRecord) => void;
  onRestore: (c: CaseRecord) => void;
  onPurge: (c: CaseRecord) => void;
  /** Restore a soft-deleted import (drops the `deletedAt` override). */
  onRestoreImport?: (c: CaseRecord) => void;
  onNew: () => void;
  /**
   * Apply a partial override to any case. Used by the bulk classifier
   * board to reassign section/category/reviewed without round-tripping
   * through the full edit form.
   */
  onPatch?: (id: string, patch: Partial<CaseRecord>) => void;
  /** Categories list (built-in + custom). Optional — when omitted we
   *  fall back to the built-in `CATEGORIES` so `AdminPanel` still
   *  renders sensibly under tests / older callers. */
  categories?: Category[];
  /** Cases-per-category counter for the editor's "in use" badge. */
  categoryCaseCounts?: Record<string, number>;
  onAddCategory?: (label: string) => Category | null;
  onRenameCategory?: (id: string, label: string) => boolean;
  onRemoveCategory?: (id: string) => boolean;
  isCustomCategory?: (id: string) => boolean;
  /** Email of the current admin — tagged inside backup envelopes. */
  currentEmail?: string | null;
  /** Toast surface for backup feedback ("Exportado · 47 cambios"). */
  notify?: (msg: string) => void;
}

type Tab = "mine" | "classify" | "categories" | "backup";

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

export default function AdminPanel({
  allCases,
  userCases,
  trashedCases,
  trashedImports,
  onEdit,
  onDelete,
  onRestore,
  onPurge,
  onRestoreImport,
  onNew,
  onPatch,
  categories,
  categoryCaseCounts,
  onAddCategory,
  onRenameCategory,
  onRemoveCategory,
  isCustomCategory,
  currentEmail,
  notify,
}: Props) {
  // Falls back to built-in CATEGORIES when the parent doesn't pass a
  // managed list (older callers, focused tests). The classifier still
  // renders the standard 8 in that case.
  const resolvedCategories = categories ?? CATEGORIES;
  const canEditCategories = Boolean(
    onAddCategory && onRenameCategory && onRemoveCategory && isCustomCategory,
  );
  // Tab state: defaults to "Mis casos" so the existing flow is the
  // landing page; the classifier is one click away. State is local —
  // this isn't worth pushing into the URL.
  const [tab, setTab] = useState<Tab>("mine");

  // Counts feed the tab badges so the admin sees how much queue
  // is left without opening the panel.
  const unclassifiedCount = allCases.filter((c) => c.tags.includes("Sin clasificar")).length;

  return (
    <div className="admin-panel">
      <div className="admin-tabs" role="tablist" aria-label="Vistas admin">
        <button
          role="tab"
          aria-selected={tab === "mine"}
          className={`admin-tab${tab === "mine" ? " is-active" : ""}`}
          onClick={() => setTab("mine")}
        >
          Mis casos
        </button>
        {onPatch && (
          <button
            role="tab"
            aria-selected={tab === "classify"}
            className={`admin-tab${tab === "classify" ? " is-active" : ""}`}
            onClick={() => setTab("classify")}
          >
            Clasificar
            {unclassifiedCount > 0 && <span className="admin-tab-count">{unclassifiedCount}</span>}
          </button>
        )}
        {canEditCategories && (
          <button
            role="tab"
            aria-selected={tab === "categories"}
            className={`admin-tab${tab === "categories" ? " is-active" : ""}`}
            onClick={() => setTab("categories")}
          >
            Categorías
            <span className="admin-tab-count">{resolvedCategories.length}</span>
          </button>
        )}
        <button
          role="tab"
          aria-selected={tab === "backup"}
          className={`admin-tab${tab === "backup" ? " is-active" : ""}`}
          onClick={() => setTab("backup")}
        >
          Backup
        </button>
      </div>

      {tab === "classify" && onPatch ? (
        <ClassifierBoard
          cases={allCases}
          categories={resolvedCategories}
          onPatch={onPatch}
          onOpenEdit={onEdit}
          onDelete={onDelete}
        />
      ) : tab === "categories" && canEditCategories ? (
        <CategoriesEditor
          categories={resolvedCategories}
          onAdd={onAddCategory!}
          onRename={onRenameCategory!}
          onRemove={onRemoveCategory!}
          isCustom={isCustomCategory!}
          caseCounts={categoryCaseCounts ?? {}}
        />
      ) : tab === "backup" ? (
        <BackupPanel currentEmail={currentEmail ?? null} notify={notify ?? (() => {})} />
      ) : (
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
                            <img src={c.media.src} alt="" />
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
                  classifier. Restored via `clearOverride`-on-deletedAt
                  so any other admin edits to the case (category,
                  title, reviewed flag) survive the round trip. */}
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
                        <button className="btn-ghost" onClick={() => onRestoreImport(c)}>
                          Restaurar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
}
