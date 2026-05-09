"use client";

// Tags cell for `BulkEditTable`. Display mode renders the chips
// inline; click flips to a single text input where the admin
// edits a comma-separated list. Cleaner than per-chip x buttons
// for the bulk-edit ergonomics: a single keystroke (`,`) splits
// the next tag, blur commits the whole list.
//
// The display button doubles as the click target — the empty
// state ("— sin etiquetas —") is also clickable, otherwise rows
// without tags would have no edit affordance at all.
//
// Suggestions list (`<datalist>`) is rendered ONCE at the table
// root via `BulkEditTagSuggestions`; the input here just points
// at it via `list="bulk-edit-tag-suggestions"`.

import { useEffect, useRef, useState } from "react";
import { COMMON_TAGS } from "@/lib/data";
import { useT } from "@/hooks/useLanguage";

interface Props {
  tags: readonly string[];
  onSave: (next: string[]) => Promise<void> | void;
}

export function BulkEditTagsCell({ tags, onSave }: Props) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tags.join(", "));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(tags.join(", "));
  }, [tags, editing]);

  const commit = async () => {
    const next = parseTagsInput(draft);
    const same = next.length === tags.length && next.every((t, i) => t === tags[i]);
    if (same) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const cancel = () => {
    setDraft(tags.join(", "));
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="bulk-edit-tags-display"
        aria-label={t("bulk.tags.editAria")}
        onClick={() => {
          setEditing(true);
          // Focus after the input renders.
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        {tags.length === 0 ? (
          <span className="bulk-edit-cell-empty">{t("bulk.tags.empty")}</span>
        ) : (
          tags.map((tag) => (
            <span key={tag} className="bulk-edit-tag-chip">
              {tag}
            </span>
          ))
        )}
      </button>
    );
  }
  return (
    <input
      ref={inputRef}
      type="text"
      className="bulk-edit-cell-input"
      value={draft}
      list="bulk-edit-tag-suggestions"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        }
      }}
      aria-label={t("bulk.tags.input.aria")}
      placeholder={t("bulk.tags.input.placeholder")}
      disabled={saving}
    />
  );
}

/** Parse a comma-separated tag string into a unique, trimmed array. */
function parseTagsInput(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const piece of raw.split(",")) {
    const t = piece.trim();
    if (!t) continue;
    if (seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    result.push(t);
  }
  return result;
}

// Static datalist for tag suggestions — rendered once at the bottom
// of the table so all rows share it. Includes the curated catalog
// vocabulary; in-use tags from existing cases would require lifting
// state, which we skip for now (auto-complete still works for most
// edits because COMMON_TAGS covers the common cases).
export function BulkEditTagSuggestions() {
  return (
    <datalist id="bulk-edit-tag-suggestions">
      {COMMON_TAGS.map((t) => (
        <option key={t} value={t} />
      ))}
    </datalist>
  );
}
