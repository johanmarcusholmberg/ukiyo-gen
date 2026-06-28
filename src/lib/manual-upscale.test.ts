import { describe, expect, it } from "vitest";
import {
  MANUAL_UPSCALE_PRESETS,
  CLARITY_REINTERPRET_NOTE,
  planManualUpscale,
} from "./manual-upscale";

describe("planManualUpscale — basics", () => {
  it("exposes the canonical preset list 2..8", () => {
    expect([...MANUAL_UPSCALE_PRESETS]).toEqual([2, 3, 4, 5, 6, 8]);
  });

  it("predicts output for Real-ESRGAN at preset scale", () => {
    const p = planManualUpscale({
      family: "realesrgan",
      requestedScale: 4,
      sourceWidth: 1147,
      sourceHeight: 1606,
      posterFormatId: "print_50x70",
    });
    expect(p.predictedWidth).toBe(4588);
    expect(p.predictedHeight).toBe(6424);
    expect(p.predictedEffectivePpi).toBeGreaterThan(0);
    expect(p.status).toBe("below_300_ppi"); // 4× of 1147×1606 ≠ 300 PPI for 50×70
    expect(p.clears300Ppi).toBe(false);
  });

  it("accepts custom decimal scale", () => {
    const p = planManualUpscale({
      family: "realesrgan",
      requestedScale: 5.15,
      sourceWidth: 1147,
      sourceHeight: 1606,
      posterFormatId: "print_50x70",
    });
    expect(p.effectiveScale).toBe(5.15);
    expect(p.clears300Ppi).toBe(true);
    expect(p.status).toBe("ready");
  });

  it("blocks output exceeding maxLongSide", () => {
    const p = planManualUpscale({
      family: "clarity",
      requestedScale: 8,
      sourceWidth: 4000,
      sourceHeight: 4000,
      posterFormatId: "print_50x70",
    });
    expect(p.exceededLimit).toBe(true);
    expect(p.status).toBe("output_too_large");
    expect(p.warnings.join(" ")).toMatch(/safety limit/i);
  });

  it("warns Clarity may reinterpret details", () => {
    const p = planManualUpscale({
      family: "clarity",
      requestedScale: 4,
      sourceWidth: 1147,
      sourceHeight: 1606,
      posterFormatId: "print_50x70",
    });
    expect(p.warnings).toContain(CLARITY_REINTERPRET_NOTE);
  });

  it("clamps Real-ESRGAN above 8× to 8", () => {
    const p = planManualUpscale({
      family: "realesrgan",
      requestedScale: 10,
      sourceWidth: 1000,
      sourceHeight: 1400,
    });
    expect(p.effectiveScale).toBe(8);
    expect(p.scaleWasClamped).toBe(true);
  });

  it("clamps Real-ESRGAN below 2× to 2", () => {
    const p = planManualUpscale({
      family: "realesrgan",
      requestedScale: 1.5,
      sourceWidth: 1000,
      sourceHeight: 1400,
    });
    expect(p.effectiveScale).toBe(2);
    expect(p.scaleWasClamped).toBe(true);
  });

  it("rejects invalid scale ≤ 1", () => {
    const p = planManualUpscale({
      family: "realesrgan",
      requestedScale: 1,
      sourceWidth: 1000,
      sourceHeight: 1400,
    });
    expect(p.status).toBe("invalid_scale");
  });

  it("works without a poster format (no PPI evaluation)", () => {
    const p = planManualUpscale({
      family: "realesrgan",
      requestedScale: 4,
      sourceWidth: 1000,
      sourceHeight: 1000,
    });
    expect(p.predictedEffectivePpi).toBeNull();
    expect(p.clears300Ppi).toBe(false);
    expect(p.exceededLimit).toBe(false);
    expect(p.status).toBe("ready");
  });
});
