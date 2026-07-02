import { describe, it, expect } from "vitest";
import {
  planFormatDerivative,
  listCandidateTargets,
  validateDerivativeResult,
  resolveDerivativeTargetSize,
  SUPPORTED_DERIVATIVE_FORMATS,
} from "./format-derivative";

describe("planFormatDerivative", () => {
  it("50x70 portrait 1600x2240 → A3 portrait 1584x2240 via side crop (8px each)", () => {
    const plan = planFormatDerivative({
      sourceFormatId: "print_50x70",
      targetFormatId: "print_a3",
      sourceWidth: 1600,
      sourceHeight: 2240,
    });
    expect(plan).not.toBeNull();
    expect(plan!.outputWidth).toBe(1584);
    expect(plan!.outputHeight).toBe(2240);
    // Crop rectangle drops 8px per side, full height.
    expect(plan!.cropBox.x).toBe(8);
    expect(plan!.cropBox.y).toBe(0);
    expect(plan!.cropBox.width).toBe(1584);
    expect(plan!.cropBox.height).toBe(2240);
    expect(plan!.cropOnly).toBe(true);
    // Not same ratio — 50×70 is wider than A-series.
    expect(plan!.sameRatio).toBe(false);
    // Cross-ratio warning fires, but NOT the A→50x70 warning.
    expect(plan!.warnings).toContain("cross-ratio-crop");
    expect(plan!.warnings).not.toContain("a-series-to-50x70-vertical-crop");
  });

  it("uses crop mode, never padding", () => {
    const plan = planFormatDerivative({
      sourceFormatId: "print_50x70",
      targetFormatId: "print_a4",
      sourceWidth: 1600,
      sourceHeight: 2240,
    })!;
    // cropBox strictly inside source bounds — never adds pixels.
    expect(plan.cropBox.width).toBeLessThanOrEqual(1600);
    expect(plan.cropBox.height).toBeLessThanOrEqual(2240);
    expect(plan.cropOnly).toBe(true);
  });

  it("A-series → A-series derives without ratio drift (same-ratio, no crop)", () => {
    // A3 1584×2240 → A2 2240×3168 — pure resize, no crop.
    const plan = planFormatDerivative({
      sourceFormatId: "print_a3",
      targetFormatId: "print_a2",
      sourceWidth: 1584,
      sourceHeight: 2240,
    })!;
    expect(plan.sameRatio).toBe(true);
    expect(plan.cropBox).toEqual({ x: 0, y: 0, width: 1584, height: 2240 });
    expect(plan.outputWidth).toBe(2240);
    expect(plan.outputHeight).toBe(3168);
    // No cross-ratio warning because same ratio; but target is larger.
    expect(plan.warnings).not.toContain("cross-ratio-crop");
    expect(plan.warnings).toContain("target-larger-than-source");
  });

  it("A2 → A4 downsize keeps identical ratio and requires no crop", () => {
    const plan = planFormatDerivative({
      sourceFormatId: "print_a2",
      targetFormatId: "print_a4",
      sourceWidth: 2240,
      sourceHeight: 3168,
    })!;
    expect(plan.sameRatio).toBe(true);
    expect(plan.cropBox.width).toBe(2240);
    expect(plan.outputWidth).toBe(1120);
    expect(plan.outputHeight).toBe(1584);
    expect(plan.warnings).not.toContain("target-larger-than-source");
  });

  it("A-series → 50x70 emits vertical-crop warning and requires vertical trim", () => {
    // A3 portrait 1584×2240 → 50×70 1600×2240. A is narrower than 5:7 so
    // we crop top/bottom to reach the wider ratio.
    const plan = planFormatDerivative({
      sourceFormatId: "print_a3",
      targetFormatId: "print_50x70",
      sourceWidth: 1584,
      sourceHeight: 2240,
    })!;
    expect(plan.warnings).toContain("a-series-to-50x70-vertical-crop");
    // Crop is on the vertical axis (top/bottom trimmed).
    expect(plan.cropBox.width).toBe(1584);
    expect(plan.cropBox.height).toBeLessThan(2240);
    expect(plan.cropBox.y).toBeGreaterThan(0);
    expect(plan.cropOnly).toBe(true);
  });
});

describe("listCandidateTargets", () => {
  it("marks A-series as preferred targets when source is 50x70", () => {
    const cands = listCandidateTargets("print_50x70");
    const a3 = cands.find((c) => c.formatId === "print_a3")!;
    expect(a3.preferredSource).toBe(true);
    expect(a3.requiresConfirmation).toBe(false);
  });

  it("flags 50x70 target as requiring confirmation when source is A-series", () => {
    const cands = listCandidateTargets("print_a3");
    const t = cands.find((c) => c.formatId === "print_50x70")!;
    expect(t.requiresConfirmation).toBe(true);
    expect(t.preferredSource).toBe(false);
  });

  it("never lists source as its own target", () => {
    for (const src of SUPPORTED_DERIVATIVE_FORMATS) {
      const cands = listCandidateTargets(src);
      expect(cands.find((c) => c.formatId === src)).toBeUndefined();
    }
  });
});

describe("validateDerivativeResult", () => {
  it("accepts exact-size, correct-ratio, no-padding derivative", () => {
    const target = resolveDerivativeTargetSize("print_a3")!;
    const r = validateDerivativeResult({
      targetFormatId: "print_a3",
      producedWidth: target.width,
      producedHeight: target.height,
      usedPadding: false,
    });
    expect(r.ok).toBe(true);
    expect(r.exactPixelMatch).toBe(true);
    expect(r.ratioMatch).toBe(true);
    expect(r.noPadding).toBe(true);
    expect(r.achievablePpi).toBeGreaterThan(0);
  });

  it("rejects padded derivatives (crop-only invariant)", () => {
    const target = resolveDerivativeTargetSize("print_a3")!;
    const r = validateDerivativeResult({
      targetFormatId: "print_a3",
      producedWidth: target.width,
      producedHeight: target.height,
      usedPadding: true,
    });
    expect(r.ok).toBe(false);
    expect(r.noPadding).toBe(false);
    expect(r.errors.join(" ")).toMatch(/padding/i);
  });

  it("rejects off-ratio or off-size derivatives", () => {
    const r = validateDerivativeResult({
      targetFormatId: "print_a3",
      producedWidth: 1600,
      producedHeight: 2240, // 50×70 dims, wrong for A3
      usedPadding: false,
    });
    expect(r.ok).toBe(false);
    expect(r.exactPixelMatch).toBe(false);
  });
});

describe("derivative metadata linkage", () => {
  it("plan captures source/target format identity for downstream persistence", () => {
    const plan = planFormatDerivative({
      sourceFormatId: "print_50x70",
      targetFormatId: "print_a3",
      sourceWidth: 1600,
      sourceHeight: 2240,
    })!;
    // These fields are what callers persist as
    //   { sourceImageId, sourceFormat, targetFormat, cropBox, derivedFromMaster: true }
    expect(plan.sourceFormat).toBe("print_50x70");
    expect(plan.targetFormat).toBe("print_a3");
    expect(plan.cropBox).toEqual({ x: 8, y: 0, width: 1584, height: 2240 });
  });
});
