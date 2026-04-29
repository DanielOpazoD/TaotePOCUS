import { describe, expect, it } from "vitest";

/**
 * Anti-regression for the bug fixed in commit 06182d1.
 *
 * Background: native <dialog> elements dispatch a `close` event when
 * `dialog.close()` is called. Wiring the React `onClose` prop on the
 * dialog (`<dialog onClose={onClose}>`) routes that event back to our
 * own onClose handler. The CaseModal cleanup useEffect calls
 * `dialog.close()` on unmount — which fires `close` — which calls our
 * onClose — which (in the parent) removes `caso=` from the URL —
 * which causes the modal to never reopen. On any transient remount
 * (React strict mode, an unrelated re-render that briefly drops
 * `openCase`) the modal closes itself within milliseconds of opening.
 *
 * Fix: don't wire the dialog's native `close` event. Every explicit
 * close path (Escape via keydown listener, onCancel, backdrop click,
 * close button, swipe gesture) calls the parent's onClose directly,
 * so the native event is redundant.
 *
 * This test scans the source files of every native <dialog> usage and
 * fails if any of them reintroduces the `onClose=` prop on the
 * <dialog> element. It's a structural test, not a behavioral one —
 * but the behavioral surface is exactly what the structural property
 * protects.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MODAL_FILES = [
  "components/modals/CaseModal.tsx",
  "components/modals/ConfirmDialog.tsx",
  "components/modals/AuthModal.tsx",
  "components/modals/ShortcutsModal.tsx",
];

describe("modal onClose-event-prop bug regression", () => {
  for (const file of MODAL_FILES) {
    it(`${file}: <dialog> does not bind the native close event`, () => {
      const source = readFileSync(resolve(process.cwd(), file), "utf-8");

      // Locate every <dialog ...> opening tag. Multi-line via [\s\S]
      // so we capture the full attribute list.
      const dialogTags = source.match(/<dialog[\s\S]*?>/g) ?? [];
      expect(dialogTags.length).toBeGreaterThan(0);

      for (const tag of dialogTags) {
        // The bug pattern: `onClose=` directly on the <dialog> tag.
        // The `onCancel=` prop IS allowed (and used) — we only block
        // onClose, which maps to the native close event.
        const hasNativeOnClose = /\bonClose\s*=/.test(tag);
        expect(
          hasNativeOnClose,
          `${file}: <dialog> tag should not bind the native close event ` +
            `(it re-fires during unmount cleanup and closes the modal in a loop). ` +
            `If you genuinely need to react to the native close event, hoist it ` +
            `to a separate effect that distinguishes "user closed" from "we are ` +
            `unmounting".\n\nOffending tag:\n${tag}`,
        ).toBe(false);
      }
    });
  }

  it("explanation comment is present in CaseModal so the rule is discoverable", () => {
    // If a future contributor wonders why the dialog has no onClose,
    // the answer needs to be in the file. We test for the presence
    // of an explanation comment so the rule isn't tribal knowledge.
    const source = readFileSync(resolve(process.cwd(), "components/modals/CaseModal.tsx"), "utf-8");
    expect(source).toMatch(/Intentionally no `onClose`|onClose.*event handler/i);
  });
});
