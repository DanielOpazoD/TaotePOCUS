import { describe, expect, it } from "vitest";
import { derivePageHead } from "@/lib/headers";
import type { View } from "@/lib/types";

describe("derivePageHead", () => {
  const atlas: View = { kind: "section", section: "atlas" };
  const ecg: View = { kind: "section", section: "ecg" };

  it("renders the atlas section head when no category is active", () => {
    const head = derivePageHead(atlas, null);
    expect(head.title).toBe("Atlas POCUS");
    expect(head.crumb).toBe("Atlas POCUS");
    expect(head.sub).toMatch(/Imágenes/);
  });

  it("uses the category label as title when a category is active", () => {
    const head = derivePageHead(atlas, "cardiac");
    expect(head.title).toBe("Cardíaco");
    expect(head.crumb).toBe("Atlas POCUS · Categoría");
    expect(head.sub).toBe("Atlas POCUS · Cardíaco");
  });

  it("renders the favs view independent of section/category", () => {
    const head = derivePageHead({ kind: "favs" }, "cardiac");
    expect(head.title).toBe("Tu colección");
    expect(head.crumb).toBe("Mi colección");
  });

  it("renders the admin view", () => {
    const head = derivePageHead({ kind: "admin" }, null);
    expect(head.title).toBe("Panel de administración");
    expect(head.crumb).toBe("Admin");
  });

  it("uses the ECG section copy", () => {
    const head = derivePageHead(ecg, null);
    expect(head.title).toBe("ECG");
    expect(head.sub).toMatch(/Electrocardiograma/);
  });
});
