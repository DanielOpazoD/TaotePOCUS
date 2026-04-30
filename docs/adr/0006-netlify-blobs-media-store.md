# ADR 0006 — Netlify Blobs as the media store

- **Status**: Accepted.
- **Date**: 2026-04-29
- **Decider(s)**: Project lead

## Context

Until now, every image / GIF / video uploaded through the admin form was converted to a base64 `data:` URL by `FileReader` and stuffed into `localStorage` alongside the rest of the case record. That worked for a tiny demo catalog but had three hard limits:

- **5 MB per origin total** for `localStorage`. We hard-capped uploads at 3 MB and still had to share that quota with sessions, favourites, and the seed catalog.
- **No documents.** PDFs, DOCs, audio, anything that wasn't an image or short video clip simply could not be persisted.
- **No sharing.** Every browser sees its own private copy — what one admin uploads on a laptop is invisible on the next device.

ADR-0004 already pointed at Firebase as the primary persistence path for structured data (cases, favs, sessions). That migration covers records but **not** files: Firebase Storage would work, but it adds another SDK, another set of security rules, and another billing surface to babysit. The site already runs on Netlify, so leaning on the platform's own object store is cheaper to operate.

## Decision

Files associated with cases (images, GIFs, videos, PDFs, simple Office docs, audio) live in **Netlify Blobs**, in a single site-level store named `case-media`. A small Functions API mediates access:

| Route                    | Method | Auth        | Purpose                                                                    |
| ------------------------ | ------ | ----------- | -------------------------------------------------------------------------- |
| `/api/media/upload`      | POST   | admin token | Multipart upload → Blobs, returns `{ key, url, kind, name, type, size }`   |
| `/api/media/serve?key=…` | GET    | public      | Streams the blob with original content-type and `Cache-Control: immutable` |
| `/api/media/list`        | GET    | admin token | Lists every blob with metadata for an admin file browser                   |
| `/api/media/delete`      | POST   | admin token | Removes a blob by key                                                      |

Implementation details:

- **Store name** and helpers live in `netlify/functions/_media-shared.mts` so the four entrypoints can't drift on key shape, allowed mime types, or auth gate.
- **Keys** are `<kind>/<timestamp-base36>-<random>-<safe-filename>` so listings sort newest-last by kind, and a stable URL always maps to the same bytes (cache-friendly).
- **Auth** is a server-validated `x-admin-token` header. When `ADMIN_UPLOAD_TOKEN` is set on the server it's the source of truth; otherwise the function falls back to `NEXT_PUBLIC_ADMIN_PASSWORD` so any session that's already admin in the UI can upload without a separate secret. With neither set, the gate is open — useful for `netlify dev`, never for production.
- **Production isolation**: production uses the long-lived site-level store (`getStore`), preview / branch deploys use a deploy-scoped store (`getDeployStore`) so contributor work cannot leak into prod data.
- **Type model**: `Media` gained an optional `key` (so the admin can later delete the blob) and `size` (file browser column). `MediaKind` gained `"document"` for non-renderable file types.
- **Form** (`components/admin/CaseForm.tsx`) no longer reads files into base64. It POSTs the raw `File` to `/api/media/upload` and stores the returned `url` and `key` on the case. The upload cap is now 50 MB.

## Consequences

**Wins:**

- Files survive deploys, sync across devices, and don't compete with `localStorage` quota.
- Documents (PDF, DOC, CSV, plain text) now have a home.
- The serve URL is just a function path — no third-party CDN to configure, and CSP `media-src 'self'` already covers it.
- `Media.key` lets a future cleanup task purge orphaned blobs when cases are permanently deleted from trash.

**Trade-offs:**

- Function payload limits cap practical uploads at well under the Blobs 5 GB object ceiling — for very large videos we'd need a signed-URL flow that uploads directly to Blobs, bypassing the function.
- Auth is still keyed off the same secret as the existing client-side admin gate. Good enough for a single-admin demo; the migration to Firebase Auth (ADR-0004) should hand the function a verifiable Firebase ID token instead.
- `case-media` is one flat store. If the catalog grows past a few thousand files we may want per-section stores (`case-media-atlas`, `case-media-ecg`) to keep `list()` cheap.

## Alternatives considered

- **Firebase Storage** — same SDK as the rest of the persistence path, but adds a second set of rules, doubles up auth complexity, and pulls more JS into the bundle for a feature that's admin-only.
- **Cloudinary / S3** — both work, but neither is zero-config, and both add an external account and billing surface for a project the user wants to keep on Netlify.
- **Continue with base64 in `localStorage`** — already at the breaking point at 3 MB; not viable for documents at all.
