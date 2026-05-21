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
  // The admin entry surfaces as a gear icon (no visible text) so we
  // keep the user-facing label only as the aria-label for screen
  // readers. Tooltip uses the same string via `title`.
  "nav.administrar": "Administrar",
  "nav.administrar.aria": "Administrar",
  "nav.entrar": "Entrar",
  "nav.salir": "Salir",
  "nav.menu.open": "Abrir menú",
  "nav.menu.close": "Cerrar menú",
  "nav.menu.aria": "Menú de navegación",

  // ─── Catalog pagination ────────────────────────────────────────
  // The summary string ("Mostrando X–Y de Z") is rendered with three
  // bold numeric values interleaved between fixed words. Splitting
  // the dictionary into the three connectors lets each language
  // reorder them freely without losing the bold styling — EN inverts
  // the article ("Showing 1-30 of 64") with the same shape.
  "pagination.aria.label": "Paginación del catálogo",
  "pagination.summary.showing": "Mostrando",
  "pagination.summary.range": "–",
  "pagination.summary.of": "de",
  "pagination.indicator.page": "Página",
  "pagination.indicator.of": "de",
  "pagination.aria.first": "Primera página",
  "pagination.aria.last": "Última página",
  "pagination.aria.prev": "Página anterior",
  "pagination.aria.next": "Página siguiente",
  "pagination.prev": "‹ Anterior",
  "pagination.next": "Siguiente ›",

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
  "category.ocular": "Ocular",
  "category.neurocritico": "Neurocrítico",

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
  // Difficulty rail label (announced to screen readers as the
  // grouping for the three Básico / Intermedio / Avanzado chips).
  // The chip labels themselves reuse the existing
  // `case.difficulty.*` keys.
  "toolbar.difficulty.label": "Dificultad",

  // ─── Saved views (filter presets) ──────────────────────────────
  "savedViews.trigger.aria": "Vistas guardadas",
  "savedViews.trigger.title": "Vistas guardadas — atajos a tus filtros",
  "savedViews.trigger.label": "Vistas",
  "savedViews.menu.aria": "Menú de vistas guardadas",
  "savedViews.heading": "Vistas guardadas",
  "savedViews.empty":
    "Aún no has guardado ninguna vista. Configura los filtros que uses seguido y guárdalos para volver con un click.",
  "savedViews.save.aria": "Guardar la vista actual",
  "savedViews.save.placeholder": 'Nombre de la vista (ej. "Cardíaco sin revisar")',
  "savedViews.save.submit": "Guardar vista actual",
  "savedViews.row.apply": "Aplicar vista {name}",
  "savedViews.row.delete": "Eliminar vista {name}",
  "savedViews.toast.saved": 'Vista "{name}" guardada',
  "savedViews.toast.removed": "Vista eliminada",
  "savedViews.toast.invalidName": "El nombre no puede estar vacío",

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

  // ─── Recently-viewed rail (sits above the favoritos grid) ──────
  "recently.title": "Vistos hace poco",
  "recently.label": "Casos vistos hace poco",

  // ─── Command palette (⌘K / Ctrl+K overlay) ─────────────────────
  // Single keyboard surface for every navigation + edit action in
  // the app. Strings are short — the palette UI is dense.
  "palette.placeholder": "Buscar casos, ir a, acciones…",
  "palette.aria": "Buscar en la paleta de comandos",
  "palette.empty": "Sin resultados",
  "palette.foot.navigate": "Navegar",
  "palette.foot.select": "Seleccionar",
  "palette.foot.close": "Cerrar",
  "palette.row.openVerb": "Abrir",
  "palette.row.editVerb": "Editar",
  "palette.command.favs": "Favoritos",
  "palette.command.admin": "Administrar",
  "palette.command.toggleTheme": "Cambiar tema (claro/oscuro)",
  "palette.command.toggleLang": "Cambiar idioma",
  // Reciprocal arrows for the language-toggle command — shown as
  // the secondary line so the user sees both the current state and
  // the destination at a glance.
  "palette.command.toggleLang.toEN": "Español → English",
  "palette.command.toggleLang.toES": "English → Español",
  "palette.command.newCase": "Nuevo caso",

  // ─── Keyboard shortcuts modal (`?` help) ───────────────────────
  // `SHORTCUTS` in `hooks/useShortcuts.ts` references the `.label.*`
  // keys by id rather than carrying raw Spanish — that way the EN
  // dictionary swap below is the single source of truth and a new
  // shortcut requires both ES + EN to typecheck.
  "shortcuts.title": "Atajos de teclado",
  "shortcuts.intro": "Navega y filtra sin tocar el ratón.",
  "shortcuts.then": "luego",
  "shortcuts.close.aria": "Cerrar",
  "shortcuts.label.search": "Buscar",
  "shortcuts.label.help": "Mostrar atajos",
  "shortcuts.label.nextCase": "Caso siguiente",
  "shortcuts.label.prevCase": "Caso anterior",
  "shortcuts.label.below": "Caso debajo (salta una fila del grid)",
  "shortcuts.label.above": "Caso encima (salta una fila del grid)",
  "shortcuts.label.first": "Primer caso",
  "shortcuts.label.last": "Último caso",
  "shortcuts.label.goAtlas": "Ir a Atlas POCUS",
  "shortcuts.label.goEcg": "Ir a ECG",
  "shortcuts.label.goCases": "Ir a Casos clínicos",
  "shortcuts.label.goInfo": "Ir a Infografías",
  "shortcuts.label.goFavs": "Ir a Favoritos",
  "shortcuts.label.close": "Cerrar modal / volver",

  // ─── Presentation mode (fullscreen cinema) ─────────────────────
  // Surfaces a speaker sees while presenting. The case title +
  // description go through `getCaseTitle`/`getCaseDescription` so
  // they follow the speaker's chosen language already; only the
  // chrome (exit / nav / help line) needs dict routing.
  "presentation.exit": "Salir",
  "presentation.exit.aria": "Salir (Esc)",
  "presentation.prev.aria": "Anterior (←)",
  "presentation.next.aria": "Siguiente (→)",
  "presentation.help.navigate": "navegar",
  "presentation.help.pause": "pausa",
  "presentation.help.exit": "salir",

  // ─── Case modal — media carousel (multi-image cases) ──────────
  // Aria copy for the multi-slide carousel inside CaseModal. The
  // {index} / {total} placeholders are interpolated via the `t()`
  // helper so the English phrasing reorders ("Image 2 of 5") without
  // touching the call site.
  "modalLoop.aria.region": "Galería del caso",
  "modalLoop.aria.slide": "Imagen {index} de {total}",
  "modalLoop.aria.prev": "Imagen anterior",
  "modalLoop.aria.next": "Imagen siguiente",
  "modalLoop.aria.dots": "Seleccionar imagen del caso",
  "modalLoop.aria.goto": "Ir a imagen {index}",

  // ─── Modal error boundary fallback ─────────────────────────────
  // Surfaces when CaseModal's subtree throws — any user can see this
  // (the dialog crashes equally for visitors and admins). Kept
  // separate from `modal.*` so the wording can evolve without
  // colliding with the normal modal chrome keys above.
  "modal.boundary.title": "El caso no pudo abrirse",
  "modal.boundary.detailsLabel": "Detalles",
  "modal.boundary.close": "Cerrar",

  // ─── Generic ErrorBoundary fallback (DefaultFallback) ──────────
  // Triggered when any non-modal boundary catches a render error
  // (grid, drawer, footer, etc.). Modal crashes use the dedicated
  // `modal.boundary.*` keys above. The {context} placeholder swaps
  // between modal and generic copy at the call site so the same
  // structure works for both.
  "boundary.title": "Algo no funcionó en esta sección",
  "boundary.body.modal": "El caso no pudo abrirse correctamente.",
  "boundary.body.generic": "Esta parte de la página falló al cargar.",
  "boundary.body.suffix": "Puedes reintentar o recargar la pestaña si persiste.",
  "boundary.details.summary": "Detalles técnicos",
  "boundary.retry": "Reintentar",

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

  // ─── Empty-state defaults (no results / no favs / per section) ─
  // Title + message strings rendered by `<EmptyState>` when the
  // active section is empty or the filter set yields zero hits.
  // Lookup is keyed on `view.kind` (favs / admin) or `view.section`
  // (atlas / ecg / cases / info / rayos) inside `EmptyState.tsx`.
  "empty.favs.title": "Aún no has guardado casos",
  "empty.favs.message": "Toca el corazón en cualquier caso para añadirlo a tu colección.",
  "empty.admin.title": "Sin publicaciones",
  "empty.admin.message": "Cuando subas tu primer caso aparecerá aquí.",
  "empty.ecg.title": "Trazado plano",
  "empty.ecg.message": "Ningún ECG coincide con esos filtros. Prueba ajustar la búsqueda.",
  "empty.cases.title": "Sin historias",
  "empty.cases.message": "No hay casos clínicos para esa combinación. Limpia filtros y reintenta.",
  "empty.info.title": "Sin infografías",
  "empty.info.message": "No encontramos piezas visuales con esos criterios.",
  "empty.rayos.title": "Sin estudios",
  "empty.rayos.message":
    "Ninguna radiografía o TAC coincide. Quita filtros o busca por otra palabra.",
  "empty.default.title": "Sin resultados",
  "empty.default.message": "Prueba quitando filtros o buscando por otra palabra.",
  // CTA buttons rendered below the message. The favs view sends the
  // user to the atlas; the generic-filtered view offers to clear
  // the filters so they can see anything at all.
  "empty.action.exploreAtlas": "Explorar el atlas",
  "empty.action.clearFilters": "Limpiar filtros",

  // ─── Relax-this-filter chip rail (EmptyState quick-fixes) ─────
  // Shown above the generic "Clear filters" CTA when at least one
  // single-filter relaxation would yield > 0 cases. Each chip reads
  // as a verb+target+count so the user sees the trade at a glance
  // ("Quitar Crítico → 12 casos"). The {count} placeholder uses the
  // plural form of the case noun via the same lookup the toolbar
  // already uses.
  "empty.suggestions.aria": "Sugerencias para relajar el filtro",
  "empty.suggestions.lede": "Probá aflojar uno:",
  "empty.suggestions.count": "{count} casos",
  "empty.suggestions.dropCat": "Sin categoría",
  "empty.suggestions.dropTag": "Quitar {tag}",
  "empty.suggestions.dropDifficulty": "Quitar {level}",
  "empty.suggestions.dropQuery": "Limpiar “{query}”",

  // ─── Admin confirm dialogs (delete + permanent purge) ──────────
  // These are admin-triggered flows, but the dialog itself reads
  // through the public language (an admin in EN mode shouldn't see
  // a Spanish-only confirm). The {title} placeholder is the case's
  // canonical Spanish title — by design, the editor works against
  // the ES baseline so the prompt mentions the real filename.
  "confirm.delete.title": '¿Eliminar "{title}"?',
  "confirm.delete.message":
    "El caso se mueve a la Papelera y puedes restaurarlo desde el panel admin.",
  "confirm.delete.confirm": "Eliminar",
  "confirm.delete.cancel": "Cancelar",
  "confirm.purge.title": '¿Eliminar permanentemente "{title}"?',
  "confirm.purge.message":
    "Esto borra el caso y su archivo de media (imagen / video) de forma definitiva. No aparece en la papelera ni se puede restaurar desde la app — la única forma de recuperarlo sería importar un backup JSON anterior. ¿Continuar?",
  "confirm.purge.confirm": "Eliminar para siempre",
  "confirm.purge.cancel": "Cancelar",

  // ─── CineLoop chrome ──────────────────────────────────────────
  // Fallback aria-label when a media item ships without an explicit
  // `modality` tag (most do — this only fires on legacy / partial
  // imports). The accent-free "Imagen" otherwise leaks Spanish to
  // an EN-mode screen reader.
  "cine.fallbackAria": "Imagen",
  // Spinner overlay between video metadata-loaded and data-loaded
  // — the user sees the first frame underneath; this label tells
  // screen readers what the spinning indicator is doing.
  "cine.loadingAria": "Cargando video",
  // Centered play-button overlay on idle videos (post play-on-demand
  // pass). Fires whenever the user lands on a card surface and
  // hasn't clicked play yet — short, action-oriented label so AT
  // users hear "Reproducir video" and know exactly what activating
  // the button will do.
  "cine.playAria": "Reproducir video",

  // ─── Synthetic-loop canvas labels ──────────────────────────────
  // `components/cine/cineScenes.ts` paints these as actual pixels on
  // the canvas (via `ctx.fillText`). It lives outside React, so the
  // strings travel through the `drawScene(opts.labels)` parameter —
  // CineLoop resolves them via `t()` and threads them in. Keep the
  // ECG labels uppercase to match the existing visual identity (the
  // canvas does NOT re-uppercase them); the info subtitles stay
  // title-case here and the scene calls `.toUpperCase()` at paint.
  "scene.ecg.stemi": "STEMI INFERIOR",
  "scene.ecg.afib": "FIBRILACIÓN AURICULAR",
  "scene.ecg.bav": "BAV COMPLETO",
  "scene.info.blue.sub": "Disnea aguda · algoritmo",
  "scene.info.rush.sub": "Shock indiferenciado · 3 pasos",
  "scene.info.fast.sub": "Trauma · 8 puntos",

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

  // ─── Admin panel — tabs ────────────────────────────────────────
  "admin.tabs.aria": "Vistas admin",
  "admin.tab.mine": "Mis casos",
  "admin.tab.classify": "Clasificar",
  "admin.tab.edit": "Edición",
  "admin.tab.edit.title": "Editar título / descripción / etiquetas en lote",
  "admin.tab.categories": "Categorías",
  "admin.tab.sections": "Secciones",
  "admin.tab.activity": "Actividad",
  "admin.tab.activity.title": "Registro append-only de acciones admin",
  "admin.tab.backup": "Backup",
  "admin.tab.focus": "Foco",
  "admin.tab.focus.title":
    "Configurar foco y zoom por defecto a nivel global, por sección o por categoría",

  // ─── Focus editor (shared widget) ──────────────────────────────
  "focus.editor.foco": "FOCO",
  "focus.editor.zoom": "ZOOM",
  "focus.editor.reset": "Reset",
  "focus.editor.save": "Guardar",
  "focus.editor.back": "Atrás",
  "focus.editor.aria.up": "Subir",
  "focus.editor.aria.down": "Bajar",
  "focus.editor.aria.left": "Izquierda",
  "focus.editor.aria.right": "Derecha",
  "focus.editor.aria.center": "Centrar",
  "focus.editor.aria.zoomIn": "Aumentar zoom",
  "focus.editor.aria.zoomOut": "Reducir zoom",

  // ─── Focus defaults panel (Foco admin tab) ─────────────────────
  "focus.defaults.title": "Foco y zoom por defecto",
  "focus.defaults.intro":
    "Define el encuadre de las miniaturas para cuando un caso no tenga su propio override. La precedencia es: caso individual → categoría → sección → global. Tocar una miniatura desde el menú admin sigue ganando siempre — esto solo aplica cuando el caso no tiene foco propio.",
  "focus.defaults.usingDefault": "Por defecto (centrado, 100%)",
  "focus.defaults.global.label": "Global (todas las secciones)",
  "focus.defaults.sections.label": "Por sección",
  "focus.defaults.categories.label": "Por categoría",
  "focus.defaults.resetAll": "Reset todo",
  "focus.defaults.confirmResetAll":
    "Vas a borrar todos los defaults de foco (global, por sección y por categoría). Los overrides por caso individual no se tocan. ¿Continuar?",

  // ─── Admin panel — Mine tab ────────────────────────────────────
  "admin.mine.stats.total": "Casos totales",
  "admin.mine.stats.uploaded": "Subidos por ti",
  "admin.mine.stats.realMedia": "Con media real",
  "admin.mine.stats.categories": "Categorías",
  "admin.mine.publications": "Tus publicaciones",
  // Heading + body pair feeding the `EmptyState` component (see
  // `components/EmptyState.tsx`). The title is the punchline; the
  // body softens it and primes the CTA. EN parity lives at
  // `dict.en.ts:"admin.mine.empty.title"`.
  "admin.mine.empty.title": "Sin publicaciones aún",
  "admin.mine.empty.body":
    "Aún no has publicado casos. Empieza subiendo tu primer hallazgo ecográfico.",
  "admin.mine.empty.cta": "Publicar primero",
  "admin.mine.col.title": "Título",
  "admin.mine.col.category": "Categoría",
  "admin.mine.col.type": "Tipo",
  "admin.mine.col.date": "Fecha",
  "admin.mine.synthetic": "Sintético",
  "admin.mine.action.edit": "Editar",
  "admin.mine.action.trash": "Mover a papelera",
  "admin.mine.trash.title": "Papelera",
  "admin.mine.trash.count.one": "{count} eliminado",
  "admin.mine.trash.count.many": "{count} eliminados",
  "admin.mine.trash.col.title": "Título",
  "admin.mine.trash.col.deletedAt": "Eliminado",
  "admin.mine.trash.col.deletedBy": "Por",
  "admin.mine.action.restore": "Restaurar",
  "admin.mine.action.purge": "Eliminar definitivamente",
  "admin.mine.imports.title": "Papelera de importados",
  "admin.mine.imports.purge.title":
    "Eliminar definitivamente · borra metadata y archivo del blob store",

  // ─── Admin panel — BulkEdit ────────────────────────────────────
  "bulk.filters.aria": "Filtros",
  "bulk.filter.section.aria": "Sección",
  "bulk.filter.category.aria": "Categoría",
  "bulk.filter.search.aria": "Buscar en la tabla",
  "bulk.pagesize.aria": "Casos por página",
  "bulk.pagesize.option": "{n} / página",
  "bulk.count.range": "{start}–{end} de {total}",
  "bulk.col.title": "Título",
  "bulk.col.description": "Descripción",
  "bulk.col.category": "Categoría",
  "bulk.col.tags": "Etiquetas",
  "bulk.col.reviewed.title": "Marcado como revisado",
  "bulk.filter.section.all": "Todas las secciones",
  "bulk.filter.category.all": "Todas las categorías",
  "bulk.filter.search.placeholder": "Buscar por título, descripción o etiqueta…",
  // Bulk-edit table empties. The body strings predate the
  // `EmptyState` migration so they're short — added titles here
  // give the component a proper headline. Conditional on whether
  // a filter is active or the catalog itself is empty.
  "bulk.empty.filteredTitle": "Sin coincidencias",
  "bulk.empty.filtered": "Ningún caso encaja con los filtros activos.",
  "bulk.empty.clearFilters": "Limpiar filtros",
  "bulk.empty.catalogTitle": "Catálogo vacío",
  "bulk.empty.catalog":
    "Aún no hay casos publicados. Cuando alguien suba el primero, aparecerá acá.",
  "bulk.action.changeSection": "Cambiar sección…",
  "bulk.action.changeSection.aria": "Cambiar sección de seleccionados",
  "bulk.action.changeCategory": "Cambiar categoría…",
  "bulk.action.changeCategory.aria": "Cambiar categoría de seleccionados",
  "bulk.action.markReviewed": "✓ Marcar revisado",
  "bulk.action.unmarkReviewed": "✗ Sin marcar",
  "bulk.action.tags": "Etiquetas…",
  // Bulk tag panel — expanded surface below the action bar with the
  // tag-frequency chip cloud + add-new input. Each chip click
  // removes that tag from every selected case that carries it;
  // submitting the input adds the typed tag to every selected case
  // that doesn't already have it.
  "bulk.tags.currentAria": "Etiquetas presentes en la selección — click para quitar",
  "bulk.tags.removeTitle": 'Quitar "{tag}" de {count} caso(s) seleccionado(s)',
  "bulk.tags.addPlaceholder": "Agregar etiqueta…",
  "bulk.tags.addAria": "Agregar una etiqueta a los casos seleccionados",
  "bulk.tags.addSubmit": "Agregar a {count}",
  "bulk.action.delete": "Eliminar",
  "bulk.action.moveTrash": "Mover a papelera",
  "bulk.action.confirmDelete.one": "Mover {count} caso a la papelera? La acción se puede deshacer.",
  "bulk.action.confirmDelete.many":
    "Mover {count} casos a la papelera? La acción se puede deshacer.",
  "bulk.selection.aria": "Acciones en lote",
  "bulk.selection.count.one": "{count} seleccionado",
  "bulk.selection.count.many": "{count} seleccionados",
  "bulk.action.clear": "Limpiar",
  "bulk.action.clearTitle": "Quitar selección",
  "bulk.pagination.prev": "← Anterior",
  "bulk.pagination.prev.aria": "Página anterior",
  "bulk.pagination.next": "Siguiente →",
  "bulk.pagination.next.aria": "Página siguiente",
  "bulk.pagination.position": "Página {current} de {total}",
  "bulk.thumb.openEdit": "Abrir edición completa de {title}",
  "bulk.row.openModal": "Abrir modal",
  "bulk.selectAll.aria": "Seleccionar todos los visibles",
  "bulk.tags.editAria": "Editar etiquetas",
  "bulk.tags.empty": "— sin etiquetas —",
  "bulk.tags.input.aria": "Etiquetas separadas por coma",
  "bulk.tags.input.placeholder": "ej: B-líneas, Patológico",
  "bulk.row.menu.aria": "Más acciones",
  "bulk.row.openFull": "Abrir modal completo",
  "bulk.row.delete": "Eliminar caso",
  "bulk.cell.editHint": "{label} (click para editar)",
  "bulk.cell.empty": "— vacío —",
  "bulk.row.checkbox.select": "Seleccionar {title}",
  "bulk.row.category.aria": "Categoría de {title}",
  "bulk.row.reviewed.toggleOn": "{title}: marcar revisado",
  "bulk.row.reviewed.toggleOff": "{title}: marcar sin revisar",

  // ─── Admin panel — ClassifierBoard ─────────────────────────────
  "classifier.title": "Clasificación global",
  "classifier.intro":
    "Arrastra cualquier miniatura sobre una sección o categoría para reclasificar. Click sobre el ✓ marca el caso como revisado. Click sobre la miniatura abre el editor completo. Usá los filtros para encontrar un caso ya clasificado y reasignarlo o eliminarlo.",
  "classifier.tab.unclassified": "Sin clasificar",
  "classifier.tab.unreviewed": "Sin revisar",
  "classifier.tab.all": "Todos",
  "classifier.search.placeholder": "Buscar en título, resumen, hallazgos, tags…",
  "classifier.search.aria": "Buscar caso por texto",
  "classifier.filter.section.aria": "Filtrar por sección",
  "classifier.filter.category.aria": "Filtrar por categoría",
  "classifier.filter.section.any": "Cualquier sección",
  "classifier.filter.category.any": "Cualquier categoría",
  "classifier.filter.clear": "× Limpiar filtros",
  "classifier.filter.clear.aria": "Limpiar filtros auxiliares",
  "classifier.results.one": "{count} resultado",
  "classifier.results.many": "{count} resultados",
  "classifier.targets.section": "Sección →",
  "classifier.targets.category": "Categoría →",
  "classifier.targets.section.aria": "Secciones",
  "classifier.targets.category.aria": "Categorías",
  "classifier.empty.unclassified": "No hay casos sin clasificar.",
  "classifier.empty.unreviewed": "No hay casos pendientes de revisar.",
  "classifier.empty.all": "El catálogo está vacío.",
  "classifier.empty.title": "Nada por clasificar",
  "classifier.empty.body": "Cuando este filtro tenga casos pendientes, aparecerán acá.",
  "classifier.thumb.title": "Click para editar · ⌘/Ctrl+click para seleccionar",
  "classifier.thumb.aria": "Editar {title}",
  "classifier.review.markAria": "Marcar revisado",
  "classifier.review.markTitle": "Marcar como revisado",
  "classifier.review.unmarkTitle": "Quitar marca de revisado",
  // ─── Admin panel — Classifier bulk action bar ──────────────────
  "classifier.bulk.aria": "Acciones en lote",
  // Suffix to "{<strong>N</strong>} ___" — kept as a separate key so
  // the `<strong>` wrapper around the number can stay in JSX.
  "classifier.bulk.count.suffix.one": "seleccionado",
  "classifier.bulk.count.suffix.many": "seleccionados",
  "classifier.bulk.markReviewed": "✓ Marcar revisado",
  "classifier.bulk.markReviewed.title": "Marcar todos como revisados",
  "classifier.bulk.unmarkReviewed": "Quitar revisado",
  "classifier.bulk.unmarkReviewed.title": "Quitar marca de revisado a todos",
  "classifier.bulk.section.label": "Mover sección a",
  "classifier.bulk.section.placeholder": "Mover sección…",
  "classifier.bulk.category.label": "Mover categoría a",
  "classifier.bulk.category.placeholder": "Mover categoría…",
  "classifier.bulk.trash": "🗑 Mover a papelera",
  "classifier.bulk.trash.title": "Mover los seleccionados a la papelera",
  "classifier.bulk.clear": "Limpiar",
  "classifier.bulk.clear.title": "Limpiar selección · Esc",
  "classifier.dragHint.label": "Arrastrando",
  "classifier.dragHint.fallback": "caso",
  "classifier.dragHint.empty": "Suelta sobre una sección o categoría",
  "classifier.checkbox.aria": "Seleccionar {title}",

  // ─── Admin panel — Categories editor ───────────────────────────
  "categories.intro.title": "Categorías",
  "categories.intro.body":
    "Las categorías integradas no se pueden modificar (sus traducciones vienen del diccionario i18n). Las personalizadas que crees acá aparecerán en el clasificador y en el formulario de edición. El campo en inglés es opcional — si lo dejas vacío, se muestra el español como fallback.",
  "categories.add.placeholder.es": "Categoría · ES (ej. Pediatría)",
  "categories.add.placeholder.en": "Category · EN (opcional)",
  "categories.add.aria.es": "Nombre de la nueva categoría en español",
  "categories.add.aria.en": "Nombre de la nueva categoría en inglés",
  "categories.add.submit": "Agregar",
  "categories.error.create": "No se pudo crear la categoría (¿ya existe?)",
  "categories.section.builtin": "Integradas",
  "categories.section.custom": "Personalizadas",
  "categories.count": "{count} categorías",
  "categories.row.cases.one": "{count} caso",
  "categories.row.cases.many": "{count} casos",
  "categories.row.builtin.tag": "Integrada",
  "categories.row.translation.title": "Traducción al inglés",
  "categories.row.toggleVisible": "Mostrar {label} en el atlas",
  "categories.row.toggleHidden": "Ocultar {label} del atlas",
  "categories.row.toggleVisible.title": "Oculta en el sidebar público — click para mostrar",
  "categories.row.toggleHidden.title": "Visible en el sidebar público — click para ocultar",
  "categories.row.rename.aria": "Renombrar {label}",
  "categories.row.rename.es.aria": "Renombrar {label} en español",
  "categories.row.rename.en.aria": "Renombrar {label} en inglés",
  "categories.row.rename.title": "Renombrar (ES + EN)",
  "categories.row.rename.placeholder.es": "Español",
  "categories.row.rename.placeholder.en": "English (opcional)",
  "categories.row.save": "Guardar",
  "categories.row.save.title": "Guardar (Enter)",
  "categories.row.cancel": "Cancelar",
  "categories.row.cancel.title": "Cancelar (Esc)",
  "categories.row.delete.aria": "Eliminar {label}",
  "categories.row.delete.title": "Eliminar categoría",
  "categories.row.delete.confirm.one":
    '{label} está asignada a {count} caso. Si la eliminas, ese caso quedará con la categoría "{id}" como referencia rota. ¿Continuar?',
  "categories.row.delete.confirm.many":
    '{label} está asignada a {count} casos. Si la eliminas, esos casos quedarán con la categoría "{id}" como referencia rota. ¿Continuar?',
  "categories.empty":
    "Aún no has creado categorías personalizadas. Usa el campo de arriba para empezar.",

  // ─── Admin panel — Sections editor ─────────────────────────────
  "sections.intro.title": "Secciones",
  "sections.intro.body":
    "Renombrá las secciones haciendo click en el lápiz: podés definir un nombre en español (mandatorio cuando lo personalizas) y otro en inglés (opcional). Los visitantes verán el slot que coincida con el idioma activo, con fallback al español. La URL y los enlaces compartidos no cambian. Las secciones ocultas tampoco aparecen en el menú aunque la URL siga funcionando.",
  "sections.row.rename.title": "Click para renombrar",
  "sections.row.reset": "Restaurar",
  "sections.row.reset.title": "Restaurar nombres por defecto ({default})",
  "sections.row.renamed.title": "Renombrada del default",
  "sections.row.toggleVisible": "Mostrar {label} en el menú",
  "sections.row.toggleHidden": "Ocultar {label} del menú",
  "sections.row.toggleVisible.title": "Oculta en el menú público — click para mostrar",
  "sections.row.toggleHidden.title": "Visible en el menú público — click para ocultar",
  "sections.row.rename.es.aria": "Renombrar {label} en español",
  "sections.row.rename.en.aria": "Renombrar {label} en inglés",
  "sections.row.rename.placeholder.en": "English (opcional)",
  "sections.row.rename.tooltip": "Renombrar (ES + EN)",
  "sections.row.translation.title": "Traducción al inglés",
  "sections.row.rename.aria": "Renombrar {label}",
  "sections.row.cases.one": "{count} caso",
  "sections.row.cases.many": "{count} casos",
  "sections.row.save": "Guardar",
  "sections.row.save.title": "Guardar (Enter)",
  "sections.row.cancel": "Cancelar",
  "sections.row.cancel.title": "Cancelar (Esc)",

  // ─── Admin panel — CaseForm chrome ─────────────────────────────
  "form.head.edit": "Editar caso",
  "form.head.new": "Nuevo caso",
  "form.head.title": "Sube contenido al atlas",
  "form.head.body":
    "Imagen estática, GIF, video clip o cine-loop sintético si todavía no tienes archivo.",
  "form.tabs.aria": "Secciones del formulario",
  "form.tab.metadata": "Metadatos",
  "form.tab.media": "Media",
  "form.tab.advanced": "Avanzado",
  "form.tab.ai": "IA",
  "form.action.cancel": "Cancelar",
  "form.action.save": "Guardar cambios",
  "form.action.publish": "Publicar caso",
  "form.label.optional": "(opcional)",
  "form.label.title.es": "Título · ES",
  "form.label.title.en": "Title · EN",
  "form.placeholder.title.es": "Ej: Derrame pleural masivo",
  "form.placeholder.title.en": "Ex: Massive pleural effusion",
  "form.label.category": "Categoría",
  "form.label.modality": "Modalidad / sonda",
  "form.placeholder.modality": "Sonda lineal · 5 MHz",
  "form.label.author": "Autor",
  "form.label.role": "Especialidad",
  "form.label.date": "Fecha",
  "form.label.description.es": "Descripción · ES",
  "form.label.description.en": "Description · EN",
  "form.placeholder.description.es":
    "Describe el caso: contexto clínico, lo que se ve en la imagen, conclusión…",
  "form.placeholder.description.en":
    "Describe the case: clinical context, what's visible, conclusion…",
  "form.label.tags.es": "Etiquetas · ES",
  "form.label.tags.en": "Tags · EN",
  "form.placeholder.tag.es": "Agregar etiqueta + Enter",
  "form.placeholder.tag.en": "Add tag + Enter",
  "form.action.removeTag": "Quitar etiqueta {tag}",
  "form.action.removeTag.en": "Remove tag {tag}",

  // ─── CaseForm — Media panel ────────────────────────────────────
  "form.media.label": "Imagen / Video / GIF",
  "form.media.uploader.aria": "Seleccionar archivo de imagen, video o GIF",
  "form.media.processing": "Procesando…",
  "form.media.dropPrompt": "Arrastra o haz clic para subir",
  "form.media.formats": "JPG · PNG · GIF · MP4 · WebM",
  "form.media.remove": "Quitar",
  "form.media.extra.label": "Imágenes adicionales",
  "form.media.extra.hint":
    "Se mostrarán en el modal como un carrusel después de la imagen principal.",
  "form.media.extra.add": "+ Añadir otra imagen",
  "form.media.extra.removeAria": "Quitar {name}",
  "form.media.extra.fallbackName": "imagen {n}",
  "form.media.error.size":
    "El archivo pesa {actual}. Máximo permitido: {max}. Comprime el video o usa un GIF más liviano.",
  "form.media.error.format": "Formato no soportado: {type}.",
  "form.media.error.formatUnknown": "desconocido",
  "form.media.error.read": "No se pudo leer el archivo.",

  // ─── CaseForm — Advanced panel ─────────────────────────────────
  "form.advanced.section.label": "Sección",
  "form.advanced.loop.label": "Cine-loop sintético (fallback)",
  "form.advanced.loop.hint":
    "Solo se usa si no hay media real. La animación en canvas se reemplaza automáticamente cuando subes un archivo.",
  "form.advanced.loop.notUsed":
    "Este caso ya tiene media real adjunta — el cine-loop sintético no se usa.",
  "form.advanced.featured.label": "Marcar como destacado",
  "form.advanced.featured.hint":
    'Los casos destacados aparecen en el carrusel "Destacados" en cada sección.',
  // Loop scene names. The values reuse the existing curated tags
  // for the medical findings; sharing the same Spanish phrasing as
  // `category.lung` etc. is intentional — these are the same
  // concepts surfaced in two contexts (synthetic scene picker vs.
  // case classification).
  "form.advanced.loop.blines": "B-líneas",
  "form.advanced.loop.tamponade": "Tamponade",
  "form.advanced.loop.morrison": "FAST / Morrison",
  "form.advanced.loop.seashore": "Seashore (modo M)",
  "form.advanced.loop.ijv": "Yugular interna",
  "form.advanced.loop.dvt": "TVP",
  "form.advanced.loop.hydro": "Hidronefrosis",
  "form.advanced.loop.ob": "Saco gestacional",
  "form.advanced.loop.lvfunction": "Función VI",
  "form.advanced.loop.aaa": "AAA",
  "form.advanced.loop.consolidation": "Consolidación",
  "form.advanced.loop.gallstone": "Colelitiasis",

  // ─── ConfirmDialog ─────────────────────────────────────────────
  "confirm.dismiss.aria": "Cerrar diálogo",
  "confirm.cancel": "Cancelar",
  "confirm.confirm": "Confirmar",
  "confirm.delete": "Eliminar",
  "confirm.purge": "Eliminar definitivamente",

  // ─── AuthModal (legacy email+password path) ────────────────────
  "auth.close.aria": "Cerrar",
  "auth.aria": "Iniciar sesión",
  "auth.title.login": "Bienvenido de vuelta",
  "auth.title.register": "Crea tu cuenta",
  "auth.intro.login": "Accede para guardar casos en tu colección.",
  "auth.intro.register": "Guarda casos, sigue temas y construye tu propio atlas.",
  "auth.label.name": "Nombre",
  "auth.placeholder.name": "Dr. María Pérez",
  "auth.label.email": "Correo",
  "auth.placeholder.email": "tu@correo.com",
  "auth.label.password": "Contraseña",
  "auth.placeholder.password": "••••••••",
  "auth.action.busy": "Verificando…",
  "auth.action.login": "Entrar",
  "auth.action.register": "Crear cuenta",
  "auth.alt.toRegister": "¿Eres nuevo? ",
  "auth.alt.toLogin": "¿Ya tienes cuenta? ",
  "auth.demo.title": "Demo admin:",

  // ─── Admin panel — Backup ─────────────────────────────────────
  "backup.intro.title": "Backup",
  "backup.intro.body":
    "Exportá un archivo JSON con todo lo que has hecho desde admin: reclasificaciones, categorías personalizadas, casos propios y favoritos. Guardalo en Drive / Dropbox / iCloud — es tu única red contra perder los datos del navegador, cambiar de máquina o reinstalar.",
  "backup.relative.never": "nunca",
  "backup.relative.today": "hoy",
  "backup.relative.yesterday": "ayer",
  "backup.relative.daysAgo": "hace {days} días",
  "backup.status.label": "Último backup",
  "backup.status.warn.stale":
    "Hace más de {days} días — descargá uno nuevo si has clasificado casos desde entonces.",
  "backup.status.warn.never":
    "Aún no has hecho un backup. Descargá uno antes de seguir clasificando.",
  "backup.export.title": "Exportar",
  "backup.export.body": "Descarga un snapshot del estado actual.",
  "backup.summary.overrides": "reclasificaciones",
  "backup.summary.categories": "categorías personalizadas",
  "backup.summary.categoriesShort": "categorías",
  "backup.summary.userCases": "casos propios",
  "backup.summary.favorites": "favoritos",
  "backup.export.action": "Exportar backup",
  "backup.toast.exported":
    "Backup descargado · {overrides} reclasificaciones, {categories} categorías, {userCases} casos propios",
  "backup.import.title": "Importar",
  "backup.import.body.prefix":
    "Reemplaza el estado actual con el contenido del archivo. Esta operación",
  "backup.import.body.strong": "sobrescribe",
  "backup.import.body.suffix": "tus datos locales — usa con cuidado.",
  "backup.import.action": "Elegir archivo JSON…",
  "backup.error.invalidJson": "El archivo no es JSON válido.",
  "backup.error.invalidEnvelope":
    "El archivo no parece un backup válido (versión incorrecta o estructura distinta).",
  "backup.error.read": "No se pudo leer el archivo.",
  "backup.error.writeFailed": "Falló la escritura en localStorage (¿espacio agotado?).",
  "backup.error.restoreUnknown": "No se pudo restaurar — revisa la consola.",
  "backup.toast.restored":
    "Backup restaurado · {overrides} reclasificaciones, {categories} categorías. Recargando…",
  "backup.confirm.restore.title": "¿Reemplazar tus datos locales?",
  "backup.confirm.restore.body":
    "Vas a sobrescribir el estado actual con este backup del {date}{by}.",
  "backup.confirm.restore.warn":
    "Tus datos actuales se perderán. Si tenés cambios sin exportar, cancelá y descargá un backup nuevo primero.",
  "backup.confirm.restore.confirm": "Reemplazar y recargar",
  "backup.confirm.cancel": "Cancelar",
  "backup.db.title": "Sincronizar con base de datos",
  "backup.db.body":
    "Sube el estado actual de localStorage a Postgres (Netlify Database). La operación reemplaza todos los datos en la DB con los locales — usar para la migración inicial o para reconciliar drift después de un fallo de sincronización.",
  "backup.db.action": "Subir a base de datos",
  "backup.db.action.busy": "Subiendo…",
  "backup.db.error":
    "No se pudo subir a la base de datos. Revisá los logs de Netlify Functions para el detalle.",
  "backup.db.error.exception": "Error: {message}",
  "backup.db.error.unknown": "Error desconocido durante la subida.",
  "backup.db.toast":
    "Subido a DB · {overrides} reclasificaciones, {categories} categorías, {userCases} casos propios, {favs} favoritos",
  "backup.db.confirm.title": "¿Subir a la base de datos?",
  "backup.db.confirm.body":
    "Se va a sobrescribir el contenido de Postgres con el estado actual de tu navegador. Esta operación es atómica — todo o nada.",
  "backup.db.confirm.warn":
    "Si trabajaste desde otro dispositivo y hay datos solo en la DB, vas a perderlos. Para casos así, primero exportá un backup desde el otro dispositivo.",
  "backup.db.confirm.confirm": "Subir y reemplazar",

  // ─── Admin panel — Activity feed ──────────────────────────────
  "activity.intro.title": "Actividad",
  "activity.intro.body":
    "Registro append-only de cada cambio admin: overrides, categorías, casos eliminados o restaurados, importaciones. Útil para auditar quién hizo qué y cuándo.",
  "activity.skeleton.aria": "Cargando actividad…",
  "activity.filter.aria": "Filtrar por tipo de acción",
  "activity.filter.all": "Todas las acciones",
  "activity.count.suffix": "acciones",
  // "{visible} de {total}" — when the kind filter narrows the row
  // set, this fragment surfaces between the visible-count and the
  // " acciones" suffix above. Kept separate so the count stays a
  // raw `{visibleRows.length}` in JSX.
  "activity.count.of": "de {total}",
  "activity.error.auth": "Necesitás iniciar sesión para ver la actividad.",
  "activity.error.forbidden": "Tu cuenta no tiene permisos de administrador.",
  "activity.error.load": "No se pudo cargar la actividad. Reintentá más tarde.",
  "activity.error.network": "Error de red. Reintentá más tarde.",
  "activity.empty":
    "Aún no se registraron acciones. Cualquier edición admin que hagas a partir de ahora aparece acá.",
  "activity.col.date": "Fecha",
  "activity.col.action": "Acción",
  "activity.col.target": "Caso / objeto",
  "activity.col.admin": "Admin",
  "activity.empty.filtered": "Ninguna acción de tipo «{label}» en el rango cargado.",
  "activity.loadMore": "Cargar más",
  "activity.loadMore.busy": "Cargando…",
  "activity.kind.override_set": "Override aplicado",
  "activity.kind.override_cleared": "Override descartado",
  "activity.kind.category_added": "Categoría creada",
  "activity.kind.category_renamed": "Categoría renombrada",
  "activity.kind.category_removed": "Categoría eliminada",
  "activity.kind.user_case_saved": "Caso guardado",
  "activity.kind.user_case_soft_deleted": "Caso a papelera",
  "activity.kind.user_case_restored": "Caso restaurado",
  "activity.kind.import_purged": "Caso eliminado permanentemente",
  "activity.kind.bulk_imported": "Importación masiva",

  // ─── Toasts (admin) ────────────────────────────────────────────
  "toast.case.deleted": "Caso eliminado",
  "toast.case.purged": "Caso eliminado definitivamente",
  "toast.case.restored": "Caso restaurado",
  "toast.case.saved": "Caso guardado",
  "toast.case.edited": "Caso editado · puedes descartar desde el modal",
  // Title-aware variants for the destructive flows — the bare-form
  // toasts above lose context ("which case was deleted?"). These
  // interpolate {title} so the admin sees which case they just
  // acted on. Used by `useAdminPipeline`.
  "toast.case.deletedTitled": '"{title}" movido a papelera',
  "toast.case.purgedTitled": '"{title}" eliminado permanentemente',
  "toast.case.purgeFailed": "No se pudo eliminar — revisa la consola",
  "toast.action.undo": "Deshacer",
  "toast.category.added": 'Categoría "{label}" agregada',
  "toast.category.renamed": "Categoría renombrada",
  "toast.category.removed": '"{label}" eliminada',
  "toast.category.removeFailed": "No se pudo eliminar la categoría",
} as const;

/** Type alias for any valid translation key. */
export type DictKey = keyof typeof DICT_ES;

/** Shape every locale dictionary must satisfy. The English (and any
 *  future) dictionary is `Record<DictKey, string>` so a typo or
 *  missing key is a typecheck error. */
export type Dict = Record<DictKey, string>;
