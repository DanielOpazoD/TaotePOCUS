"use client";

import { Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import { Header } from "./chrome";
import { CaseCard } from "./cards";
import { CaseModal, AuthModal } from "./modals";
import { SEED_CASES } from "@/lib/data";
import { CategoryGlyph } from "@/lib/icons";
import { derivePageHead } from "@/lib/headers";
import type { CaseRecord } from "@/lib/types";
import type { SortOrder } from "@/lib/url";
import { useViewState } from "@/hooks/useViewState";
import { useToast } from "@/hooks/useToast";
import { useSession } from "@/hooks/useSession";
import { useFavs } from "@/hooks/useFavs";
import { useUserCases } from "@/hooks/useUserCases";
import { useCaseFilters } from "@/hooks/useCaseFilters";
import { useShortcuts } from "@/hooks/useShortcuts";

// Lazy-loaded subtrees: needed only on a specific path or when a modal
// opens. Keeping them out of the initial bundle preserves first-paint
// on the home grid (audit §9).
const AdminPanel = dynamic(() => import("./admin/AdminPanel"), { ssr: false });
const CaseForm = dynamic(() => import("./admin/CaseForm"), { ssr: false });
const PresentationMode = dynamic(() => import("./cine/PresentationMode"), { ssr: false });
const ConfirmDialog = dynamic(() => import("./modals/ConfirmDialog"), { ssr: false });
const FeaturedRow = dynamic(() => import("./cards/FeaturedRow"));
const MobileDrawer = dynamic(() => import("./chrome/MobileDrawer"), { ssr: false });
const ShortcutsModal = dynamic(() => import("./modals/ShortcutsModal"), { ssr: false });

export default function App() {
  return (
    <Suspense fallback={null}>
      <AppInner />
    </Suspense>
  );
}

function AppInner() {
  const {
    view,
    cat,
    tags,
    query,
    sort,
    caso: openCaseId,
    presenting: presentingId,
    level,
    spec,
    pushPatch,
    replacePatch,
  } = useViewState();

  // Cross-cutting state owned by hooks. Each one is a small, named
  // responsibility — see `hooks/use*.ts` for behavior.
  const { toast, showToast } = useToast();
  const { user, isAdmin, hydrated, login, logout } = useSession({ notify: showToast });
  const [authOpen, setAuthOpen] = useState(false);
  const { favs, toggle: toggleFav } = useFavs(user, hydrated, {
    onAnonymous: () => setAuthOpen(true),
    notify: showToast,
  });
  const userCases = useUserCases(user, hydrated, { notify: showToast });

  // Truly transient UI state. None of this belongs in the URL.
  const [editingCase, setEditingCase] = useState<CaseRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CaseRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [clearShaking, setClearShaking] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Global keyboard shortcuts. The hook installs window listeners for
  // j/k, g+letter and `?`. The `/` shortcut for the search box lives
  // in the Header, co-located with the input it focuses.
  useShortcuts({ onHelp: () => setShortcutsOpen(true) });

  // Combined case list for public flows. AdminPanel sees `userCases.live`
  // and `userCases.trashed` separately.
  const allCases = useMemo<CaseRecord[]>(
    () => [...userCases.live, ...SEED_CASES],
    [userCases.live],
  );

  const { scopedCases, sectionCategories, sectionTags, sectionSpecialties, filtered } =
    useCaseFilters({
      allCases,
      favs,
      view,
      cat,
      tags,
      query,
      sort,
      level,
      spec,
    });

  const openCase = useMemo<CaseRecord | null>(
    () => (openCaseId ? (allCases.find((c) => c.id === openCaseId) ?? null) : null),
    [allCases, openCaseId],
  );
  const presentingCase = useMemo<CaseRecord | null>(
    () => (presentingId ? (allCases.find((c) => c.id === presentingId) ?? null) : null),
    [allCases, presentingId],
  );

  const onShare = (c: CaseRecord) => {
    const url = `${location.origin}${location.pathname}?caso=${c.id}`;
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
    showToast("Enlace copiado");
  };

  const onSaveCase = async (data: CaseRecord) => {
    const ok = await userCases.save(data, { isUpdate: !!editingCase?.id });
    if (!ok) return;
    setFormOpen(false);
    setEditingCase(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await userCases.remove(pendingDelete);
    setPendingDelete(null);
  };

  const onNewCase = () => {
    setEditingCase(null);
    setFormOpen(true);
  };
  const onEditCase = (c: CaseRecord) => {
    setEditingCase(c);
    setFormOpen(true);
  };

  const head = derivePageHead(view, cat);

  return (
    <>
      <a href="#main" className="skip-to-content">
        Saltar al contenido
      </a>
      <Header
        user={user}
        onLogin={() => setAuthOpen(true)}
        onLogout={logout}
        query={query}
        setQuery={(q) => replacePatch({ query: q })}
        view={view}
        favCount={favs.length}
        onNewCase={onNewCase}
        onOpenDrawer={() => setDrawerOpen(true)}
      />
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        view={view}
        user={user}
        onLogin={() => setAuthOpen(true)}
        onLogout={logout}
        favCount={favs.length}
        onNewCase={onNewCase}
      />

      <div className="layout" data-section={view.kind === "section" ? view.section : view.kind}>
        <Sidebar
          activeCat={cat}
          setActiveCat={(c) => {
            if (view.kind === "favs")
              replacePatch({ view: { kind: "section", section: "atlas" }, cat: c });
            else replacePatch({ cat: c });
          }}
          activeTags={tags}
          toggleTag={(t) =>
            replacePatch({ tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] })
          }
          totalCount={scopedCases.length}
          categories={sectionCategories}
          tags={sectionTags}
          level={level}
          setLevel={(l) => replacePatch({ level: l })}
          spec={spec}
          setSpec={(s) => replacePatch({ spec: s })}
          specialties={sectionSpecialties}
        />

        <main className="main" id="main" tabIndex={-1}>
          <div className="section-head">
            <div>
              <div className="crumb">
                <span>Taote POCUS</span>
                <span className="crumb-dot"></span>
                <span>{head.crumb}</span>
                {cat && (
                  <span className="crumb-glyph" aria-hidden="true">
                    {CategoryGlyph[cat] ?? null}
                  </span>
                )}
              </div>
              <h1>{head.title}</h1>
              <p>{head.sub}</p>
            </div>
          </div>
          <div className="toolbar">
            <span className="results">
              {filtered.length} {filtered.length === 1 ? "caso" : "casos"}
            </span>
            <button
              className={`clear-btn${clearShaking ? " is-shaking" : ""}`}
              disabled={tags.length === 0 && !query && !level && !spec}
              onClick={() => {
                if (tags.length === 0 && !query && !level && !spec) {
                  // Wink — nothing to clear, but the user clicked anyway.
                  setClearShaking(true);
                  setTimeout(() => setClearShaking(false), 400);
                  return;
                }
                replacePatch({ tags: [], query: "", level: null, spec: null });
              }}
            >
              Limpiar filtros
            </button>
            {tags.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {tags.map((t) => (
                  <button
                    key={t}
                    className="tag-chip active"
                    onClick={() => replacePatch({ tags: tags.filter((x) => x !== t) })}
                  >
                    {t} ×
                  </button>
                ))}
              </div>
            )}
            <div className="toolbar-right">
              <label htmlFor="sort-select" className="toolbar-label">
                Ordenar
              </label>
              <select
                id="sort-select"
                className="sort-select"
                value={sort}
                onChange={(e) => replacePatch({ sort: e.target.value as SortOrder })}
              >
                <option value="recent">Más recientes</option>
                <option value="featured">Destacados</option>
                <option value="title">Alfabético</option>
              </select>
            </div>
          </div>
          {view.kind === "section" &&
            !cat &&
            tags.length === 0 &&
            !query.trim() &&
            !level &&
            !spec && (
              <FeaturedRow
                cases={scopedCases}
                favs={favs}
                onOpen={(c) => pushPatch({ caso: c.id })}
                onFav={toggleFav}
              />
            )}
          {view.kind === "admin" && isAdmin ? (
            <AdminPanel
              allCases={allCases}
              userCases={userCases.live}
              trashedCases={userCases.trashed}
              onEdit={onEditCase}
              onDelete={(c) => setPendingDelete(c)}
              onRestore={userCases.restore}
              onPurge={userCases.purge}
              onNew={onNewCase}
            />
          ) : filtered.length === 0 ? (
            <div className="empty">
              <h3>{view.kind === "favs" ? "Aún no has guardado casos" : "Sin resultados"}</h3>
              <p>
                {view.kind === "favs"
                  ? "Toca el corazón en cualquier caso para añadirlo a tu colección."
                  : "Prueba quitando filtros o buscando por otra palabra."}
              </p>
            </div>
          ) : (
            <div className="case-grid">
              {filtered.map((c) => (
                <CaseCard
                  key={c.id}
                  caso={c}
                  isFav={favs.includes(c.id)}
                  onFav={() => toggleFav(c.id)}
                  onOpen={() => pushPatch({ caso: c.id })}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Toast lives here twice on purpose: the visible chip is the
          chrome animation; the sr-only mirror is announced by screen
          readers via aria-live. They share the same string. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {toast || ""}
      </div>
      {toast && <div className="toast">{toast}</div>}

      {openCase && (
        <CaseModal
          caso={openCase}
          onClose={() => replacePatch({ caso: null })}
          isFav={favs.includes(openCase.id)}
          onFav={() => toggleFav(openCase.id)}
          onShare={() => onShare(openCase)}
          onPresent={() => replacePatch({ caso: null, presenting: openCase.id })}
        />
      )}
      {presentingCase && (
        <PresentationMode
          cases={filtered.length > 0 ? filtered : allCases}
          startId={presentingCase.id}
          onClose={() => replacePatch({ presenting: null })}
        />
      )}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onLogin={login} />}
      {formOpen && (
        <CaseForm
          initial={editingCase}
          currentUser={user}
          onCancel={() => {
            setFormOpen(false);
            setEditingCase(null);
          }}
          onSave={onSaveCase}
        />
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete ? `¿Eliminar "${pendingDelete.title}"?` : ""}
        message="El caso se mueve a la Papelera y puedes restaurarlo desde el panel admin."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}
