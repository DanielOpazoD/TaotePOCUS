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

  // ─── Toasts (admin) ────────────────────────────────────────────
  "toast.case.deleted": "Case deleted",
  "toast.case.purged": "Case permanently deleted",
  "toast.case.restored": "Case restored",
  "toast.case.saved": "Case saved",
  "toast.case.edited": "Case edited · discard from the modal",
  "toast.action.undo": "Undo",
  "toast.category.added": 'Category "{label}" added',
  "toast.category.renamed": "Category renamed",
  "toast.category.removed": '"{label}" deleted',
  "toast.category.removeFailed": "Couldn't delete the category",
};
