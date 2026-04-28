"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Options<T> {
  /**
   * Custom serializer. Default is `JSON.stringify`. Override for
   * primitive types where JSON adds noise (e.g. a boolean as "1"/"0").
   */
  serialize?: (value: T) => string;
  /**
   * Custom deserializer. Receives the raw localStorage string. Should
   * return the parsed value, or `undefined` if the value is malformed
   * — in that case the hook keeps the `initialValue`.
   */
  deserialize?: (raw: string) => T | undefined;
}

/**
 * `useState` with a localStorage-backed persistence layer. Eliminates
 * the duplicated try/catch + read/write boilerplate that was sprinkled
 * across `App` (sidebar collapse), `Sidebar` (tags collapse), `useFavs`,
 * `useUserCases`, and similar consumers.
 *
 * Behavior:
 *   1. First render: returns `initialValue`. We deliberately don't
 *      read localStorage during initialization — that would break SSR
 *      hydration, since the server can't see browser storage.
 *   2. After mount: a `useEffect` reads the persisted value (if any)
 *      and updates state. The component re-renders with the persisted
 *      value, smoothly hydrating without a flash for most cases.
 *   3. Every subsequent setState is mirrored to localStorage. Failures
 *      (private mode, full quota) are swallowed silently — the in-memory
 *      state still works.
 *
 * Usage:
 *   const [collapsed, setCollapsed] = usePersistedState(
 *     "sidebarCollapsed",
 *     false,
 *   );
 *
 * Custom (de)serialization for compact storage:
 *   const [open, setOpen] = usePersistedState("tagsOpen", true, {
 *     serialize: (v) => (v ? "1" : "0"),
 *     deserialize: (raw) => (raw === "1" ? true : raw === "0" ? false : undefined),
 *   });
 */
export function usePersistedState<T>(
  key: string,
  initialValue: T,
  options?: Options<T>,
): [T, (next: T | ((prev: T) => T)) => void] {
  // We freeze the (de)serializer pair in a ref so the persistence
  // useEffect doesn't fire on every render when the caller passes
  // inline functions as options.
  const optsRef = useRef(options);
  optsRef.current = options;

  const [value, setValue] = useState<T>(initialValue);
  // Tracks whether we've finished the read-from-storage step. Until
  // then, writes are skipped — otherwise mounting + a parent setState
  // before our effect runs would clobber the persisted value with the
  // initialValue.
  const hydratedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        const deserialize = optsRef.current?.deserialize;
        const parsed = deserialize ? deserialize(raw) : (safeJsonParse<T>(raw) as T | undefined);
        if (parsed !== undefined) setValue(parsed);
      }
    } catch {
      /* SSR / privacy mode — keep initialValue */
    }
    hydratedRef.current = true;
    // We intentionally only re-read when the key changes. New keys mid-
    // lifetime are rare but supported.
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (hydratedRef.current) {
          try {
            const serialize = optsRef.current?.serialize;
            const raw = serialize ? serialize(resolved) : JSON.stringify(resolved);
            window.localStorage.setItem(key, raw);
          } catch {
            /* quota exceeded / private mode — keep in-memory state */
          }
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}

/** JSON.parse that returns `undefined` instead of throwing. */
function safeJsonParse<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}
