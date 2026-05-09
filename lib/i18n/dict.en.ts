// English translation. Must satisfy `Dict` from `dict.es.ts` — TS
// flags any missing or extra key. When adding a new translation
// key: edit `dict.es.ts` first (canonical), then mirror it here.
//
// Editorial notes for medical specialty translations (POCUS is
// clinical content; precision matters more than literal mapping):
//   - "Cardíaco" → "Cardiac" (adjective; matches POCUS tradition)
//   - "Pulmonar" → "Lung" (POCUS literature uses "Lung US", not
//     "Pulmonary US")
//   - "Obstétrico" → "Obstetric" (US clinical convention drops the
//     -al; UK leans "Obstetrical" — we follow US since the imaging
//     literature is dominated by it)
//   - "Musculoesquelético" → "Musculoskeletal" (one word in EN)
//   - "FAST / Trauma" — the FAST acronym is identical in EN
//   - "Rayos" → "Imaging" rather than the literal "X-rays" because
//     the section description includes CT (TAC). "Imaging" is the
//     umbrella radiology term.

import type { Dict } from "./dict.es";

export const DICT_EN: Dict = {
  // ─── Brand ─────────────────────────────────────────────────────
  "brand.aria.home": "Taote POCUS — home",

  // ─── Navigation ────────────────────────────────────────────────
  "nav.aria.sections": "Sections",
  "nav.favoritos": "Favorites",
  "nav.administrar": "Admin",
  "nav.entrar": "Sign in",
  "nav.salir": "Sign out",
  "nav.menu.open": "Open menu",
  "nav.menu.close": "Close menu",
  "nav.menu.aria": "Navigation menu",

  // ─── Search ────────────────────────────────────────────────────
  "search.placeholder": "Search cases, findings, tags…",
  "search.aria": "Search cases, findings and tags",

  // ─── Theme toggle ──────────────────────────────────────────────
  "theme.toLight.aria": "Switch to light theme",
  "theme.toDark.aria": "Switch to dark theme",
  "theme.light.title": "Light theme",
  "theme.dark.title": "Dark theme",
  "theme.label": "Theme",

  // ─── Language switcher ─────────────────────────────────────────
  "lang.aria": "Change language",
  "lang.title": "Page language",
  "lang.es": "Español",
  "lang.en": "English",

  // ─── Sections (label + sub) ────────────────────────────────────
  "section.atlas": "POCUS Atlas",
  "section.atlas.sub": "Ultrasound images and videos by topic",
  "section.ecg": "ECG",
  "section.ecg.sub": "Electrocardiograms with interpretation",
  "section.cases": "Clinical cases",
  "section.cases.sub": "Full case histories with reasoning",
  "section.info": "Infographics",
  "section.info.sub": "Algorithms, protocols and visual references",
  "section.rayos": "Imaging",
  "section.rayos.sub": "Radiographs, CT and other imaging studies",

  // ─── Built-in categories ───────────────────────────────────────
  "category.cardiac": "Cardiac",
  "category.lung": "Lung",
  "category.abdominal": "Abdominal",
  "category.fast": "FAST / Trauma",
  "category.vascular": "Vascular",
  "category.ob": "Obstetric",
  "category.ms": "Musculoskeletal",
  "category.proc": "Procedures",

  // ─── Mobile drawer ─────────────────────────────────────────────
  "drawer.categories": "Categories",
  "drawer.todos": "All",
  "drawer.filters.aria": "Filter by category",

  // ─── Sidebar (desktop persistent rail) ─────────────────────────
  "sidebar.aria": "Filters and categories",
  "sidebar.expand.aria": "Expand side panel",
  "sidebar.collapse.aria": "Collapse side panel",
  "sidebar.expand.title": "Expand",
  "sidebar.collapse.title": "Collapse",
  "sidebar.categories": "Categories",
  "sidebar.todos": "All",
  "sidebar.tags": "Tags",

  // ─── Toolbar (filters above the grid) ──────────────────────────
  "toolbar.results.one": "{count} case",
  "toolbar.results.many": "{count} cases",
  "toolbar.clearFilters": "Clear filters",
  "toolbar.sortLabel": "Sort",
  "toolbar.sort.recent": "Most recent",
  "toolbar.sort.featured": "Featured",
  "toolbar.sort.title": "Alphabetical",

  // ─── Page heads (favs / admin / fallback) ──────────────────────
  "page.favs.title": "Your collection",
  "page.favs.sub": "Cases you've saved to review later.",
  "page.favs.crumb": "My collection",
  "page.admin.title": "Admin panel",
  "page.admin.sub": "Upload new images, videos or GIFs and manage your publications.",
  "page.admin.crumb": "Admin",
  "page.crumb.category": "Category",
  "page.fallback.title": "Taote POCUS",
  "page.fallback.sub": "Clinical cases contributed by the community.",
  "page.fallback.crumb": "Home",

  // ─── New-case button ───────────────────────────────────────────
  "newCase.aria": "New case",
  "newCase.label": "New case",

  // ─── Admin badge ───────────────────────────────────────────────
  "admin.badge": "ADMIN",

  // ─── PWA status banners ────────────────────────────────────────
  "pwa.offline": "You're offline — showing the cached version",
  "pwa.memory": "Private mode · this session is temporary",
  "pwa.memory.title":
    "This browser mode doesn't allow saving data. Anything you edit here will be lost when you close the tab.",
  "pwa.update": "A new version is available",
  "pwa.update.action": "Reload",

  // ─── Footer / colophon ─────────────────────────────────────────
  "footer.composed": "Set in {newsreader}, IBM Plex Sans and IBM Plex Mono.",
  "footer.cases": "{count} published cases",
  "footer.updated": "Updated {date}",
  "footer.copyright": "© {year} Taote POCUS",
  "footer.signature": "Crafted on Rapa Nui",
};
