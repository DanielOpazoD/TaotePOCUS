"use client";

import { useState } from "react";
import { CATEGORIES, IMPORT_MARKER_TAG } from "@/lib/data";
import { useT } from "@/hooks/useLanguage";
import type {
  CaseRecord,
  Category,
  FocusDefaults,
  FocusValue,
  LocalizedString,
  SectionId,
} from "@/lib/types";
import ClassifierBoard from "./ClassifierBoard";
import CategoriesEditor from "./CategoriesEditor";
import SectionsEditor from "./SectionsEditor";
import BackupPanel from "./BackupPanel";
import BulkEditTable, { BulkEditTagSuggestions } from "./BulkEditTable";
import ActivityPanel from "./ActivityPanel";
import { MinePanel } from "./MinePanel";
import FocusDefaultsPanel from "./FocusDefaultsPanel";
import { AIStatusBadge } from "./ai/AIStatusBadge";

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
  /** Add / rename a custom category. Phase-3 i18n widened the label
   *  input to accept a `LocalizedString` (with optional EN slot) in
   *  addition to the legacy plain string. */
  onAddCategory?: (label: string | LocalizedString) => Promise<Category | null>;
  onRenameCategory?: (id: string, label: string | LocalizedString) => Promise<boolean>;
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
  /** Apply a label override. Empty string clears the slot. The
   *  optional `slot` arg targets the EN slot (Phase-3 i18n); ES is
   *  the default for back-compat with older callers. */
  onSetSectionLabel?: (id: SectionId, label: string, slot?: "es" | "en") => void;
  /** Raw override map — passed through to the SectionsEditor so the
   *  EN slot can render alongside the ES slot in the bilingual
   *  rename UI. Optional; falls back to "no EN override visible"
   *  when omitted. */
  sectionLabelOverrides?: Partial<Record<SectionId, LocalizedString>>;
  /** Cases-per-section counter, used by the Secciones editor's
   *  "N casos" hint. Optional; missing entries render as 0. */
  sectionCaseCounts?: Record<string, number>;
  /** Email of the current admin — tagged inside backup envelopes. */
  currentEmail?: string | null;
  /** Toast surface for backup feedback ("Exportado · 47 cambios"). */
  notify?: (msg: string) => void;
  /** Admin-managed thumbnail focus defaults. When provided alongside
   *  the four setters, the "Foco" tab renders an editor that lets the
   *  admin set a global default + per-section + per-category overrides
   *  in one place instead of touching each thumbnail. */
  focusDefaults?: FocusDefaults;
  onSetFocusGlobal?: (value: FocusValue | undefined) => void;
  onSetFocusSection?: (id: SectionId, value: FocusValue | undefined) => void;
  onSetFocusCategory?: (id: string, value: FocusValue | undefined) => void;
  onResetFocusDefaults?: () => void;
}

type Tab =
  | "mine"
  | "classify"
  | "edit"
  | "categories"
  | "sections"
  | "focus"
  | "activity"
  | "backup";

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
  sectionLabelOverrides,
  sectionCaseCounts,
  currentEmail,
  notify,
  focusDefaults,
  onSetFocusGlobal,
  onSetFocusSection,
  onSetFocusCategory,
  onResetFocusDefaults,
}: Props) {
  // Falls back to built-in CATEGORIES when the parent doesn't pass a
  // managed list (older callers, focused tests). The classifier still
  // renders the standard 8 in that case.
  const resolvedCategories = categories ?? CATEGORIES;
  const canEditCategories = Boolean(
    onAddCategory && onRenameCategory && onRemoveCategory && isCustomCategory,
  );
  const canEditSections = Boolean(isSectionHidden && onSetSectionHidden);
  const canEditFocusDefaults = Boolean(
    focusDefaults && onSetFocusGlobal && onSetFocusSection && onSetFocusCategory,
  );
  // Tab state: defaults to "Mis casos" so the existing flow is the
  // landing page; the classifier is one click away. State is local —
  // this isn't worth pushing into the URL.
  const [tab, setTab] = useState<Tab>("mine");
  const t = useT();

  // Counts feed the tab badges so the admin sees how much queue
  // is left without opening the panel. The marker (`IMPORT_MARKER_TAG`)
  // is data — the importer writes it onto `tags.es` regardless of
  // the visitor language; the badge here is just a count, the pill
  // copy comes from the i18n dictionary separately.
  const unclassifiedCount = allCases.filter((c) => c.tags.es.includes(IMPORT_MARKER_TAG)).length;

  return (
    <div className="admin-panel">
      {/* Connection status for the AI translation flows. Lives above
          the tabs so it's visible on every admin view — answers the
          "is the AI actually wired up?" question without making the
          admin open a case form to find out. */}
      <AIStatusBadge />
      <div className="admin-tabs" role="tablist" aria-label={t("admin.tabs.aria")}>
        <button
          role="tab"
          aria-selected={tab === "mine"}
          className={`admin-tab${tab === "mine" ? " is-active" : ""}`}
          onClick={() => setTab("mine")}
        >
          {t("admin.tab.mine")}
        </button>
        {onPatch && (
          <button
            role="tab"
            aria-selected={tab === "classify"}
            className={`admin-tab${tab === "classify" ? " is-active" : ""}`}
            onClick={() => setTab("classify")}
          >
            {t("admin.tab.classify")}
            {unclassifiedCount > 0 && <span className="admin-tab-count">{unclassifiedCount}</span>}
          </button>
        )}
        {onPatch && onBulkPatch && onBulkSoftDelete && (
          <button
            role="tab"
            aria-selected={tab === "edit"}
            className={`admin-tab${tab === "edit" ? " is-active" : ""}`}
            onClick={() => setTab("edit")}
            title={t("admin.tab.edit.title")}
          >
            {t("admin.tab.edit")}
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
            {t("admin.tab.categories")}
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
            {t("admin.tab.sections")}
          </button>
        )}
        {canEditFocusDefaults && (
          <button
            role="tab"
            aria-selected={tab === "focus"}
            className={`admin-tab${tab === "focus" ? " is-active" : ""}`}
            onClick={() => setTab("focus")}
            title={t("admin.tab.focus.title")}
          >
            {t("admin.tab.focus")}
          </button>
        )}
        <button
          role="tab"
          aria-selected={tab === "activity"}
          className={`admin-tab${tab === "activity" ? " is-active" : ""}`}
          onClick={() => setTab("activity")}
          title={t("admin.tab.activity.title")}
        >
          {t("admin.tab.activity")}
        </button>
        <button
          role="tab"
          aria-selected={tab === "backup"}
          className={`admin-tab${tab === "backup" ? " is-active" : ""}`}
          onClick={() => setTab("backup")}
        >
          {t("admin.tab.backup")}
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
            notify={notify}
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
          overrides={sectionLabelOverrides}
        />
      ) : tab === "focus" && canEditFocusDefaults ? (
        <FocusDefaultsPanel
          defaults={focusDefaults!}
          categories={resolvedCategories}
          onSetGlobal={onSetFocusGlobal!}
          onSetSection={onSetFocusSection!}
          onSetCategory={onSetFocusCategory!}
          onResetAll={onResetFocusDefaults}
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
