"use client";

// Cmd+K command palette. One keyboard shortcut, one overlay, every
// action a power user reaches for. Mixes:
//
//   - **Cases**: every case in the catalog, fuzzy-matched on its
//     title (current language). Activating an entry opens the
//     modal — same URL patch the grid uses, so view-transitions
//     and the recently-viewed trail keep working.
//   - **Navigation**: section landings, /favoritos, /admin (when
//     visible). Activates via router push.
//   - **Actions**: theme toggle, new case (admin), backup export
//     (admin), etc. Each is a plain function the App passes in.
//
// The palette is a sibling of the rest of the modal layer (lives
// in `<AppModals>`) so its z-index, dialog-host, and focus-trap
// machinery slot into the same pattern. Filtering is a simple
// case-insensitive substring match — fuzzy ranking adds complexity
// without obvious value at this catalog size (~300 cases + ~10
// actions). 50 visible results max so the list stays scannable.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CaseRecord } from "@/lib/types";
import { getCaseTitle } from "@/lib/case-localized";
import { useLanguage } from "@/hooks/useLanguage";
import { useNativeDialog } from "@/hooks/useNativeDialog";
import { Icon } from "@/lib/icons";

/**
 * The shape of every entry the palette renders. Discriminated union
 * so the renderer can pick the icon + secondary label without a
 * separate `type` field that has to stay in sync.
 */
export type Command =
  | { kind: "open-case"; caso: CaseRecord; categoryLabel?: string }
  | { kind: "edit-case"; caso: CaseRecord; categoryLabel?: string }
  | { kind: "navigate"; label: string; secondary?: string; run: () => void }
  | { kind: "action"; label: string; secondary?: string; run: () => void };

interface Props {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  /** Triggered when the user activates an entry — either via Enter
   *  on the keyboard or click on the row. The palette closes
   *  itself after dispatch; the caller's responsibility is just to
   *  run the command's side effect. */
  onRun: (command: Command) => void;
}

const MAX_VISIBLE = 50;

/**
 * Match `cmd` against the lowercase `q`. Cases match against their
 * title (in the active language); navigate / action commands match
 * against their `label` + `secondary`. Returns `true` when ANY
 * substring matches — same simple policy `searchHaystack` uses on
 * the catalog filter, kept consistent so the palette and the
 * toolbar search feel related.
 */
function matchesCommand(cmd: Command, q: string, lang: "es" | "en"): boolean {
  if (cmd.kind === "open-case" || cmd.kind === "edit-case") {
    const title = getCaseTitle(cmd.caso, lang).value.toLowerCase();
    return title.includes(q) || (cmd.categoryLabel ?? "").toLowerCase().includes(q);
  }
  const haystack = `${cmd.label} ${cmd.secondary ?? ""}`.toLowerCase();
  return haystack.includes(q);
}

export default function CommandPalette({ open, onClose, commands, onRun }: Props) {
  const { lang, t } = useLanguage();
  const dialogRef = useNativeDialog<HTMLDialogElement>();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset query + selection every time the palette re-opens — a
  // stale query from a prior open is more confusing than helpful.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Defer focus a frame so the dialog's mount + showModal()
      // settle before we steal focus to the input. Without this,
      // the focus call sometimes loses to the dialog's default
      // first-focusable-child behaviour.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, MAX_VISIBLE);
    return commands.filter((c) => matchesCommand(c, q, lang)).slice(0, MAX_VISIBLE);
  }, [commands, query, lang]);

  // Clamp the selected index when filtering shrinks the list — a
  // user who navigated to row 8 then typed a query that only has 3
  // hits should land on the last hit, not on an empty pointer.
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  const activate = useCallback(
    (cmd: Command) => {
      onRun(cmd);
      onClose();
    },
    [onRun, onClose],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = filtered[selectedIndex];
        if (selected) activate(selected);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIndex, activate, onClose],
  );

  // Keep the selected row scrolled into view when the keyboard
  // moves the highlight past the visible window. `scrollIntoView`
  // with `block: "nearest"` is the minimum nudge — no jump on rows
  // already visible, smooth scroll on rows just below the fold.
  useEffect(() => {
    const node = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <dialog
      ref={dialogRef}
      className="cmdk"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Backdrop click (target === dialog itself) closes; clicks on
        // inner chrome bubble normally.
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      aria-labelledby="cmdk-title"
    >
      <div className="cmdk-shell">
        <header className="cmdk-head">
          <span className="cmdk-glyph" aria-hidden="true">
            {Icon.search()}
          </span>
          <input
            ref={inputRef}
            type="text"
            className="cmdk-input"
            placeholder={t("palette.placeholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            aria-label={t("palette.aria")}
            id="cmdk-title"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cmdk-esc" aria-hidden="true">
            esc
          </kbd>
        </header>
        {filtered.length === 0 ? (
          <p className="cmdk-empty" role="status">
            {t("palette.empty")}
          </p>
        ) : (
          <ul ref={listRef} className="cmdk-list" role="listbox">
            {filtered.map((cmd, i) => {
              const selected = i === selectedIndex;
              return (
                <li
                  key={commandKey(cmd, i)}
                  role="option"
                  aria-selected={selected}
                  className={`cmdk-row${selected ? " is-selected" : ""}`}
                  onMouseMove={() => setSelectedIndex(i)}
                  onClick={() => activate(cmd)}
                >
                  <CommandRow cmd={cmd} lang={lang} t={t} />
                </li>
              );
            })}
          </ul>
        )}
        <footer className="cmdk-foot" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t("palette.foot.navigate")}
          </span>
          <span>
            <kbd>↵</kbd> {t("palette.foot.select")}
          </span>
          <span>
            <kbd>esc</kbd> {t("palette.foot.close")}
          </span>
        </footer>
      </div>
    </dialog>
  );
}

function commandKey(cmd: Command, index: number): string {
  if (cmd.kind === "open-case" || cmd.kind === "edit-case") {
    return `${cmd.kind}:${cmd.caso.id}`;
  }
  return `${cmd.kind}:${cmd.label}:${index}`;
}

function CommandRow({
  cmd,
  lang,
  t,
}: {
  cmd: Command;
  lang: "es" | "en";
  t: ReturnType<typeof useLanguage>["t"];
}) {
  if (cmd.kind === "open-case" || cmd.kind === "edit-case") {
    const titleRead = getCaseTitle(cmd.caso, lang);
    const verb = cmd.kind === "edit-case" ? t("palette.row.editVerb") : t("palette.row.openVerb");
    return (
      <>
        <span className="cmdk-row-glyph" aria-hidden="true">
          {cmd.kind === "edit-case" ? Icon.edit() : Icon.search()}
        </span>
        <span className="cmdk-row-body">
          <span className="cmdk-row-primary">
            <span className="cmdk-row-verb">{verb}:</span> {titleRead.value}
          </span>
          {cmd.categoryLabel && <span className="cmdk-row-secondary">{cmd.categoryLabel}</span>}
        </span>
      </>
    );
  }
  // Navigate / action — typographic glyphs avoid forcing new entries
  // in `Icon.*` for two more single-use marks. The visual hierarchy
  // (caso → bigger glyph, action → typographic) reads cleanly.
  return (
    <>
      <span className="cmdk-row-glyph cmdk-row-glyph--typographic" aria-hidden="true">
        {cmd.kind === "navigate" ? "→" : "⌘"}
      </span>
      <span className="cmdk-row-body">
        <span className="cmdk-row-primary">{cmd.label}</span>
        {cmd.secondary && <span className="cmdk-row-secondary">{cmd.secondary}</span>}
      </span>
    </>
  );
}
