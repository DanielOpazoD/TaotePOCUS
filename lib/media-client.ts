// Client helpers for the media-* Netlify Functions.
//
// All admin-only routes need an `x-admin-token` header. The token is
// the value of `NEXT_PUBLIC_ADMIN_PASSWORD` (also used by the existing
// mock auth gate, see `lib/env.ts`) so any session that's already
// admin in the UI carries the same secret. In production the server
// should set `ADMIN_UPLOAD_TOKEN` to a separate value and the form
// should be updated to use that instead.
//
// These helpers swallow nothing — callers are expected to surface the
// error to the user.

import { ADMIN_CREDENTIALS } from "./env";
import type { MediaKind } from "./types";

export interface UploadedFile {
  key: string;
  url: string;
  kind: MediaKind;
  name: string;
  type: string;
  size: number;
}

export interface ListedFile extends UploadedFile {
  uploadedAt: string;
  etag?: string;
}

const ADMIN_HEADERS = (): HeadersInit => ({
  "x-admin-token": ADMIN_CREDENTIALS.password,
});

export async function uploadMedia(file: File): Promise<UploadedFile> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/media/upload", {
    method: "POST",
    headers: ADMIN_HEADERS(),
    body: fd,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as UploadedFile;
}

export async function listMedia(prefix?: string): Promise<ListedFile[]> {
  const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
  const res = await fetch(`/api/media/list${qs}`, {
    headers: ADMIN_HEADERS(),
  });
  if (!res.ok) {
    throw new Error(`List failed (${res.status})`);
  }
  const body = (await res.json()) as { files: ListedFile[] };
  return body.files;
}

export async function deleteMedia(key: string): Promise<void> {
  const res = await fetch("/api/media/delete", {
    method: "POST",
    headers: { ...ADMIN_HEADERS(), "content-type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    throw new Error(`Delete failed (${res.status})`);
  }
}
