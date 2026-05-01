# Data model

Quick reference for the shape of the domain types. The TypeScript
definitions in `lib/types.ts` are the source of truth — this doc
explains the bits that aren't obvious from the type signatures.

## `CaseRecord`

The main editorial unit. One per case in the catalog (whether seed,
imported, or user-uploaded).

### Identity

- `id` — opaque string. Two id spaces:
  - `tw-{tweetId}` for cases imported from the @TaotePOCUS Twitter
    archive (see `lib/imported-cases.ts`).
  - `u_{base36-time}` for user-uploaded cases (`u_` prefix +
    `Date.now().toString(36)`).
- `section` — `"atlas" | "ecg" | "cases" | "info"`. Drives which
  route the case appears under.
- `category` — built-in `CategoryId` literal or admin-defined
  custom id. Stored as `string` so runtime-added categories don't
  require a type-system change.

### Body content

- **`description?: string`** — **canonical** body field. Read via
  `getDescription(c)` in `lib/case-description.ts`; write through
  the form (which always targets this field). This is the one field
  new code should care about.
- `findings`, `summary`, `diagnosis` — `@deprecated`. Kept on the
  type because the imported corpus and any backups predating
  May-2026 store their text in these slots. Never read or write
  these directly; go through `getDescription`. See
  [ADR-0008](./adr/0008-canonical-description-field.md) for the
  removal plan.

### Media

- `media?: Media` — primary item (cover for the card thumbnail and
  first slide in the modal carousel).
- `mediaExtra?: Media[]` — additional items rendered in the modal
  carousel after `media`. Card thumbnail still shows only `media`.
- Read the unified list via `getCaseMedia(c)` in `lib/case-meta.ts`;
  it returns `[media, ...mediaExtra]` filtered.

When neither is set, `CineLoop` falls back to the synthetic
canvas-drawn loop scene specified by `loop` (one of
`"blines" | "tamponade" | "morrison" | ...` — exhaustive list in
`LoopKind`).

### Editorial metadata

- `author`, `role`, `date` — byline + ISO date. Always required.
- `tags: string[]` — free-form labels. The classifier panel
  enforces some conventions (`Sin clasificar` → not yet reviewed).
- `featured?: boolean` — promoted in the legacy FeaturedRow on
  non-Atlas sections. The Atlas Bento that used to consume this
  was removed (see [ADR-0009](./adr/0009-uniform-catalog-ui.md)).
- `difficulty?: "basic" | "intermediate" | "advanced"` — pill in
  the modal. Defaults to `"intermediate"` when absent.
- `lastUpdated?: string` — ISO. When more than 24 h after `date`,
  the modal shows an "Actualizado" pill. Detected by
  `wasUpdatedAfterPublication` in `lib/case-meta.ts`.

### Lifecycle flags

- `deletedAt?: string` + `deletedBy?: string` — soft-delete. Hidden
  from the public catalog; visible in the admin trash; reversible
  via `repo.cases.restore`.
- `purged?: boolean` — hard-delete tombstone. Hidden everywhere
  including the trash. The override stays as a marker so future
  re-imports of `lib/imported-cases.ts` keep filtering it. The
  blob store entry is also deleted. Once a case is purged it
  cannot be restored from inside the app — only from a backup
  predating the purge.
- `reviewed?: boolean` — admin-set flag. Surfaces as a green
  checkmark on the thumbnail and gates the queue filter on
  `/admin/clasificar`. Persisted as part of the override map so
  re-imports don't reset it.

### Framing

- `focus?: { x?: number; y?: number; scale?: number }` — per-case
  thumbnail focal point. `x`/`y` map to `object-position`
  percentages (default 50/50); `scale` is the zoom multiplier
  (default 1, range 0.5–3). The scale value crosses a
  `cover ↔ contain` threshold at 1: at scale=1 the image fills
  the cell with cropping; at scale<1 the renderer switches to
  `object-fit: contain` so the previously-cropped regions appear
  (May-2026 fix to the user-reported "shrinking doesn't expose
  more" bug).

## `Media`

`{ kind: "video" | "image" | "gif"; src: string; name?: string;
type?: string; modality?: string }`

`src` may be a `data:` URL (Stage 1/2 — uploaded via
`fileToDataUrl`) or a `/api/media/{key}` URL (Stage 3+, served
from the Netlify Blobs `pocus-media` store via the API route in
`app/api/media/[id]/route.ts`).

The `kind` is advisory — `CineLoop` actually picks the renderer
based on the file extension in `src`, because Twitter's
`animated_gif` media type is shipped as `.mp4` and a `<img>`
element can't paint mp4.

## Override map

Independent from `CaseRecord` rows: a `Record<string,
Partial<CaseRecord>>` keyed by case id. The merge layer
(`mergeWithOverrides` in `hooks/useCaseOverrides.ts`) applies
overrides on top of the source case at render time. This decouples
admin reclassifications / focus tweaks / purge tombstones from the
auto-generated imported corpus — the Twitter import script can
regenerate `lib/imported-cases.ts` without nuking admin edits.

## See also

- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — layering and folder
  structure.
- [`docs/PERSISTENCE.md`](./PERSISTENCE.md) — where each piece of
  the model lives at runtime, and the read/write paths.
- [`docs/adr/`](./adr/) — historical decisions about specific bits
  of the model.
