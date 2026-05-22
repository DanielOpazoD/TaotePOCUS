"use client";

// Headless dropdown primitive. Owns the open/close state machine
// shared by `LanguageSwitcher` and `UserMenu` (and any future
// header popover): outside-click, ESC, focus return, aria wiring,
// stable id for the controls relationship.
//
// Pre-extraction both consumers re-implemented ~80 lines of the
// same logic with minor drift between them. The drift surfaced as
// missing `touchstart` handling on one of them, and an inconsistent
// `aria-controls` shape (one wrote a constant, the other used
// useId). Consolidating eliminated the drift + cuts ~150 lines of
// duplicate boilerplate.
//
// Design: render-prop component, NOT a hook. The hook variant was
// considered but every consumer needs the same wrapper `<div>` +
// trigger button + popover ul shape — letting the primitive own
// the wrapper keeps the focus-return ref simple (it's owned where
// the trigger is rendered, not separately threaded).

import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";

interface RenderProps {
  /** True when the popover is open. Consumer renders the menu only
   *  while open (the primitive doesn't render conditionally — the
   *  consumer's JSX controls visibility so animations / mount
   *  timing stay caller-controlled). */
  open: boolean;
  /** Flip the open state. Wire to the trigger's onClick. */
  toggle: () => void;
  /** Force-close. Wire to menu items so a selection collapses the
   *  popover before the action runs. */
  close: () => void;
  /** Ref to attach to the trigger button. The primitive uses it
   *  to return focus on ESC close + when a touch tap-outside
   *  closes the popover. Typed as the wider `React.Ref<…>` so
   *  callers can `ref={triggerRef}` without TS yelling about the
   *  React 19 `RefObject<T | null>` shape vs. `LegacyRef<T>`. */
  triggerRef: Ref<HTMLButtonElement>;
  /** Spread onto the trigger button. Wires aria-haspopup +
   *  aria-expanded + aria-controls so screen readers know the
   *  button opens the popover. */
  triggerProps: {
    "aria-haspopup": "menu" | "listbox";
    "aria-expanded": boolean;
    "aria-controls": string | undefined;
  };
  /** Spread onto the popover root (the <ul>). Provides the id the
   *  trigger's aria-controls references + the mousedown-stop so a
   *  click on a menu item doesn't pre-empt the outside-click
   *  handler before the item's onClick runs. */
  popoverProps: {
    id: string;
    onMouseDown: (e: React.MouseEvent) => void;
  };
}

interface Props {
  /** Selects the aria-haspopup value + signals the semantic role
   *  the consumer's popover will use. "menu" for action lists
   *  (UserMenu — Settings / Salir), "listbox" for selection lists
   *  (LanguageSwitcher — ES / EN). */
  variant: "menu" | "listbox";
  /** Class applied to the wrapper `<div>`. The primitive needs a
   *  positioned wrapper (relative) so the absolute-positioned
   *  popover anchors to it; every consumer needs that anyway so
   *  the class is just the surface-specific extension. */
  className?: string;
  children: (props: RenderProps) => ReactNode;
}

export function DropdownMenu({ variant, className, children }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Stable id for the controls/labelledby relationship between
  // trigger and popover. useId guarantees uniqueness even if
  // multiple dropdowns mount in the same tree (unlikely, but
  // free correctness).
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        // Return focus to the trigger so keyboard nav stays sticky.
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={className} ref={wrapperRef}>
      {children({
        open,
        toggle: () => setOpen((o) => !o),
        close: () => setOpen(false),
        triggerRef,
        triggerProps: {
          "aria-haspopup": variant,
          "aria-expanded": open,
          "aria-controls": open ? id : undefined,
        },
        popoverProps: {
          id,
          // Stop propagation so a click on a menu item doesn't
          // re-trigger the outside-click handler before the
          // selection effect runs (the handler fires on
          // `mousedown`, an item's `onClick` fires on `click`
          // which is later — without stopPropagation the
          // outside-click sees the mousedown first and closes
          // the popover, which can race with the item callback
          // on some browsers).
          onMouseDown: (e) => e.stopPropagation(),
        },
      })}
    </div>
  );
}
