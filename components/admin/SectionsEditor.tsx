"use client";

import { SECTIONS } from "@/lib/data";
import type { SectionId } from "@/lib/types";

interface Props {
  /** Predicate — is this section currently hidden from the public nav? */
  isHidden: (id: SectionId) => boolean;
  /** Toggle visibility for a single section. Persisted via the
   *  `useHiddenSections` hook in App.tsx. */
  setHidden: (id: SectionId, hidden: boolean) => void;
  /** Cases-per-section counter, indexed by section id. Surfaces a
   *  small "N casos" hint per row so the admin sees what they're
   *  hiding before clicking. */
  caseCounts: Record<string, number>;
}

/**
 * Admin UI for toggling section visibility on the public nav rails
 * (Header + MobileDrawer). Mirrors the visual rhythm of
 * `CategoriesEditor` — same `.categories-row` styling, same eye / 🚫
 * toggle, same "is-hidden" muting — so the two editors feel like
 * sister surfaces.
 *
 * Hiding a section here removes it from the top nav and the mobile
 * drawer, but the URL still resolves: deep links keep working and the
 * admin can browse a hidden section directly. Use `Eliminar` from a
 * case modal if you want to actually remove content; this is purely
 * a visibility toggle for the catalog.
 */
export default function SectionsEditor({ isHidden, setHidden, caseCounts }: Props) {
  return (
    <div className="categories-editor">
      <div className="categories-intro">
        <h2>Secciones</h2>
        <p>
          Las secciones ocultas no aparecen en el menú superior ni en el cajón móvil. Los enlaces
          directos siguen funcionando, así que un caso compartido por URL se abre igual aunque su
          sección esté oculta. Útil para retirar del nav una sección que aún no está lista para
          publicarse.
        </p>
      </div>

      <ul className="categories-list">
        {SECTIONS.map((s) => {
          const hidden = isHidden(s.id);
          const count = caseCounts[s.id] ?? 0;
          return (
            <li key={s.id} className={`categories-row${hidden ? " is-hidden" : ""}`}>
              <span className="categories-row-label">{s.label}</span>
              <span className="categories-row-id">{s.id}</span>
              <span className="categories-row-count">
                {count} caso{count === 1 ? "" : "s"}
              </span>
              <span className="categories-row-actions">
                <button
                  type="button"
                  className={`categories-visibility-toggle${hidden ? " is-hidden" : ""}`}
                  onClick={() => setHidden(s.id, !hidden)}
                  aria-label={
                    hidden ? `Mostrar ${s.label} en el menú` : `Ocultar ${s.label} del menú`
                  }
                  aria-pressed={!hidden}
                  title={
                    hidden
                      ? "Oculta en el menú público — click para mostrar"
                      : "Visible en el menú público — click para ocultar"
                  }
                >
                  {hidden ? "🚫" : "👁"}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
