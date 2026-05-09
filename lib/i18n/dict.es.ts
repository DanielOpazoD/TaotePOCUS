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

  // ─── Admin panel — Mine tab ────────────────────────────────────
  "admin.mine.stats.total": "Casos totales",
  "admin.mine.stats.uploaded": "Subidos por ti",
  "admin.mine.stats.realMedia": "Con media real",
  "admin.mine.stats.categories": "Categorías",
  "admin.mine.publications": "Tus publicaciones",
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
  "bulk.empty.filtered": "No hay casos que coincidan con los filtros.",
  "bulk.empty.clearFilters": "Limpiar filtros",
  "bulk.empty.catalog": "Aún no hay casos en el catálogo.",
  "bulk.action.changeSection": "Cambiar sección…",
  "bulk.action.changeSection.aria": "Cambiar sección de seleccionados",
  "bulk.action.changeCategory": "Cambiar categoría…",
  "bulk.action.changeCategory.aria": "Cambiar categoría de seleccionados",
  "bulk.action.markReviewed": "✓ Marcar revisado",
  "bulk.action.unmarkReviewed": "✗ Sin marcar",
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
