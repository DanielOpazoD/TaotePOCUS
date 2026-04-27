"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import { Header } from "./chrome";
import { CaseCard } from "./cards";
import { CaseModal, AuthModal } from "./modals";
import { CATEGORIES, SEED_CASES } from "@/lib/data";
import { repo } from "@/lib/repo";
import { isAuthError } from "@/lib/errors";
import { derivePageHead } from "@/lib/headers";
import { useViewState } from "@/hooks/useViewState";
import type { CaseRecord, User } from "@/lib/types";

// These views are only needed when the user opens a modal or enters the
// admin path. Loading them lazily keeps the public bundle small and
// improves first-paint on the home grid.
const AdminPanel = dynamic(() => import("./admin/AdminPanel"), { ssr: false });
const CaseForm = dynamic(() => import("./admin/CaseForm"), { ssr: false });
const PresentationMode = dynamic(() => import("./cine/PresentationMode"), { ssr: false });
const ConfirmDialog = dynamic(() => import("./modals/ConfirmDialog"), { ssr: false });
const FeaturedRow = dynamic(() => import("./cards/FeaturedRow"));
const MobileDrawer = dynamic(() => import("./chrome/MobileDrawer"), { ssr: false });

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

  // Hydration-only state. Everything view-shaped lives in the URL.
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
  const [userCases, setUserCases] = useState<CaseRecord[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<CaseRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CaseRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await repo.auth.current();
      if (cancelled) return;
      const [f, uc] = await Promise.all([repo.favs.list(u?.email), repo.cases.listUserRaw()]);
      if (cancelled) return;
      setUser(u);
      setFavs(f);
      setUserCases(uc);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-validate session when the tab regains focus. If it expired while
  // the user was away, log them out cleanly instead of letting them
  // perform actions with a dead session.
  useEffect(() => {
    if (!hydrated) return;
    const onFocus = async () => {
      const fresh = await repo.auth.current();
      if (!fresh && user) {
        setUser(null);
        showToast("Tu sesión expiró");
      } else if (fresh && fresh.email !== user?.email) {
        setUser(fresh);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [hydrated, user]);

  useEffect(() => {
    if (!hydrated) return;
    repo.favs.list(user?.email).then(setFavs);
  }, [user, hydrated]);

  const isAdmin = user?.role === "admin";
  // userCases holds the raw list (including soft-deleted). Public-facing
  // computations filter them out; the AdminPanel trash view sees them.
  const liveUserCases = useMemo(() => userCases.filter((c) => !c.deletedAt), [userCases]);
  const trashedUserCases = useMemo(() => userCases.filter((c) => c.deletedAt), [userCases]);
  const allCases = useMemo<CaseRecord[]>(() => [...liveUserCases, ...SEED_CASES], [liveUserCases]);

  const scopedCases = useMemo(() => {
    if (view.kind === "favs") return allCases.filter((c) => favs.includes(c.id));
    if (view.kind === "section")
      return allCases.filter((c) => (c.section || "atlas") === view.section);
    return allCases;
  }, [allCases, view, favs]);

  const sectionCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    scopedCases.forEach((c) => {
      counts[c.category] = (counts[c.category] || 0) + 1;
    });
    return CATEGORIES.filter((c) => counts[c.id] > 0).map((c) => ({
      ...c,
      count: counts[c.id],
    }));
  }, [scopedCases]);

  const sectionTags = useMemo(() => {
    const counts: Record<string, number> = {};
    scopedCases.forEach((c) =>
      c.tags.forEach((t) => {
        counts[t] = (counts[t] || 0) + 1;
      }),
    );
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  }, [scopedCases]);

  const filtered = useMemo(() => {
    let list = scopedCases.slice();
    if (cat) list = list.filter((c) => c.category === cat);
    if (tags.length) list = list.filter((c) => tags.every((t) => c.tags.includes(t)));
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.diagnosis.toLowerCase().includes(q) ||
          c.findings.toLowerCase().includes(q) ||
          c.tags.join(" ").toLowerCase().includes(q) ||
          c.author.toLowerCase().includes(q),
      );
    }
    if (sort === "recent") list.sort((a, b) => b.date.localeCompare(a.date));
    if (sort === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "featured") list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    return list;
  }, [scopedCases, cat, tags, query, sort]);

  const openCase = useMemo<CaseRecord | null>(
    () => (openCaseId ? (allCases.find((c) => c.id === openCaseId) ?? null) : null),
    [allCases, openCaseId],
  );

  const presentingCase = useMemo<CaseRecord | null>(
    () => (presentingId ? (allCases.find((c) => c.id === presentingId) ?? null) : null),
    [allCases, presentingId],
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const onLogin = async (input: { email: string; password: string; name?: string }) => {
    try {
      const u = await repo.auth.login(input.email, input.password, input.name);
      setUser(u);
      setAuthOpen(false);
      showToast(`Hola, ${u.name.split(" ")[0]} 👋`);
      return { ok: true as const };
    } catch (e) {
      // Surface a typed AuthError to the modal. We import the class
      // lazily via isAuthError so the boundary stays narrow.
      if (isAuthError(e)) return { ok: false as const, code: e.code, message: e.userMessage };
      return {
        ok: false as const,
        code: "unknown" as const,
        message: "No se pudo iniciar sesión.",
      };
    }
  };

  const onLogout = async () => {
    await repo.auth.logout();
    setUser(null);
    showToast("Sesión cerrada");
  };

  const toggleFav = async (id: string) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    const { result, next } = await repo.favs.toggle(user.email, id, favs);
    if (!result.ok) {
      showToast("No se pudo guardar el favorito.");
      return;
    }
    setFavs(next);
  };

  const onShare = (c: CaseRecord) => {
    const url = `${location.origin}${location.pathname}?caso=${c.id}`;
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
    showToast("Enlace copiado");
  };

  const refreshUserCases = async () => {
    // We hold the *raw* list so soft-deleted cases reach the AdminPanel
    // trash view. Public flows filter them out via `isDeleted`.
    setUserCases(await repo.cases.listUserRaw());
  };

  const onSaveCase = async (data: CaseRecord) => {
    const result = await repo.cases.save(data, userCases);
    if (!result.ok) {
      showToast(
        result.reason === "quota"
          ? "Sin espacio. Borra casos antiguos o sube archivos más livianos."
          : "No se pudo guardar el caso.",
      );
      return;
    }
    await refreshUserCases();
    showToast(editingCase?.id ? "Caso actualizado" : "Caso publicado");
    setFormOpen(false);
    setEditingCase(null);
  };

  const onDeleteCase = (c: CaseRecord) => setPendingDelete(c);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const result = await repo.cases.remove(pendingDelete.id, userCases, user?.email);
    setPendingDelete(null);
    if (!result.ok) {
      showToast("No se pudo eliminar el caso.");
      return;
    }
    await refreshUserCases();
    showToast("Caso eliminado · puedes restaurarlo desde Papelera");
  };

  const onRestoreCase = async (c: CaseRecord) => {
    const result = await repo.cases.restore(c.id, userCases);
    if (!result.ok) {
      showToast("No se pudo restaurar el caso.");
      return;
    }
    await refreshUserCases();
    showToast("Caso restaurado");
  };

  const onPurgeCase = async (c: CaseRecord) => {
    const result = await repo.cases.purge(c.id, userCases);
    if (!result.ok) {
      showToast("No se pudo eliminar definitivamente.");
      return;
    }
    await refreshUserCases();
    showToast("Caso eliminado permanentemente");
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
        onLogout={onLogout}
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
        onLogout={onLogout}
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
        />

        <main className="main" id="main">
          <div className="section-head">
            <div>
              <div className="crumb">
                <span>Taote POCUS</span>
                <span className="crumb-dot"></span>
                <span>{head.crumb}</span>
              </div>
              <h1>{head.title}</h1>
              <p>{head.sub}</p>
            </div>
          </div>
          <div className="toolbar">
            <span className="results">
              {filtered.length} {filtered.length === 1 ? "caso" : "casos"}
            </span>
            {(tags.length > 0 || query) && (
              <button className="clear-btn" onClick={() => replacePatch({ tags: [], query: "" })}>
                Limpiar filtros
              </button>
            )}
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
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--ink-mute)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Ordenar
              </span>
              <select
                className="sort-select"
                value={sort}
                onChange={(e) =>
                  replacePatch({ sort: e.target.value as "recent" | "title" | "featured" })
                }
              >
                <option value="recent">Más recientes</option>
                <option value="featured">Destacados</option>
                <option value="title">Alfabético</option>
              </select>
            </div>
          </div>
          {view.kind === "section" && !cat && tags.length === 0 && !query.trim() && (
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
              userCases={liveUserCases}
              trashedCases={trashedUserCases}
              onEdit={onEditCase}
              onDelete={onDeleteCase}
              onRestore={onRestoreCase}
              onPurge={onPurgeCase}
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
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {toast || ""}
      </div>
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
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onLogin={onLogin} />}
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
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
