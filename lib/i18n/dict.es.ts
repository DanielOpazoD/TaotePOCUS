// Canonical Spanish dictionary. The literal type of `DICT_ES` (via
// `as const`) defines the universe of valid translation keys; the
// English (and any future) dictionary must satisfy the same shape,
// so missing or extra keys are compile errors.
//
// Naming policy:
//   - Flat dot-namespaced keys ("nav.favoritos", "section.atlas").
//     Dots are conventional only — at the type level the key is
//     just a string literal.
//   - Group prefixes follow the rendering surface: nav.*, search.*,
//     theme.*, lang.*, section.*, category.*, drawer.*, pwa.*,
//     footer.*, brand.*, header.*.
//   - Templated strings use `{name}` placeholders. The `t()` helper
//     in `useLanguage` interpolates from a `vars` record.
//
// The strings here are the reference content. When tweaking copy
// in Spanish, update this file — the EN counterpart should mirror
// the same keys but is allowed to phrase things differently.

export const DICT_ES = {
  // ─── Brand ─────────────────────────────────────────────────────
  "brand.aria.home": "Taote POCUS — inicio",

  // ─── Navigation ────────────────────────────────────────────────
  "nav.aria.sections": "Secciones",
  "nav.favoritos": "Favoritos",
  "nav.administrar": "Administrar",
  "nav.entrar": "Entrar",
  "nav.salir": "Salir",
  "nav.menu.open": "Abrir menú",
  "nav.menu.close": "Cerrar menú",
  "nav.menu.aria": "Menú de navegación",

  // ─── Search ────────────────────────────────────────────────────
  "search.placeholder": "Buscar casos, hallazgos, etiquetas…",
  "search.aria": "Buscar casos, hallazgos y etiquetas",

  // ─── Theme toggle ──────────────────────────────────────────────
  "theme.toLight.aria": "Cambiar a tema claro",
  "theme.toDark.aria": "Cambiar a tema oscuro",
  "theme.light.title": "Tema claro",
  "theme.dark.title": "Tema oscuro",
  "theme.label": "Tema",

  // ─── Language switcher ─────────────────────────────────────────
  "lang.aria": "Cambiar idioma",
  "lang.title": "Idioma de la página",
  "lang.es": "Español",
  "lang.en": "English",

  // ─── Sections (label + sub) ────────────────────────────────────
  "section.atlas": "Atlas POCUS",
  "section.atlas.sub": "Imágenes y videos ecográficos por tema",
  "section.ecg": "ECG",
  "section.ecg.sub": "Electrocardiogramas con interpretación",
  "section.cases": "Casos clínicos",
  "section.cases.sub": "Historias completas con razonamiento",
  "section.info": "Infografías",
  "section.info.sub": "Algoritmos, protocolos y referencias visuales",
  "section.rayos": "Rayos",
  "section.rayos.sub": "Radiografías, TAC y otros estudios de imagen",

  // ─── Built-in categories ───────────────────────────────────────
  "category.cardiac": "Cardíaco",
  "category.lung": "Pulmonar",
  "category.abdominal": "Abdominal",
  "category.fast": "FAST / Trauma",
  "category.vascular": "Vascular",
  "category.ob": "Obstétrico",
  "category.ms": "Musculoesquelético",
  "category.proc": "Procedimientos",

  // ─── Mobile drawer ─────────────────────────────────────────────
  "drawer.categories": "Categorías",
  "drawer.todos": "Todos",
  "drawer.filters.aria": "Filtros por categoría",

  // ─── Sidebar (desktop persistent rail) ─────────────────────────
  "sidebar.aria": "Filtros y categorías",
  "sidebar.expand.aria": "Expandir panel lateral",
  "sidebar.collapse.aria": "Colapsar panel lateral",
  "sidebar.expand.title": "Expandir",
  "sidebar.collapse.title": "Colapsar",
  "sidebar.categories": "Categorías",
  "sidebar.todos": "Todos",
  "sidebar.tags": "Etiquetas",

  // ─── Toolbar (filters above the grid) ──────────────────────────
  // Pluralization is handled at the callsite (it's a single
  // 1-vs-many rule for both languages); the dict ships both forms.
  "toolbar.results.one": "{count} caso",
  "toolbar.results.many": "{count} casos",
  "toolbar.clearFilters": "Limpiar filtros",
  "toolbar.sortLabel": "Ordenar",
  "toolbar.sort.recent": "Más recientes",
  "toolbar.sort.featured": "Destacados",
  "toolbar.sort.title": "Alfabético",

  // ─── Bilingual case content fallback ───────────────────────────
  // Shown as a tooltip on the small "ES" badge that appears next to
  // a case title / body when the user picked English but the admin
  // hasn't translated that field yet.
  "case.fallback.badge": "ES",
  "case.fallback.title": "Traducción pendiente — mostrando en español",

  // ─── Case modal meta (reading time, difficulty pills) ──────────
  "case.readingTime": "{minutes} min",
  "case.difficulty.basic": "Básico",
  "case.difficulty.intermediate": "Intermedio",
  "case.difficulty.advanced": "Avanzado",

  // ─── Case card chrome ──────────────────────────────────────────
  "card.fav.aria": "Favorito",
  "card.reviewed.title": "Caso revisado",
  "card.reviewed.aria": "Revisado",

  // ─── Featured row ──────────────────────────────────────────────
  "featured.title": "Destacados",

  // ─── Case modal chrome (close, play/pause, sections, actions) ──
  "modal.close.aria": "Cerrar caso",
  "modal.close.title": "Cerrar (Esc)",
  "modal.play.aria": "Reproducir",
  "modal.pause.aria": "Pausar",
  "modal.readingTime.title": "Tiempo de lectura estimado",
  "modal.lastUpdated.title": "Actualizado: {date}",
  "modal.updated": "Actualizado",
  "modal.section.description": "Descripción",
  "modal.section.tags": "Etiquetas",
  "modal.fav.aria": "Guardar en favoritos",
  "modal.fav.title": "Guardar en favoritos (F)",
  "modal.unfav.aria": "Quitar de favoritos",
  "modal.unfav.title": "Quitar de favoritos (F)",
  "modal.share.aria": "Compartir enlace al caso",
  "modal.share.title": "Copiar enlace al caso (S)",
  "modal.present.aria": "Modo presentación",
  "modal.present.title": "Modo presentación (P)",

  // ─── Page heads (favs / admin / fallback) ──────────────────────
  // Used by `derivePageHead` for the title / sub / crumb of the
  // section hero. Section-specific copy (atlas, ecg, …) reuses
  // the existing `section.<id>` keys.
  "page.favs.title": "Tu colección",
  "page.favs.sub": "Casos que has guardado para revisar más tarde.",
  "page.favs.crumb": "Mi colección",
  "page.admin.title": "Panel de administración",
  "page.admin.sub": "Sube nuevas imágenes, videos o GIFs y gestiona tus publicaciones.",
  "page.admin.crumb": "Admin",
  "page.crumb.category": "Categoría",
  "page.fallback.title": "Taote POCUS",
  "page.fallback.sub": "Casos clínicos contribuidos por la comunidad.",
  "page.fallback.crumb": "Inicio",

  // ─── New-case button ───────────────────────────────────────────
  "newCase.aria": "Nuevo caso",
  "newCase.label": "Nuevo caso",

  // ─── Admin badge ───────────────────────────────────────────────
  // Kept uppercase across both languages — it's a status pill, not
  // a sentence; "ADMIN" reads identically in es and en.
  "admin.badge": "ADMIN",

  // ─── PWA status banners ────────────────────────────────────────
  "pwa.offline": "Estás sin conexión — viendo la versión guardada",
  "pwa.memory": "Modo privado · esta sesión es temporal",
  "pwa.memory.title":
    "El navegador no permite guardar datos en este modo. Lo que edites aquí se perderá al cerrar la pestaña.",
  "pwa.update": "Hay una versión nueva disponible",
  "pwa.update.action": "Recargar",

  // ─── Footer / colophon ─────────────────────────────────────────
  "footer.composed": "Compuesto en {newsreader}, IBM Plex Sans y IBM Plex Mono.",
  "footer.cases": "{count} casos publicados",
  "footer.updated": "Actualizado {date}",
  "footer.copyright": "© {year} Taote POCUS",
  "footer.signature": "Hecho con cuidado en Rapa Nui",
} as const;

/** Type alias for any valid translation key. */
export type DictKey = keyof typeof DICT_ES;

/** Shape every locale dictionary must satisfy. The English (and any
 *  future) dictionary is `Record<DictKey, string>` so a typo or
 *  missing key is a typecheck error. */
export type Dict = Record<DictKey, string>;
