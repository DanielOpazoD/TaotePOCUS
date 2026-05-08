"use client";

// Media: primary uploader, extra-images strip, error surface. Owns
// the file-pick / read-as-data-URL / size-validation pipeline shared
// between the primary and the extras. The cine-loop fallback lives
// on the Avanzado panel because it's a structural decision (only
// relevant when there's NO real media); keeping it there avoids
// crowding the media surface itself.

import { useRef } from "react";
import { Icon } from "@/lib/icons";
import type { CaseRecord, Media, MediaKind } from "@/lib/types";
import { MAX_UPLOAD_BYTES, type FormUpdate } from "./types";

interface Props {
  form: CaseRecord;
  update: FormUpdate;
  /** Bridges the parent's "is currently uploading" indicator (used
   *  on the upload affordance label). */
  uploading: boolean;
  setUploading: (v: boolean) => void;
  /** Bridges the size / MIME error so the surrounding form can
   *  highlight the panel that produced it (UX polish for tomorrow). */
  uploadError: string | null;
  setUploadError: (msg: string | null) => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function formatBytes(n: number) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

export function MediaPanel({
  form,
  update,
  uploading,
  setUploading,
  uploadError,
  setUploadError,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Secondary uploader: appends to `mediaExtra` so the same case can
  // host a sequence of images (e.g. parasternal + apical + subcostal
  // views). The primary `media` field still acts as the cover for
  // the card thumbnail; the modal carousel renders all of them.
  const extraFileRef = useRef<HTMLInputElement | null>(null);

  // Shared upload pipeline. Validates size + MIME, base64-encodes
  // the file, and routes the resulting `Media` either to the primary
  // `media` field or appends to `mediaExtra`.
  const processFile = async (f: File, target: "primary" | "extra"): Promise<void> => {
    setUploadError(null);
    if (f.size > MAX_UPLOAD_BYTES) {
      setUploadError(
        `El archivo pesa ${formatBytes(f.size)}. Máximo permitido: ${formatBytes(
          MAX_UPLOAD_BYTES,
        )}. Comprime el video o usa un GIF más liviano.`,
      );
      return;
    }
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/") && f.type !== "image/gif") {
      setUploadError(`Formato no soportado: ${f.type || "desconocido"}.`);
      return;
    }
    setUploading(true);
    try {
      const url = await fileToDataUrl(f);
      const kind: MediaKind = f.type.startsWith("video/")
        ? "video"
        : f.type === "image/gif"
          ? "gif"
          : "image";
      const media: Media = { kind, src: url, name: f.name, type: f.type };
      if (target === "primary") {
        update({ media });
      } else {
        update({
          mediaExtra: [...(form.mediaExtra ?? []), media],
        });
      }
    } catch {
      setUploadError("No se pudo leer el archivo.");
    } finally {
      setUploading(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // Reset the input so re-selecting the same file still fires onChange.
    e.target.value = "";
    if (!f) return;
    await processFile(f, "primary");
  };

  const onExtraFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of files) {
      // Sequential rather than parallel so the size validation stops
      // on the first oversized file and the admin sees one clear
      // error instead of a stack of toasts.
      await processFile(f, "extra");
    }
  };

  const removeExtra = (i: number) =>
    update({
      mediaExtra: (form.mediaExtra ?? []).filter((_, idx) => idx !== i),
    });

  return (
    <div className="admin-form-media">
      <label className="admin-label" htmlFor="case-media-upload">
        Imagen / Video / GIF
      </label>
      <div
        className="admin-uploader"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Seleccionar archivo de imagen, video o GIF"
      >
        {form.media ? (
          form.media.kind === "video" ? (
            <video src={form.media.src} autoPlay loop muted playsInline className="admin-preview" />
          ) : (
            <img src={form.media.src} className="admin-preview" alt="" />
          )
        ) : (
          <div className="admin-upload-empty">
            {Icon.upload()}
            <span>{uploading ? "Procesando…" : "Arrastra o haz clic para subir"}</span>
            <small>JPG · PNG · GIF · MP4 · WebM</small>
          </div>
        )}
        <input
          id="case-media-upload"
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          onChange={onFile}
          hidden
        />
      </div>
      {form.media && (
        <div className="admin-media-actions">
          <span className="admin-media-name">{form.media.name}</span>
          <button type="button" className="link-btn" onClick={() => update({ media: undefined })}>
            Quitar
          </button>
        </div>
      )}
      {/* Secondary uploader for multi-image cases. Hidden until
          the primary media is set so the form has a clear
          primary→extras flow (no orphaned extras without a
          cover). The button + thumbnail strip mirror the
          primary uploader's vocabulary. */}
      {form.media && (
        <div className="admin-media-extra">
          <label className="admin-label">Imágenes adicionales</label>
          <small className="admin-hint">
            Se mostrarán en el modal como un carrusel después de la imagen principal.
          </small>
          {form.mediaExtra && form.mediaExtra.length > 0 && (
            <ul className="admin-media-extra-list">
              {form.mediaExtra.map((m, i) => (
                <li key={`${m.src}-${i}`} className="admin-media-extra-item">
                  {m.kind === "video" ? (
                    <video
                      src={m.src}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="admin-media-extra-thumb"
                    />
                  ) : (
                    <img src={m.src} alt="" className="admin-media-extra-thumb" />
                  )}
                  <span className="admin-media-extra-name">{m.name}</span>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => removeExtra(i)}
                    aria-label={`Quitar ${m.name ?? `imagen ${i + 1}`}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn-ghost admin-media-extra-add"
            onClick={() => extraFileRef.current?.click()}
          >
            + Añadir otra imagen
          </button>
          <input
            ref={extraFileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={onExtraFiles}
            hidden
          />
        </div>
      )}
      {uploadError && (
        <div className="auth-error" role="alert">
          {uploadError}
        </div>
      )}
    </div>
  );
}
