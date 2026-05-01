"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { CATEGORIES } from "@/lib/data";
import { getDescription } from "@/lib/case-description";
import type { CaseRecord, Category, Media, MediaKind, User, LoopKind } from "@/lib/types";

// localStorage caps at ~5 MB across all keys (per origin in most browsers).
// dataURL adds ~33% over the binary size due to base64. We hard-cap raw
// uploads at 3 MB so the encoded form stays under ~4 MB and there's room
// left for other state. The admin will see a clear toast if rejected.
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

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

interface Props {
  initial: CaseRecord | null;
  currentUser: User | null;
  /** Categories list (built-in + custom). Defaults to the static
   *  `CATEGORIES` so the form keeps working when rendered standalone
   *  (tests, future flows) without the admin context. */
  categories?: Category[];
  onSave: (c: CaseRecord) => void;
  onCancel: () => void;
}

export default function CaseForm({
  initial,
  currentUser,
  categories = CATEGORIES,
  onSave,
  onCancel,
}: Props) {
  const blank: CaseRecord = {
    id: "",
    section: "atlas",
    title: "",
    category: "cardiac",
    tags: [],
    modality: "",
    loop: "blines",
    media: undefined,
    author: currentUser?.name || "Administrador",
    role: "Administrador",
    date: new Date().toISOString().slice(0, 10),
    description: "",
    featured: false,
  };
  const [form, setForm] = useState<CaseRecord>(initial || blank);
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Secondary uploader: appends to `mediaExtra` so the same case can
  // host a sequence of images (e.g. parasternal + apical + subcostal
  // views). The primary `media` field still acts as the cover for
  // the card thumbnail; the modal carousel renders all of them.
  const extraFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const update = (patch: Partial<CaseRecord>) => setForm((f) => ({ ...f, ...patch }));

  // Shared upload pipeline. Validates size + MIME, base64-encodes the
  // file, and routes the resulting `Media` either to the primary
  // `media` field or appends to `mediaExtra`. Returns true on success
  // so the caller knows whether to clear the input (it always clears,
  // but having a return value makes future flows like "drop = upload"
  // composable).
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
        setForm((prev) => ({
          ...prev,
          mediaExtra: [...(prev.mediaExtra ?? []), media],
        }));
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

  // Bulk-add additional media via the secondary uploader. We accept
  // multiple files in one pick so the admin can drop a whole gallery
  // (e.g. four echocardiographic views) without four round-trips.
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
    setForm((prev) => ({
      ...prev,
      mediaExtra: (prev.mediaExtra ?? []).filter((_, idx) => idx !== i),
    }));

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!form.tags.includes(t)) update({ tags: [...form.tags, t] });
    setTagInput("");
  };

  const removeTag = (t: string) => update({ tags: form.tags.filter((x) => x !== t) });

  // Description is the single body field shown in the form. Reads
  // and writes go through the canonical `description` field; the
  // fallback chain that used to live in `getDescription` was
  // removed when ADR-0010 backfilled the legacy data. The helper
  // call stays as a single read point for future cross-cutting
  // transforms (sanitization, localization, etc.).
  const description = getDescription(form);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !description.trim()) return;
    const id = form.id || `u_${Date.now().toString(36)}`;
    onSave({ ...form, id });
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal admin-form-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative" }}
      >
        <button className="modal-close" onClick={onCancel} type="button">
          {Icon.close()}
        </button>
        <form onSubmit={submit}>
          <div className="admin-form-head">
            <div className="case-cat">{initial ? "Editar caso" : "Nuevo caso"}</div>
            <h2>Sube contenido al atlas</h2>
            <p>
              Imagen estática, GIF, video clip o cine-loop sintético si todavía no tienes archivo.
            </p>
          </div>

          <div className="admin-form-grid">
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
                    <video
                      src={form.media.src}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="admin-preview"
                    />
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
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => update({ media: undefined })}
                  >
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

              <label className="admin-label" style={{ marginTop: 18 }}>
                Sección
              </label>
              <select
                value={form.section}
                onChange={(e) => update({ section: e.target.value as CaseRecord["section"] })}
                className="admin-input"
              >
                <option value="atlas">Atlas POCUS</option>
                <option value="ecg">ECG</option>
                <option value="cases">Casos clínicos</option>
                <option value="info">Infografías</option>
              </select>

              {/* Cine-loop fallback dropdown is only relevant when there's
                  NO real media — it picks the synthetic scene drawn on
                  canvas as a placeholder. Once a real video/image is
                  attached, the field is irrelevant and just clutter. */}
              {!form.media ? (
                <>
                  <label className="admin-label">Cine-loop sintético (fallback)</label>
                  <select
                    value={form.loop}
                    onChange={(e) => update({ loop: e.target.value as LoopKind })}
                    className="admin-input"
                  >
                    <option value="blines">B-líneas</option>
                    <option value="tamponade">Tamponade</option>
                    <option value="morrison">FAST / Morrison</option>
                    <option value="seashore">Seashore (modo M)</option>
                    <option value="ijv">Yugular interna</option>
                    <option value="dvt">TVP</option>
                    <option value="hydro">Hidronefrosis</option>
                    <option value="ob">Saco gestacional</option>
                    <option value="lvfunction">Función VI</option>
                    <option value="aaa">AAA</option>
                    <option value="consolidation">Consolidación</option>
                    <option value="gallstone">Colelitiasis</option>
                  </select>
                  <small className="admin-hint">
                    Solo se usa si no hay media real. La animación en canvas se reemplaza
                    automáticamente cuando subes un archivo.
                  </small>
                </>
              ) : (
                <small className="admin-hint" style={{ marginTop: 8 }}>
                  Este caso ya tiene media real adjunta — el cine-loop sintético no se usa.
                </small>
              )}
            </div>

            <div className="admin-form-fields">
              <label className="admin-label">Título</label>
              <input
                className="admin-input"
                value={form.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="Ej: Derrame pleural masivo"
                required
              />

              <div className="admin-row">
                <div>
                  <label className="admin-label">Categoría</label>
                  <select
                    className="admin-input"
                    value={form.category}
                    onChange={(e) => update({ category: e.target.value })}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="admin-label">Modalidad / sonda</label>
                  <input
                    className="admin-input"
                    value={form.modality}
                    onChange={(e) => update({ modality: e.target.value })}
                    placeholder="Sonda lineal · 5 MHz"
                  />
                </div>
              </div>

              <div className="admin-row">
                <div>
                  <label className="admin-label">Autor</label>
                  <input
                    className="admin-input"
                    value={form.author}
                    onChange={(e) => update({ author: e.target.value })}
                  />
                </div>
                <div>
                  <label className="admin-label">Especialidad</label>
                  <input
                    className="admin-input"
                    value={form.role}
                    onChange={(e) => update({ role: e.target.value })}
                  />
                </div>
              </div>

              <label className="admin-label">Fecha</label>
              <input
                className="admin-input"
                type="date"
                value={form.date}
                onChange={(e) => update({ date: e.target.value })}
              />

              {/* Single description field. Replaced the trio of
                  Resumen / Hallazgos / Diagnóstico that used to live
                  here (Apr-2026 simplification + May-2026 backfill,
                  ADR-0010). Reads and writes the canonical
                  `description` field directly. */}
              <label className="admin-label">Descripción</label>
              <textarea
                className="admin-input"
                rows={6}
                value={description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="Describe el caso: contexto clínico, lo que se ve en la imagen, conclusión…"
                required
              />

              <label className="admin-label">Etiquetas</label>
              <div className="admin-tags-input">
                {form.tags.map((t) => (
                  <span key={t} className="tag-chip active">
                    {t}{" "}
                    <button type="button" onClick={() => removeTag(t)}>
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Agregar etiqueta + Enter"
                  className="admin-tag-input"
                />
              </div>

              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={!!form.featured}
                  onChange={(e) => update({ featured: e.target.checked })}
                />
                <span>Marcar como destacado</span>
              </label>
            </div>
          </div>

          <div className="admin-form-actions">
            <button type="button" className="btn-ghost" onClick={onCancel}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              {initial ? "Guardar cambios" : "Publicar caso"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
