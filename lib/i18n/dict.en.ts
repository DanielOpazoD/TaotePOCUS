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
  "nav.administrar.aria": "Admin",
  "nav.entrar": "Sign in",
  "nav.salir": "Sign out",
  "nav.menu.open": "Open menu",
  "nav.menu.close": "Close menu",
  "nav.menu.aria": "Navigation menu",

  // ─── Catalog pagination ────────────────────────────────────────
  "pagination.aria.label": "Catalog pagination",
  "pagination.summary.showing": "Showing",
  "pagination.summary.range": "–",
  "pagination.summary.of": "of",
  "pagination.indicator.page": "Page",
  "pagination.indicator.of": "of",
  "pagination.aria.first": "First page",
  "pagination.aria.last": "Last page",
  "pagination.aria.prev": "Previous page",
  "pagination.aria.next": "Next page",
  "pagination.prev": "‹ Previous",
  "pagination.next": "Next ›",

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
  "toolbar.difficulty.label": "Difficulty",

  // ─── Saved views (filter presets) ──────────────────────────────
  "savedViews.trigger.aria": "Saved views",
  "savedViews.trigger.title": "Saved views — shortcuts to your filters",
  "savedViews.trigger.label": "Views",
  "savedViews.menu.aria": "Saved views menu",
  "savedViews.heading": "Saved views",
  "savedViews.empty":
    "You haven't saved any views yet. Set up the filters you use often and save them to return with one click.",
  "savedViews.save.aria": "Save the current view",
  "savedViews.save.placeholder": 'View name (e.g. "Cardiac unreviewed")',
  "savedViews.save.submit": "Save current view",
  "savedViews.row.apply": "Apply view {name}",
  "savedViews.row.delete": "Delete view {name}",
  "savedViews.toast.saved": 'View "{name}" saved',
  "savedViews.toast.removed": "View deleted",
  "savedViews.toast.invalidName": "The name can't be empty",

  // ─── Bilingual case content fallback ───────────────────────────
  "case.fallback.badge": "ES",
  "case.fallback.title": "Translation pending — showing the Spanish original",

  // ─── Case modal meta (reading time, difficulty pills) ──────────
  "case.readingTime": "{minutes} min",
  "case.difficulty.basic": "Basic",
  "case.difficulty.intermediate": "Intermediate",
  "case.difficulty.advanced": "Advanced",

  // ─── Case card chrome ──────────────────────────────────────────
  "card.fav.aria": "Favorite",
  "card.reviewed.title": "Case reviewed",
  "card.reviewed.aria": "Reviewed",

  // ─── Featured row ──────────────────────────────────────────────
  "featured.title": "Featured",

  // ─── Recently-viewed rail ──────────────────────────────────────
  "recently.title": "Recently viewed",
  "recently.label": "Recently viewed cases",

  // ─── Keyboard shortcuts modal (`?` help) ───────────────────────
  "shortcuts.title": "Keyboard shortcuts",
  "shortcuts.intro": "Browse and filter without leaving the keyboard.",
  "shortcuts.then": "then",
  "shortcuts.close.aria": "Close",
  "shortcuts.label.search": "Search",
  "shortcuts.label.help": "Show shortcuts",
  "shortcuts.label.nextCase": "Next case",
  "shortcuts.label.prevCase": "Previous case",
  "shortcuts.label.below": "Case below (jumps one grid row)",
  "shortcuts.label.above": "Case above (jumps one grid row)",
  "shortcuts.label.first": "First case",
  "shortcuts.label.last": "Last case",
  "shortcuts.label.goAtlas": "Go to POCUS Atlas",
  "shortcuts.label.goEcg": "Go to ECG",
  "shortcuts.label.goCases": "Go to Clinical cases",
  "shortcuts.label.goInfo": "Go to Infographics",
  "shortcuts.label.goFavs": "Go to Favourites",
  "shortcuts.label.close": "Close modal / back",

  // ─── Presentation mode (fullscreen cinema) ─────────────────────
  "presentation.exit": "Exit",
  "presentation.exit.aria": "Exit (Esc)",
  "presentation.prev.aria": "Previous (←)",
  "presentation.next.aria": "Next (→)",
  "presentation.help.navigate": "navigate",
  "presentation.help.pause": "pause",
  "presentation.help.exit": "exit",

  // ─── Case modal — media carousel (multi-image cases) ──────────
  "modalLoop.aria.region": "Case gallery",
  "modalLoop.aria.slide": "Image {index} of {total}",
  "modalLoop.aria.prev": "Previous image",
  "modalLoop.aria.next": "Next image",
  "modalLoop.aria.dots": "Pick an image from this case",
  "modalLoop.aria.goto": "Go to image {index}",

  // ─── Modal error boundary fallback ─────────────────────────────
  "modal.boundary.title": "This case couldn't open",
  "modal.boundary.detailsLabel": "Details",
  "modal.boundary.close": "Close",

  // ─── Generic ErrorBoundary fallback (DefaultFallback) ──────────
  "boundary.title": "Something went wrong in this section",
  "boundary.body.modal": "The case couldn't open correctly.",
  "boundary.body.generic": "This part of the page failed to load.",
  "boundary.body.suffix": "You can retry or reload the tab if it persists.",
  "boundary.details.summary": "Technical details",
  "boundary.retry": "Retry",

  // ─── Case modal chrome (close, play/pause, sections, actions) ──
  "modal.close.aria": "Close case",
  "modal.close.title": "Close (Esc)",
  "modal.play.aria": "Play",
  "modal.pause.aria": "Pause",
  "modal.readingTime.title": "Estimated reading time",
  "modal.lastUpdated.title": "Updated: {date}",
  "modal.updated": "Updated",
  "modal.section.description": "Description",
  "modal.section.tags": "Tags",
  "modal.section.related": "Related cases",
  "modal.fav.aria": "Save to favorites",
  "modal.fav.title": "Save to favorites (F)",
  "modal.unfav.aria": "Remove from favorites",
  "modal.unfav.title": "Remove from favorites (F)",
  "modal.share.aria": "Share link to case",
  "modal.share.title": "Copy link to case (S)",
  "modal.present.aria": "Presentation mode",
  "modal.present.title": "Presentation mode (P)",

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

  // ─── Empty-state defaults (no results / no favs / per section) ─
  "empty.favs.title": "No saved cases yet",
  "empty.favs.message": "Tap the heart on any case to add it to your collection.",
  "empty.admin.title": "Nothing published",
  "empty.admin.message": "Your first uploaded case will show up here.",
  "empty.ecg.title": "Flatline",
  "empty.ecg.message": "No ECG matches these filters. Try adjusting the search.",
  "empty.cases.title": "No stories",
  "empty.cases.message": "No clinical cases for that combination. Clear filters and try again.",
  "empty.info.title": "No infographics",
  "empty.info.message": "No visual references match those criteria.",
  "empty.rayos.title": "No studies",
  "empty.rayos.message": "No radiograph or CT matches. Clear filters or try a different keyword.",
  "empty.default.title": "No results",
  "empty.default.message": "Try clearing the filters or searching for a different keyword.",
  "empty.action.exploreAtlas": "Explore the atlas",
  "empty.action.clearFilters": "Clear filters",

  // ─── Admin confirm dialogs (delete + permanent purge) ──────────
  "confirm.delete.title": 'Delete "{title}"?',
  "confirm.delete.message":
    "The case moves to the Trash and you can restore it from the admin panel.",
  "confirm.delete.confirm": "Delete",
  "confirm.delete.cancel": "Cancel",
  "confirm.purge.title": 'Permanently delete "{title}"?',
  "confirm.purge.message":
    "This erases the case and its media file (image / video) for good. It does NOT go to the trash and cannot be restored from the app — the only way back would be to import a previous JSON backup. Continue?",
  "confirm.purge.confirm": "Delete forever",
  "confirm.purge.cancel": "Cancel",

  // ─── CineLoop chrome ──────────────────────────────────────────
  "cine.fallbackAria": "Image",

  // ─── Synthetic-loop canvas labels ──────────────────────────────
  // ECG labels keep the universal POCUS abbreviations: STEMI is the
  // same in both languages; "AFib" / "AV block" are the standard
  // English forms used in ultrasound / cardiology training material.
  "scene.ecg.stemi": "INFERIOR STEMI",
  "scene.ecg.afib": "ATRIAL FIBRILLATION",
  "scene.ecg.bav": "COMPLETE AV BLOCK",
  "scene.info.blue.sub": "Acute dyspnea · algorithm",
  "scene.info.rush.sub": "Undifferentiated shock · 3 steps",
  "scene.info.fast.sub": "Trauma · 8 points",

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

  // ─── Admin panel — tabs ────────────────────────────────────────
  "admin.tabs.aria": "Admin views",
  "admin.tab.mine": "My cases",
  "admin.tab.classify": "Classify",
  "admin.tab.edit": "Bulk edit",
  "admin.tab.edit.title": "Edit titles, descriptions and tags in bulk",
  "admin.tab.categories": "Categories",
  "admin.tab.sections": "Sections",
  "admin.tab.activity": "Activity",
  "admin.tab.activity.title": "Append-only log of admin actions",
  "admin.tab.backup": "Backup",
  "admin.tab.focus": "Focus",
  "admin.tab.focus.title":
    "Configure default focus and zoom globally, per section, or per category",

  // ─── Focus editor (shared widget) ──────────────────────────────
  "focus.editor.foco": "FOCUS",
  "focus.editor.zoom": "ZOOM",
  "focus.editor.reset": "Reset",
  "focus.editor.save": "Save",
  "focus.editor.back": "Back",
  "focus.editor.aria.up": "Up",
  "focus.editor.aria.down": "Down",
  "focus.editor.aria.left": "Left",
  "focus.editor.aria.right": "Right",
  "focus.editor.aria.center": "Center",
  "focus.editor.aria.zoomIn": "Zoom in",
  "focus.editor.aria.zoomOut": "Zoom out",

  // ─── Focus defaults panel (Focus admin tab) ────────────────────
  "focus.defaults.title": "Default focus & zoom",
  "focus.defaults.intro":
    "Define the framing for thumbnails when a case has no per-case override. Precedence: per-case → category → section → global. Editing a thumbnail through the admin menu still wins — this only applies when the case has no focus of its own.",
  "focus.defaults.usingDefault": "Default (centered, 100%)",
  "focus.defaults.global.label": "Global (all sections)",
  "focus.defaults.sections.label": "Per section",
  "focus.defaults.categories.label": "Per category",
  "focus.defaults.resetAll": "Reset all",
  "focus.defaults.confirmResetAll":
    "This will clear every focus default (global, per section and per category). Per-case overrides are NOT touched. Continue?",

  // ─── Admin panel — Mine tab ────────────────────────────────────
  "admin.mine.stats.total": "Total cases",
  "admin.mine.stats.uploaded": "Uploaded by you",
  "admin.mine.stats.realMedia": "With real media",
  "admin.mine.stats.categories": "Categories",
  "admin.mine.publications": "Your publications",
  "admin.mine.empty.body":
    "You haven't published any cases yet. Start by uploading your first ultrasound finding.",
  "admin.mine.empty.cta": "Publish first case",
  "admin.mine.col.title": "Title",
  "admin.mine.col.category": "Category",
  "admin.mine.col.type": "Type",
  "admin.mine.col.date": "Date",
  "admin.mine.synthetic": "Synthetic",
  "admin.mine.action.edit": "Edit",
  "admin.mine.action.trash": "Move to trash",
  "admin.mine.trash.title": "Trash",
  "admin.mine.trash.count.one": "{count} deleted",
  "admin.mine.trash.count.many": "{count} deleted",
  "admin.mine.trash.col.title": "Title",
  "admin.mine.trash.col.deletedAt": "Deleted",
  "admin.mine.trash.col.deletedBy": "By",
  "admin.mine.action.restore": "Restore",
  "admin.mine.action.purge": "Delete permanently",
  "admin.mine.imports.title": "Imported trash",
  "admin.mine.imports.purge.title":
    "Permanent delete · removes metadata and the file from blob storage",

  // ─── Admin panel — BulkEdit ────────────────────────────────────
  "bulk.filters.aria": "Filters",
  "bulk.filter.section.aria": "Section",
  "bulk.filter.category.aria": "Category",
  "bulk.filter.search.aria": "Search the table",
  "bulk.pagesize.aria": "Cases per page",
  "bulk.pagesize.option": "{n} / page",
  "bulk.count.range": "{start}–{end} of {total}",
  "bulk.col.title": "Title",
  "bulk.col.description": "Description",
  "bulk.col.category": "Category",
  "bulk.col.tags": "Tags",
  "bulk.col.reviewed.title": "Marked as reviewed",
  "bulk.filter.section.all": "All sections",
  "bulk.filter.category.all": "All categories",
  "bulk.filter.search.placeholder": "Search by title, description or tag…",
  "bulk.empty.filtered": "No cases match the current filters.",
  "bulk.empty.clearFilters": "Clear filters",
  "bulk.empty.catalog": "The catalog is empty.",
  "bulk.action.changeSection": "Change section…",
  "bulk.action.changeSection.aria": "Change section of selected",
  "bulk.action.changeCategory": "Change category…",
  "bulk.action.changeCategory.aria": "Change category of selected",
  "bulk.action.markReviewed": "✓ Mark reviewed",
  "bulk.action.unmarkReviewed": "✗ Unmark",
  "bulk.action.delete": "Delete",
  "bulk.action.moveTrash": "Move to trash",
  "bulk.action.confirmDelete.one": "Move {count} case to the trash? You can undo this action.",
  "bulk.action.confirmDelete.many": "Move {count} cases to the trash? You can undo this action.",
  "bulk.selection.aria": "Bulk actions",
  "bulk.selection.count.one": "{count} selected",
  "bulk.selection.count.many": "{count} selected",
  "bulk.action.clear": "Clear",
  "bulk.action.clearTitle": "Clear selection",
  "bulk.pagination.prev": "← Previous",
  "bulk.pagination.prev.aria": "Previous page",
  "bulk.pagination.next": "Next →",
  "bulk.pagination.next.aria": "Next page",
  "bulk.pagination.position": "Page {current} of {total}",
  "bulk.thumb.openEdit": "Open full editor for {title}",
  "bulk.row.openModal": "Open modal",
  "bulk.selectAll.aria": "Select all visible",
  "bulk.tags.editAria": "Edit tags",
  "bulk.tags.empty": "— no tags —",
  "bulk.tags.input.aria": "Tags, comma-separated",
  "bulk.tags.input.placeholder": "e.g. B-lines, Pathological",
  "bulk.row.menu.aria": "More actions",
  "bulk.row.openFull": "Open full modal",
  "bulk.row.delete": "Delete case",
  "bulk.cell.editHint": "{label} (click to edit)",
  "bulk.cell.empty": "— empty —",
  "bulk.row.checkbox.select": "Select {title}",
  "bulk.row.category.aria": "Category of {title}",
  "bulk.row.reviewed.toggleOn": "{title}: mark reviewed",
  "bulk.row.reviewed.toggleOff": "{title}: unmark reviewed",

  // ─── Admin panel — ClassifierBoard ─────────────────────────────
  "classifier.title": "Global classifier",
  "classifier.intro":
    "Drag any thumbnail onto a section or category to reclassify. Click the ✓ to mark a case as reviewed. Click the thumbnail to open the full editor. Use the filters to find an already-classified case and reassign or delete it.",
  "classifier.tab.unclassified": "Unclassified",
  "classifier.tab.unreviewed": "Unreviewed",
  "classifier.tab.all": "All",
  "classifier.search.placeholder": "Search title, summary, findings, tags…",
  "classifier.search.aria": "Search cases by text",
  "classifier.filter.section.aria": "Filter by section",
  "classifier.filter.category.aria": "Filter by category",
  "classifier.filter.section.any": "Any section",
  "classifier.filter.category.any": "Any category",
  "classifier.filter.clear": "× Clear filters",
  "classifier.filter.clear.aria": "Clear auxiliary filters",
  "classifier.results.one": "{count} result",
  "classifier.results.many": "{count} results",
  "classifier.targets.section": "Section →",
  "classifier.targets.category": "Category →",
  "classifier.targets.section.aria": "Sections",
  "classifier.targets.category.aria": "Categories",
  "classifier.empty.unclassified": "No unclassified cases.",
  "classifier.empty.unreviewed": "No cases pending review.",
  "classifier.empty.all": "The catalog is empty.",
  "classifier.empty.title": "Nothing to classify",
  "classifier.empty.body": "When this filter has pending cases, they'll show up here.",
  "classifier.thumb.title": "Click to edit · ⌘/Ctrl+click to select",
  "classifier.thumb.aria": "Edit {title}",
  "classifier.review.markAria": "Mark reviewed",
  "classifier.review.markTitle": "Mark as reviewed",
  "classifier.review.unmarkTitle": "Remove reviewed mark",
  // ─── Admin panel — Classifier bulk action bar ──────────────────
  "classifier.bulk.aria": "Bulk actions",
  "classifier.bulk.count.suffix.one": "selected",
  "classifier.bulk.count.suffix.many": "selected",
  "classifier.bulk.markReviewed": "✓ Mark reviewed",
  "classifier.bulk.markReviewed.title": "Mark all as reviewed",
  "classifier.bulk.unmarkReviewed": "Unmark reviewed",
  "classifier.bulk.unmarkReviewed.title": "Remove reviewed mark from all",
  "classifier.bulk.section.label": "Move section to",
  "classifier.bulk.section.placeholder": "Move section…",
  "classifier.bulk.category.label": "Move category to",
  "classifier.bulk.category.placeholder": "Move category…",
  "classifier.bulk.trash": "🗑 Move to trash",
  "classifier.bulk.trash.title": "Move the selected cases to trash",
  "classifier.bulk.clear": "Clear",
  "classifier.bulk.clear.title": "Clear selection · Esc",
  "classifier.dragHint.label": "Dragging",
  "classifier.dragHint.fallback": "case",
  "classifier.dragHint.empty": "Drop onto a section or category",
  "classifier.checkbox.aria": "Select {title}",

  // ─── Admin panel — Categories editor ───────────────────────────
  "categories.intro.title": "Categories",
  "categories.intro.body":
    "Built-in categories can't be modified (their translations come from the i18n dictionary). Custom ones you create here show up in the classifier and the edit form. The English field is optional — leave it blank and the Spanish baseline is shown as fallback.",
  "categories.add.placeholder.es": "Category · ES (e.g. Pediatría)",
  "categories.add.placeholder.en": "Category · EN (optional)",
  "categories.add.aria.es": "New category name in Spanish",
  "categories.add.aria.en": "New category name in English",
  "categories.add.submit": "Add",
  "categories.error.create": "Couldn't create the category (already exists?)",
  "categories.section.builtin": "Built-in",
  "categories.section.custom": "Custom",
  "categories.count": "{count} categories",
  "categories.row.cases.one": "{count} case",
  "categories.row.cases.many": "{count} cases",
  "categories.row.builtin.tag": "Built-in",
  "categories.row.translation.title": "English translation",
  "categories.row.toggleVisible": "Show {label} in the atlas",
  "categories.row.toggleHidden": "Hide {label} from the atlas",
  "categories.row.toggleVisible.title": "Hidden from the public sidebar — click to show",
  "categories.row.toggleHidden.title": "Visible in the public sidebar — click to hide",
  "categories.row.rename.aria": "Rename {label}",
  "categories.row.rename.es.aria": "Rename {label} in Spanish",
  "categories.row.rename.en.aria": "Rename {label} in English",
  "categories.row.rename.title": "Rename (ES + EN)",
  "categories.row.rename.placeholder.es": "Spanish",
  "categories.row.rename.placeholder.en": "English (optional)",
  "categories.row.save": "Save",
  "categories.row.save.title": "Save (Enter)",
  "categories.row.cancel": "Cancel",
  "categories.row.cancel.title": "Cancel (Esc)",
  "categories.row.delete.aria": "Delete {label}",
  "categories.row.delete.title": "Delete category",
  "categories.row.delete.confirm.one":
    '{label} is assigned to {count} case. If you delete it, the case will keep "{id}" as a broken reference. Continue?',
  "categories.row.delete.confirm.many":
    '{label} is assigned to {count} cases. If you delete it, those cases will keep "{id}" as a broken reference. Continue?',
  "categories.empty":
    "You haven't created any custom categories yet. Use the field above to start.",

  // ─── Admin panel — Sections editor ─────────────────────────────
  "sections.intro.title": "Sections",
  "sections.intro.body":
    "Click the pencil to rename a section: you can set a Spanish name (mandatory when overriding) and an optional English one. Visitors see the slot that matches the active language, with fallback to Spanish. URLs and shared links don't change. Hidden sections still resolve at their URL but disappear from the nav.",
  "sections.row.rename.title": "Click to rename",
  "sections.row.reset": "Restore",
  "sections.row.reset.title": "Restore default names ({default})",
  "sections.row.renamed.title": "Renamed from default",
  "sections.row.toggleVisible": "Show {label} in the menu",
  "sections.row.toggleHidden": "Hide {label} from the menu",
  "sections.row.toggleVisible.title": "Hidden from the public menu — click to show",
  "sections.row.toggleHidden.title": "Visible in the public menu — click to hide",
  "sections.row.rename.es.aria": "Rename {label} in Spanish",
  "sections.row.rename.en.aria": "Rename {label} in English",
  "sections.row.rename.placeholder.en": "English (optional)",
  "sections.row.rename.tooltip": "Rename (ES + EN)",
  "sections.row.translation.title": "English translation",
  "sections.row.rename.aria": "Rename {label}",
  "sections.row.cases.one": "{count} case",
  "sections.row.cases.many": "{count} cases",
  "sections.row.save": "Save",
  "sections.row.save.title": "Save (Enter)",
  "sections.row.cancel": "Cancel",
  "sections.row.cancel.title": "Cancel (Esc)",

  // ─── Admin panel — CaseForm chrome ─────────────────────────────
  "form.head.edit": "Edit case",
  "form.head.new": "New case",
  "form.head.title": "Upload content to the atlas",
  "form.head.body":
    "Static image, GIF, video clip, or synthetic cine-loop if you don't have a file yet.",
  "form.tabs.aria": "Form tabs",
  "form.tab.metadata": "Metadata",
  "form.tab.media": "Media",
  "form.tab.advanced": "Advanced",
  "form.tab.ai": "AI",
  "form.action.cancel": "Cancel",
  "form.action.save": "Save changes",
  "form.action.publish": "Publish case",
  "form.label.optional": "(optional)",
  "form.label.title.es": "Title · ES",
  "form.label.title.en": "Title · EN",
  "form.placeholder.title.es": "E.g. Massive pleural effusion",
  "form.placeholder.title.en": "Ex: Massive pleural effusion",
  "form.label.category": "Category",
  "form.label.modality": "Modality / probe",
  "form.placeholder.modality": "Linear probe · 5 MHz",
  "form.label.author": "Author",
  "form.label.role": "Specialty",
  "form.label.date": "Date",
  "form.label.description.es": "Description · ES",
  "form.label.description.en": "Description · EN",
  "form.placeholder.description.es":
    "Describe the case: clinical context, what's visible, conclusion…",
  "form.placeholder.description.en":
    "Describe the case: clinical context, what's visible, conclusion…",
  "form.label.tags.es": "Tags · ES",
  "form.label.tags.en": "Tags · EN",
  "form.placeholder.tag.es": "Add tag + Enter",
  "form.placeholder.tag.en": "Add tag + Enter",
  "form.action.removeTag": "Remove tag {tag}",
  "form.action.removeTag.en": "Remove tag {tag}",

  // ─── CaseForm — Media panel ────────────────────────────────────
  "form.media.label": "Image / Video / GIF",
  "form.media.uploader.aria": "Select an image, video or GIF file",
  "form.media.processing": "Processing…",
  "form.media.dropPrompt": "Drag or click to upload",
  "form.media.formats": "JPG · PNG · GIF · MP4 · WebM",
  "form.media.remove": "Remove",
  "form.media.extra.label": "Additional images",
  "form.media.extra.hint": "Shown in the modal as a carousel after the primary image.",
  "form.media.extra.add": "+ Add another image",
  "form.media.extra.removeAria": "Remove {name}",
  "form.media.extra.fallbackName": "image {n}",
  "form.media.error.size":
    "File weighs {actual}. Max allowed: {max}. Compress the video or use a lighter GIF.",
  "form.media.error.format": "Unsupported format: {type}.",
  "form.media.error.formatUnknown": "unknown",
  "form.media.error.read": "Couldn't read the file.",

  // ─── CaseForm — Advanced panel ─────────────────────────────────
  "form.advanced.section.label": "Section",
  "form.advanced.loop.label": "Synthetic cine-loop (fallback)",
  "form.advanced.loop.hint":
    "Used only when there's no real media. The canvas animation is automatically replaced when you upload a file.",
  "form.advanced.loop.notUsed":
    "This case already has real media attached — the synthetic cine-loop isn't used.",
  "form.advanced.featured.label": "Mark as featured",
  "form.advanced.featured.hint":
    'Featured cases appear in the "Featured" carousel on each section.',
  "form.advanced.loop.blines": "B-lines",
  "form.advanced.loop.tamponade": "Tamponade",
  "form.advanced.loop.morrison": "FAST / Morrison",
  "form.advanced.loop.seashore": "Seashore (M-mode)",
  "form.advanced.loop.ijv": "Internal jugular",
  "form.advanced.loop.dvt": "DVT",
  "form.advanced.loop.hydro": "Hydronephrosis",
  "form.advanced.loop.ob": "Gestational sac",
  "form.advanced.loop.lvfunction": "LV function",
  "form.advanced.loop.aaa": "AAA",
  "form.advanced.loop.consolidation": "Consolidation",
  "form.advanced.loop.gallstone": "Gallstone",

  // ─── ConfirmDialog ─────────────────────────────────────────────
  "confirm.dismiss.aria": "Dismiss dialog",
  "confirm.cancel": "Cancel",
  "confirm.confirm": "Confirm",
  "confirm.delete": "Delete",
  "confirm.purge": "Delete permanently",

  // ─── AuthModal (legacy email+password path) ────────────────────
  "auth.close.aria": "Close",
  "auth.aria": "Sign in",
  "auth.title.login": "Welcome back",
  "auth.title.register": "Create your account",
  "auth.intro.login": "Sign in to save cases to your collection.",
  "auth.intro.register": "Save cases, follow topics, and build your own atlas.",
  "auth.label.name": "Name",
  "auth.placeholder.name": "Dr. María Pérez",
  "auth.label.email": "Email",
  "auth.placeholder.email": "you@email.com",
  "auth.label.password": "Password",
  "auth.placeholder.password": "••••••••",
  "auth.action.busy": "Verifying…",
  "auth.action.login": "Sign in",
  "auth.action.register": "Create account",
  "auth.alt.toRegister": "New here? ",
  "auth.alt.toLogin": "Already have an account? ",
  "auth.demo.title": "Demo admin:",

  // ─── Admin panel — Backup ─────────────────────────────────────
  "backup.intro.title": "Backup",
  "backup.intro.body":
    "Export a JSON file with everything you've done from admin: reclassifications, custom categories, your own cases and favorites. Save it to Drive / Dropbox / iCloud — it's your only safety net against losing browser data, switching machines, or reinstalling.",
  "backup.relative.never": "never",
  "backup.relative.today": "today",
  "backup.relative.yesterday": "yesterday",
  "backup.relative.daysAgo": "{days} days ago",
  "backup.status.label": "Last backup",
  "backup.status.warn.stale":
    "More than {days} days ago — download a new one if you've classified cases since then.",
  "backup.status.warn.never":
    "You haven't taken a backup yet. Download one before classifying further.",
  "backup.export.title": "Export",
  "backup.export.body": "Download a snapshot of the current state.",
  "backup.summary.overrides": "reclassifications",
  "backup.summary.categories": "custom categories",
  "backup.summary.categoriesShort": "categories",
  "backup.summary.userCases": "your own cases",
  "backup.summary.favorites": "favorites",
  "backup.export.action": "Export backup",
  "backup.toast.exported":
    "Backup downloaded · {overrides} reclassifications, {categories} categories, {userCases} own cases",
  "backup.import.title": "Import",
  "backup.import.body.prefix": "Replace the current state with the file's contents. This operation",
  "backup.import.body.strong": "overwrites",
  "backup.import.body.suffix": "your local data — use with care.",
  "backup.import.action": "Pick JSON file…",
  "backup.error.invalidJson": "The file isn't valid JSON.",
  "backup.error.invalidEnvelope":
    "The file doesn't look like a valid backup (wrong version or different structure).",
  "backup.error.read": "Couldn't read the file.",
  "backup.error.writeFailed": "localStorage write failed (out of space?).",
  "backup.error.restoreUnknown": "Couldn't restore — check the console.",
  "backup.toast.restored":
    "Backup restored · {overrides} reclassifications, {categories} categories. Reloading…",
  "backup.confirm.restore.title": "Replace your local data?",
  "backup.confirm.restore.body":
    "You're about to overwrite the current state with this backup from {date}{by}.",
  "backup.confirm.restore.warn":
    "Your current data will be lost. If you have unexported changes, cancel and download a fresh backup first.",
  "backup.confirm.restore.confirm": "Replace and reload",
  "backup.confirm.cancel": "Cancel",
  "backup.db.title": "Sync with the database",
  "backup.db.body":
    "Upload the current localStorage state to Postgres (Netlify Database). The operation replaces all data in the DB with the local one — use for the initial migration or to reconcile drift after a sync failure.",
  "backup.db.action": "Upload to the database",
  "backup.db.action.busy": "Uploading…",
  "backup.db.error":
    "Couldn't upload to the database. Check the Netlify Functions logs for details.",
  "backup.db.error.exception": "Error: {message}",
  "backup.db.error.unknown": "Unknown error during upload.",
  "backup.db.toast":
    "Uploaded to DB · {overrides} reclassifications, {categories} categories, {userCases} own cases, {favs} favorites",
  "backup.db.confirm.title": "Upload to the database?",
  "backup.db.confirm.body":
    "Postgres contents will be overwritten with the current state of your browser. This operation is atomic — all or nothing.",
  "backup.db.confirm.warn":
    "If you've worked from another device and there's data only in the DB, you'll lose it. For those cases, export a backup from the other device first.",
  "backup.db.confirm.confirm": "Upload and replace",

  // ─── Admin panel — Activity feed ──────────────────────────────
  "activity.intro.title": "Activity",
  "activity.intro.body":
    "Append-only log of every admin change: overrides, categories, cases deleted or restored, imports. Useful for auditing who did what and when.",
  "activity.skeleton.aria": "Loading activity…",
  "activity.filter.aria": "Filter by action type",
  "activity.filter.all": "All actions",
  "activity.count.suffix": "actions",
  "activity.count.of": "of {total}",
  "activity.error.auth": "You need to sign in to view activity.",
  "activity.error.forbidden": "Your account doesn't have admin permissions.",
  "activity.error.load": "Couldn't load activity. Try again later.",
  "activity.error.network": "Network error. Try again later.",
  "activity.empty": "No actions logged yet. Any admin edit you make from now on shows up here.",
  "activity.col.date": "Date",
  "activity.col.action": "Action",
  "activity.col.target": "Case / object",
  "activity.col.admin": "Admin",
  "activity.empty.filtered": "No «{label}» actions in the loaded range.",
  "activity.loadMore": "Load more",
  "activity.loadMore.busy": "Loading…",
  "activity.kind.override_set": "Override applied",
  "activity.kind.override_cleared": "Override discarded",
  "activity.kind.category_added": "Category created",
  "activity.kind.category_renamed": "Category renamed",
  "activity.kind.category_removed": "Category deleted",
  "activity.kind.user_case_saved": "Case saved",
  "activity.kind.user_case_soft_deleted": "Case moved to trash",
  "activity.kind.user_case_restored": "Case restored",
  "activity.kind.import_purged": "Case permanently deleted",
  "activity.kind.bulk_imported": "Bulk import",

  // ─── Toasts (admin) ────────────────────────────────────────────
  "toast.case.deleted": "Case deleted",
  "toast.case.purged": "Case permanently deleted",
  "toast.case.restored": "Case restored",
  "toast.case.saved": "Case saved",
  "toast.case.edited": "Case edited · discard from the modal",
  "toast.case.deletedTitled": '"{title}" moved to trash',
  "toast.case.purgedTitled": '"{title}" permanently deleted',
  "toast.case.purgeFailed": "Couldn't delete — check the console",
  "toast.action.undo": "Undo",
  "toast.category.added": 'Category "{label}" added',
  "toast.category.renamed": "Category renamed",
  "toast.category.removed": '"{label}" deleted',
  "toast.category.removeFailed": "Couldn't delete the category",
};
