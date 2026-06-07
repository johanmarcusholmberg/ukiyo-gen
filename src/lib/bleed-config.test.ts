/**
 * Unit tests for the centralised bleed configuration helpers.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_BLEED_MM,
  DEFAULT_EXPORT_DPI,
  DEFAULT_SAFE_MM,
  computeBleedPixels,
  describeBleed,
  getDefaultBleedConfig,
  mmToPx,
  pxToMm,
} from "./bleed-config";

describe("bleed-config · defaults", () => {
  it("uses 3 mm bleed and 10 mm safe area at 300 DPI by default", () => {
    expect(DEFAULT_BLEED_MM).toBe(3);
    expect(DEFAULT_SAFE_MM).toBe(10);
    expect(DEFAULT_EXPORT_DPI).toBe(300);
    expect(getDefaultBleedConfig()).toEqual({ bleedMm: 3, safeMm: 10 });
  });
});

describe("bleed-config · mmToPx / pxToMm", () => {
  it("converts 3 mm at 300 DPI to 35 px", () => {
    // 3 / 25.4 * 300 = 35.43 → 35
    expect(mmToPx(3, 300)).toBe(35);
  });
  it("converts 3 mm at 150 DPI to 18 px", () => {
    // 3 / 25.4 * 150 = 17.72 → 18
    expect(mmToPx(3, 150)).toBe(18);
  });
  it("round-trips reasonably", () => {
    expect(Math.round(pxToMm(mmToPx(10, 300), 300))).toBe(10);
  });
  it("guards bad inputs", () => {
    expect(mmToPx(NaN, 300)).toBe(0);
    expect(mmToPx(3, 0)).toBe(0);
  });
});

describe("bleed-config · computeBleedPixels", () => {
  it("inflates a 50×70 cm trim canvas by 2 × bleed", () => {
    // 50 cm at 300 DPI = 5906 px ; 70 cm at 300 DPI = 8268 px
    const trimW = 5906;
    const trimH = 8268;
    const out = computeBleedPixels({ trimWidthPx: trimW, trimHeightPx: trimH, dpi: 300 });
    expect(out.bleedPx).toBe(35);
    expect(out.exportWidth).toBe(trimW + 70);
    expect(out.exportHeight).toBe(trimH + 70);
    expect(out.safePx).toBe(mmToPx(10, 300));
  });

  it("respects custom bleed and safe values", () => {
    const out = computeBleedPixels({
      trimWidthPx: 1000,
      trimHeightPx: 1000,
      dpi: 300,
      bleedMm: 5,
      safeMm: 8,
    });
    expect(out.bleedMm).toBe(5);
    expect(out.safeMm).toBe(8);
    expect(out.exportWidth).toBe(1000 + 2 * mmToPx(5, 300));
  });

  it("falls back to 300 DPI when not provided", () => {
    const out = computeBleedPixels({ trimWidthPx: 100, trimHeightPx: 100 });
    expect(out.dpi).toBe(300);
  });
});

describe("bleed-config · describeBleed", () => {
  it("formats trim → export → bleed millimetres", () => {
    expect(describeBleed(500, 700, 3)).toBe(
      "Trim 500×700 mm · Export 506×706 mm · 3 mm bleed",
    );
    expect(describeBleed(297, 420, 3)).toBe(
      "Trim 297×420 mm · Export 303×426 mm · 3 mm bleed",
    );
  });
});
