import { describe, it, expect } from "vitest";
import {
  buildPrintIntentLine,
  getCatalogEntryForStyleKey,
  getStylePromptMetadata,
  mergeNegativeHints,
  normalizeStyleKey,
} from "./style-prompt-metadata";
import { STYLE_CATALOG } from "./style-catalog";

describe("normalizeStyleKey", () => {
  it("strips -freestyle suffix", () => {
    expect(normalizeStyleKey("popart-freestyle")).toBe("popart");
    expect(normalizeStyleKey("whimsical_japanese-freestyle")).toBe("whimsical_japanese");
  });
  it("maps lineart-minimal → lineart", () => {
    expect(normalizeStyleKey("lineart-minimal")).toBe("lineart");
  });
  it("maps the bare 'freestyle' key to japanese (Ukiyo-e)", () => {
    expect(normalizeStyleKey("freestyle")).toBe("japanese");
  });
  it("returns the key unchanged when no variant suffix is present", () => {
    expect(normalizeStyleKey("minimalism")).toBe("minimalism");
  });
});

describe("getStylePromptMetadata", () => {
  it("returns the catalog hints for a known styleKey", () => {
    const meta = getStylePromptMetadata("minimalism");
    expect(meta.negativeHints).toEqual([
      "ornate",
      "highly detailed",
      "busy background",
      "photorealistic texture",
    ]);
  });
  it("resolves -freestyle variants to the same metadata as the base key", () => {
    expect(getStylePromptMetadata("risograph-freestyle")).toEqual(
      getStylePromptMetadata("risograph"),
    );
  });
  it("returns {} for an unknown styleKey without throwing", () => {
    expect(getStylePromptMetadata("not_a_real_style")).toEqual({});
  });
  it("exposes printIntentModifier when defined on the catalog entry", () => {
    const meta = getStylePromptMetadata("risograph");
    expect(meta.printIntentModifier).toMatch(/large-format print/);
  });
});

describe("mergeNegativeHints", () => {
  it("appends hints not already present", () => {
    expect(mergeNegativeHints(["soft gradients"], ["photorealistic"])).toEqual([
      "soft gradients",
      "photorealistic",
    ]);
  });
  it("deduplicates case-insensitively while preserving original order", () => {
    expect(
      mergeNegativeHints(
        ["Photorealistic", "soft gradients"],
        ["photorealistic", "muddy colors"],
      ),
    ).toEqual(["Photorealistic", "soft gradients", "muddy colors"]);
  });
  it("trims whitespace and drops empty entries", () => {
    expect(mergeNegativeHints(["  bold "], [" ", "", "bold"])).toEqual(["bold"]);
  });
  it("handles missing args gracefully", () => {
    expect(mergeNegativeHints()).toEqual([]);
    expect(mergeNegativeHints(undefined, ["x"])).toEqual(["x"]);
  });
});

describe("buildPrintIntentLine", () => {
  it("returns the formatted line when printMode is true and modifier exists", () => {
    expect(buildPrintIntentLine("Use bold shapes.", true)).toBe(
      "PRINT INTENT: Use bold shapes.",
    );
  });
  it("returns '' when printMode is false even if modifier is set", () => {
    expect(buildPrintIntentLine("Use bold shapes.", false)).toBe("");
  });
  it("returns '' when modifier is missing or blank", () => {
    expect(buildPrintIntentLine(undefined, true)).toBe("");
    expect(buildPrintIntentLine("   ", true)).toBe("");
  });
});

describe("catalog wiring", () => {
  it("every catalog negativePromptHints entry contains no duplicates", () => {
    for (const entry of STYLE_CATALOG) {
      if (!entry.negativePromptHints) continue;
      const lowered = entry.negativePromptHints.map((s) => s.toLowerCase());
      const unique = new Set(lowered);
      expect(unique.size, `dupes in ${entry.route}`).toBe(lowered.length);
    }
  });

  it("Ukiyo-e (route '/') exposes the expected ban-list", () => {
    const entry = getCatalogEntryForStyleKey("japanese");
    expect(entry?.route).toBe("/");
    expect(entry?.negativePromptHints).toContain("photorealistic");
    expect(entry?.negativePromptHints).toContain("airbrushed");
  });

  it("Botanical defines both negative hints and a print intent modifier", () => {
    const meta = getStylePromptMetadata("botanical");
    expect(meta.negativeHints?.length).toBeGreaterThan(0);
    expect(meta.printIntentModifier).toBeTruthy();
  });

  it("Style IDs (routes) are unchanged — Phase 2 must not rename anything", () => {
    const routes = STYLE_CATALOG.map((s) => s.route).sort();
    expect(routes).toEqual(
      [
        "/",
        "/blend",
        "/botanical",
        "/brutalistposter",
        "/graffiti",
        "/lineart",
        "/mediterranean-heritage",
        "/minimalism",
        "/modernist-cocktail",
        "/popart",
        "/pulpmagazine",
        "/retrocomic",
        "/risograph",
        "/scandinavian-poster",
        "/screenprint",
        "/tattooflash",
        "/urbannoir",
        "/vintage",
        "/whimsical-japanese",
        "/xeroxzine",
      ].sort(),
    );
  });
});
