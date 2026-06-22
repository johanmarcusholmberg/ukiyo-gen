import { describe, it, expect } from "vitest";
import {
  STYLE_CATALOG,
  FAMILY_LABELS,
  FAMILY_ORDER,
  getStyleByRoute,
  getStyleBadge,
} from "./style-catalog";

describe("style-catalog taxonomy (phase 1)", () => {
  it("every style has a stable unique route", () => {
    const routes = STYLE_CATALOG.map((s) => s.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("every visible style declares a family", () => {
    for (const s of STYLE_CATALOG) {
      if (s.visibility === "hidden") continue;
      expect(s.family, `style ${s.name} missing family`).toBeTruthy();
    }
  });

  it("every declared family has a label and is in FAMILY_ORDER", () => {
    for (const s of STYLE_CATALOG) {
      if (!s.family) continue;
      expect(FAMILY_LABELS[s.family]).toBeTruthy();
      expect(FAMILY_ORDER).toContain(s.family);
    }
  });

  it("every variant points at a valid parent style route", () => {
    const routes = new Set(STYLE_CATALOG.map((s) => s.route));
    for (const s of STYLE_CATALOG) {
      if (s.visibility !== "variant") continue;
      expect(s.variantOf, `variant ${s.name} missing variantOf`).toBeTruthy();
      expect(routes.has(s.variantOf!)).toBe(true);
    }
  });

  it("preserves the existing core style routes (no IDs renamed)", () => {
    const expected = [
      "/",
      "/risograph",
      "/screenprint",
      "/xeroxzine",
      "/lineart",
      "/botanical",
      "/tattooflash",
      "/retrocomic",
      "/whimsical-japanese",
      "/modernist-cocktail",
      "/mediterranean-heritage",
      "/scandinavian-poster",
      "/brutalistposter",
      "/urbannoir",
      "/minimalism",
      "/blend",
      "/graffiti",
      "/pulpmagazine",
      "/popart",
      "/vintage",
    ];
    const routes = new Set(STYLE_CATALOG.map((s) => s.route));
    for (const r of expected) {
      expect(routes.has(r), `missing route ${r}`).toBe(true);
    }
  });

  it("getStyleByRoute resolves known routes", () => {
    expect(getStyleByRoute("/risograph")?.name).toBe("Risograph");
    expect(getStyleByRoute("/does-not-exist")).toBeUndefined();
  });

  it("getStyleBadge labels variants and grain-heavy styles", () => {
    const xerox = getStyleByRoute("/xeroxzine")!;
    expect(getStyleBadge(xerox)).toBe("Variant");
    const noir = getStyleByRoute("/urbannoir")!;
    expect(getStyleBadge(noir)).toBe("Grain-heavy");
  });
});
