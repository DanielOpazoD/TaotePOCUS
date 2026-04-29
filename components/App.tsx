"use client";

import { Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import SectionHero from "./SectionHero";
import Toolbar from "./Toolbar";
import MainGrid from "./MainGrid";
import ErrorBoundary from "./ErrorBoundary";
import { Header, Footer } from "./chrome";
import { CaseModal, AuthModal } from "./modals";
import { SEED_CASES } from "@/lib/data";
import { derivePageHead } from "@/lib/headers";
import type { CaseRecord } from "@/lib/types";
import { useViewState } from "@/hooks/useViewState";
import { useToast } from "@/hooks/useToast";
import { useSession } from "@/hooks/useSession";
import { useFavs } from "@/hooks/useFavs";
import { useUserCases } from "@/hooks/useUserCases";
import { useCaseFilters } from "@/hooks/useCaseFilters";
import { useShortcuts } from "@/hooks/useShortcuts";
import { usePersistedState } from "@/hooks/usePersistedState";

// Lazy-loaded subtrees: needed only on a specific path or when a modal
// opens. Keeping them out of the initial bundle preserves first-paint
// on the home grid (audit §9). AdminPanel is lazy-loaded inside MainGrid
// so it doesn't appear here.
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Sidebar collapse — persisted via usePersistedState. Compact "1"/"0"
  // serialization keeps the localStorage value short and grep-friendly.
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState("sidebarCollapsed", false, {
    serialize: (v) => (v ? "1" : "0"),
    deserialize: (raw) => (raw === "1" ? true : raw === "0" ? false : undefined),
  });
  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev);

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

  const { scopedCases, sectionCategories, sectionTags, filtered } = useCaseFilters({
    allCases,
    favs,
    view,
    cat,
    tags,
    query,
    sort,
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
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
        />

        <main className="main" id="main" tabIndex={-1}>
          {/* Per-section error boundaries: a crash in the hero (sparkline,
              count-up, animation observers) doesn't take down the toolbar
              or the grid below. Each boundary logs through lib/log so
              Sentry sees the failure once it's wired. */}
          <ErrorBoundary name="hero">
            <SectionHero
              view={view}
              cat={cat}
              head={head}
              scopedCases={scopedCases}
              onOpenCase={(id) => pushPatch({ caso: id })}
            />
          </ErrorBoundary>
          <Toolbar
            count={filtered.length}
            tags={tags}
            query={query}
            sort={sort}
            onReplace={replacePatch}
          />
          {/* FeaturedRow above the grid is shown for non-atlas section
              landings. Atlas gets the bento layout below, which already
              promotes the featured case to a 2×2 hero — showing it
              twice would just be loud. */}
          {view.kind === "section" &&
            view.section !== "atlas" &&
            !cat &&
            tags.length === 0 &&
            !query.trim() && (
              <FeaturedRow
                cases={scopedCases}
                favs={favs}
                onOpen={(c) => pushPatch({ caso: c.id })}
                onFav={toggleFav}
              />
            )}
          <ErrorBoundary name="grid">
            <MainGrid
              view={view}
              cat={cat}
              tags={tags}
              query={query}
              isAdmin={isAdmin}
              filtered={filtered}
              allCases={allCases}
              userCases={userCases}
              favs={favs}
              onOpen={(c) => pushPatch({ caso: c.id })}
              onToggleFav={(c) => toggleFav(c.id)}
              onEdit={onEditCase}
              onDelete={(c) => setPendingDelete(c)}
              onNew={onNewCase}
              onClearFilters={() => replacePatch({ cat: null, tags: [], query: "" })}
              onExploreAtlas={() => replacePatch({ view: { kind: "section", section: "atlas" } })}
            />
          </ErrorBoundary>
        </main>
      </div>

      <Footer extraCases={userCases.live.length} />

      {/* Toast lives here twice on purpose: the visible chip is the
          chrome animation; the sr-only mirror is announced by screen
          readers via aria-live. They share the same string. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {toast || ""}
      </div>
      {toast && <div className="toast">{toast}</div>}

      {openCase &&
        (() => {
          // Compute nav within the current filtered set so ←/→ flips
          // through the same list the user just narrowed. If the
          // current case isn't in `filtered` (rare — opened via deep
          // link with active filters that exclude it), fall back to
          // `allCases` so navigation still works.
          const navList =
            filtered.length > 0 && filtered.some((c) => c.id === openCase.id) ? filtered : allCases;
          const idx = navList.findIndex((c) => c.id === openCase.id);
          const prev = idx > 0 ? navList[idx - 1] : null;
          const next = idx >= 0 && idx < navList.length - 1 ? navList[idx + 1] : null;
          return (
            // The modal is the most error-prone subtree (dialog API,
            // focus trap, swipe gesture, scroll listener, kbd shortcuts,
            // CineLoop canvas). If it crashes we close it via the URL
            // patch — better to drop the user back to the grid than
            // to wedge them inside a broken dialog.
            <ErrorBoundary
              name="modal"
              fallback={(error) => (
                <div className="boundary-fallback boundary-fallback--floating" role="alertdialog">
                  <div className="boundary-fallback-inner">
                    <h3>El caso no pudo abrirse</h3>
                    <p>Detalles: {error.message}</p>
                    <button
                      type="button"
                      className="boundary-fallback-retry"
                      onClick={() => replacePatch({ caso: null })}
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              )}
            >
              <CaseModal
                caso={openCase}
                onClose={() => replacePatch({ caso: null })}
                isFav={favs.includes(openCase.id)}
                onFav={() => toggleFav(openCase.id)}
                onShare={() => onShare(openCase)}
                onPresent={() => replacePatch({ caso: null, presenting: openCase.id })}
                position={idx >= 0 ? idx + 1 : undefined}
                total={navList.length}
                onPrev={prev ? () => replacePatch({ caso: prev.id }) : undefined}
                onNext={next ? () => replacePatch({ caso: next.id }) : undefined}
              />
            </ErrorBoundary>
          );
        })()}
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
