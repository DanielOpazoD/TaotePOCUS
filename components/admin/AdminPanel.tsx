"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/data";
import type { CaseRecord, Category, SectionId } from "@/lib/types";
import ClassifierBoard from "./ClassifierBoard";
import CategoriesEditor from "./CategoriesEditor";
import SectionsEditor from "./SectionsEditor";
import BackupPanel from "./BackupPanel";
import BulkEditTable, { BulkEditTagSuggestions } from "./BulkEditTable";
import ActivityPanel from "./ActivityPanel";
import { MinePanel } from "./MinePanel";

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
  /** Permanent-delete an imported case (irreversible). The handler
   *  is responsible for the confirm-dialog flow + extracting the
   *  blob key from `c.media.src` to pass to the repo. */
  onPurgeImport?: (c: CaseRecord) => void;
  onNew: () => void;
  /**
   * Apply a partial override to any case. Used by the bulk classifier
   * board to reassign section/category/reviewed without round-tripping
   * through the full edit form.
   */
  onPatch?: (id: string, patch: Partial<CaseRecord>) => void;
  /** Apply the same patch to many cases at once. Used by the
   *  classifier's multi-select bulk action bar. */
  onBulkPatch?: (ids: string[], patch: Partial<CaseRecord>) => void;
  /** Soft-delete every selected case at once. */
  onBulkSoftDelete?: (ids: string[]) => void;
  /** Categories list (built-in + custom). Optional — when omitted we
   *  fall back to the built-in `CATEGORIES` so `AdminPanel` still
   *  renders sensibly under tests / older callers. */
  categories?: Category[];
  /** Cases-per-category counter for the editor's "in use" badge. */
  categoryCaseCounts?: Record<string, number>;
  onAddCategory?: (label: string) => Promise<Category | null>;
  onRenameCategory?: (id: string, label: string) => Promise<boolean>;
  onRemoveCategory?: (id: string) => Promise<boolean>;
  isCustomCategory?: (id: string) => boolean;
  isCategoryHidden?: (id: string) => boolean;
  onSetCategoryHidden?: (id: string, hidden: boolean) => void;
  /** Predicate / setter for section visibility on the public nav.
   *  Drives the new "Secciones" tab. Optional — when omitted, the
   *  tab simply doesn't render (keeps focused tests minimal). */
  isSectionHidden?: (id: SectionId) => boolean;
  onSetSectionHidden?: (id: SectionId, hidden: boolean) => void;
  /** Resolve the user-facing label for a section (override or
   *  default). When omitted the editor shows the static defaults. */
  getSectionLabel?: (id: SectionId, fallback: string) => string;
  /** Apply a label override. Empty string clears the override. */
  onSetSectionLabel?: (id: SectionId, label: string) => void;
  /** Cases-per-section counter, used by the Secciones editor's
   *  "N casos" hint. Optional; missing entries render as 0. */
  sectionCaseCounts?: Record<string, number>;
  /** Email of the current admin — tagged inside backup envelopes. */
  currentEmail?: string | null;
  /** Toast surface for backup feedback ("Exportado · 47 cambios"). */
  notify?: (msg: string) => void;
}

type Tab = "mine" | "classify" | "edit" | "categories" | "sections" | "activity" | "backup";

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
  onPurgeImport,
  onNew,
  onPatch,
  onBulkPatch,
  onBulkSoftDelete,
  categories,
  categoryCaseCounts,
  onAddCategory,
  onRenameCategory,
  onRemoveCategory,
  isCustomCategory,
  isCategoryHidden,
  onSetCategoryHidden,
  isSectionHidden,
  onSetSectionHidden,
  getSectionLabel,
  onSetSectionLabel,
  sectionCaseCounts,
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
  const canEditSections = Boolean(isSectionHidden && onSetSectionHidden);
  // Tab state: defaults to "Mis casos" so the existing flow is the
  // landing page; the classifier is one click away. State is local —
  // this isn't worth pushing into the URL.
  const [tab, setTab] = useState<Tab>("mine");

  // Counts feed the tab badges so the admin sees how much queue
  // is left without opening the panel. The "Sin clasificar" marker
  // is bilingual at the data layer but only checked in the ES slot
  // because that's the slot the importer writes to.
  const unclassifiedCount = allCases.filter((c) => c.tags.es.includes("Sin clasificar")).length;

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
        {onPatch && onBulkPatch && onBulkSoftDelete && (
          <button
            role="tab"
            aria-selected={tab === "edit"}
            className={`admin-tab${tab === "edit" ? " is-active" : ""}`}
            onClick={() => setTab("edit")}
            title="Editar título / descripción / etiquetas en lote"
          >
            Edición
            <span className="admin-tab-count">{allCases.length}</span>
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
        {canEditSections && (
          <button
            role="tab"
            aria-selected={tab === "sections"}
            className={`admin-tab${tab === "sections" ? " is-active" : ""}`}
            onClick={() => setTab("sections")}
          >
            Secciones
          </button>
        )}
        <button
          role="tab"
          aria-selected={tab === "activity"}
          className={`admin-tab${tab === "activity" ? " is-active" : ""}`}
          onClick={() => setTab("activity")}
          title="Registro append-only de acciones admin"
        >
          Actividad
        </button>
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
          onBulkPatch={onBulkPatch}
          onBulkSoftDelete={onBulkSoftDelete}
          onOpenEdit={onEdit}
          onDelete={onDelete}
          onPurge={onPurgeImport}
        />
      ) : tab === "edit" && onPatch && onBulkPatch && onBulkSoftDelete ? (
        <>
          <BulkEditTable
            cases={allCases}
            categories={resolvedCategories}
            onPatch={onPatch}
            onBulkPatch={onBulkPatch}
            onBulkSoftDelete={onBulkSoftDelete}
            onOpenEdit={onEdit}
            onDelete={onDelete}
          />
          <BulkEditTagSuggestions />
        </>
      ) : tab === "categories" && canEditCategories ? (
        <CategoriesEditor
          categories={resolvedCategories}
          onAdd={onAddCategory!}
          onRename={onRenameCategory!}
          onRemove={onRemoveCategory!}
          isCustom={isCustomCategory!}
          isHidden={isCategoryHidden ?? (() => false)}
          setHidden={onSetCategoryHidden ?? (() => undefined)}
          caseCounts={categoryCaseCounts ?? {}}
        />
      ) : tab === "sections" && canEditSections ? (
        <SectionsEditor
          isHidden={isSectionHidden!}
          setHidden={onSetSectionHidden!}
          getLabel={getSectionLabel ?? ((_id, fallback) => fallback)}
          setLabel={onSetSectionLabel ?? (() => undefined)}
          caseCounts={sectionCaseCounts ?? {}}
        />
      ) : tab === "activity" ? (
        <ActivityPanel />
      ) : tab === "backup" ? (
        <BackupPanel currentEmail={currentEmail ?? null} notify={notify ?? (() => {})} />
      ) : (
        <MinePanel
          allCases={allCases}
          userCases={userCases}
          trashedCases={trashedCases}
          trashedImports={trashedImports}
          onEdit={onEdit}
          onDelete={onDelete}
          onRestore={onRestore}
          onPurge={onPurge}
          onRestoreImport={onRestoreImport}
          onPurgeImport={onPurgeImport}
          onNew={onNew}
        />
      )}
    </div>
  );
}
