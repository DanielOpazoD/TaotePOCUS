// Pin the storage key inventory. The keys are persisted on real
// users' browsers — renaming one silently drops their state on
// upgrade. This test makes any rename loud (the previous spelling
// has to be intentionally changed in two places: the key and this
// snapshot) and prevents typos in additions.

import { describe, it, expect } from "vitest";
import {
  STORAGE_KEYS,
  STORAGE_PREFIX,
  FAVS_KEY_PREFIX,
  FILTERS_KEY_PREFIX,
  favsKey,
  filtersKey,
} from "@/lib/storage-keys";

describe("storage-keys", () => {
  it("pins fixed-name keys to their canonical spellings", () => {
    expect(STORAGE_KEYS).toMatchInlineSnapshot(`
      {
        "caseOverrides": "pocus_case_overrides",
        "customCategories": "customCategories",
        "focusDefaults": "pocus_focus_defaults",
        "hiddenCategoryIds": "hiddenCategoryIds",
        "hiddenSectionIds": "hiddenSectionIds",
        "lang": "pocus_lang",
        "lastBackupAt": "pocus_last_backup_at",
        "preferences": "pocus_preferences",
        "recentlyViewed": "pocus_recently_viewed",
        "savedViews": "pocus_saved_views",
        "schemaVersion": "pocus_schema_version",
        "sectionLabelOverrides": "sectionLabelOverrides",
        "sidebarCollapsed": "sidebarCollapsed",
        "sidebarTagsOpen": "sidebarTagsOpen",
        "theme": "pocus_theme",
        "unseenOnly": "pocus_unseen_only",
        "user": "pocus_user",
        "userCases": "pocus_user_cases",
      }
    `);
  });

  it("uses the shared prefix for namespaced keys", () => {
    expect(STORAGE_PREFIX).toBe("pocus_");
    expect(FAVS_KEY_PREFIX).toBe("pocus_favs_");
    expect(FILTERS_KEY_PREFIX).toBe("pocus_filters:");
  });

  describe("favsKey", () => {
    it("templates the email into the slot", () => {
      expect(favsKey("admin@example.com")).toBe("pocus_favs_admin@example.com");
    });

    it("falls back to the guest bucket for missing email", () => {
      expect(favsKey()).toBe("pocus_favs_guest");
      expect(favsKey(null)).toBe("pocus_favs_guest");
      expect(favsKey(undefined)).toBe("pocus_favs_guest");
      expect(favsKey("")).toBe("pocus_favs_guest");
    });

    it("rebuilds keys that match FAVS_KEY_PREFIX", () => {
      const k = favsKey("alice@x.com");
      expect(k.startsWith(FAVS_KEY_PREFIX)).toBe(true);
      expect(k.slice(FAVS_KEY_PREFIX.length)).toBe("alice@x.com");
    });
  });

  describe("filtersKey", () => {
    it("templates the section id into the slot", () => {
      expect(filtersKey("atlas")).toBe("pocus_filters:atlas");
      expect(filtersKey("ecg")).toBe("pocus_filters:ecg");
    });

    it("rebuilds keys that match FILTERS_KEY_PREFIX", () => {
      const k = filtersKey("rayos");
      expect(k.startsWith(FILTERS_KEY_PREFIX)).toBe(true);
      expect(k.slice(FILTERS_KEY_PREFIX.length)).toBe("rayos");
    });
  });
});
