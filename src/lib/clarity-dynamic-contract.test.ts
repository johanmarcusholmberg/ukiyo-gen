import { describe, expect, it } from "vitest";
import { validateClarityDynamicPayload } from "./clarity-dynamic-contract";

const valid = {
  imageUrl: "https://x/img.png",
  mode: "clarity_dynamic",
  upscaleFlow: "target_300",
  upscaleFamily: "clarity",
  requestedScale: 5.15,
  scale_factor: 5.15,
  sourceWasCorrectedMaster: true,
  posterFormatId: "print_50x70",
};

describe("validateClarityDynamicPayload — contract", () => {
  it("accepts the canonical valid payload", () => {
    expect(validateClarityDynamicPayload(valid)).toBeNull();
  });

  it("accepts the manual flow", () => {
    expect(
      validateClarityDynamicPayload({ ...valid, upscaleFlow: "manual" }),
    ).toBeNull();
  });

  it("rejects when mode is wrong", () => {
    expect(
      validateClarityDynamicPayload({ ...valid, mode: "tile_4x" }),
    ).toMatch(/clarity_dynamic/);
  });

  it("rejects when upscaleFamily is not 'clarity'", () => {
    expect(
      validateClarityDynamicPayload({ ...valid, upscaleFamily: "realesrgan" }),
    ).toMatch(/upscaleFamily/);
  });

  it("rejects when upscaleFlow is invalid", () => {
    expect(
      validateClarityDynamicPayload({ ...valid, upscaleFlow: "auto" }),
    ).toMatch(/upscaleFlow/);
  });

  it("rejects scale ≤ 1", () => {
    expect(
      validateClarityDynamicPayload({ ...valid, requestedScale: 1, scale_factor: 1 }),
    ).toMatch(/requestedScale/);
  });

  it("rejects scale > 8", () => {
    expect(
      validateClarityDynamicPayload({ ...valid, requestedScale: 8.5, scale_factor: 8.5 }),
    ).toMatch(/requestedScale/);
  });

  it("accepts decimal scale_factor fallback when requestedScale missing", () => {
    const b: any = { ...valid };
    delete b.requestedScale;
    expect(validateClarityDynamicPayload(b)).toBeNull();
  });

  it("rejects when sourceWasCorrectedMaster is not true", () => {
    expect(
      validateClarityDynamicPayload({ ...valid, sourceWasCorrectedMaster: false }),
    ).toMatch(/sourceWasCorrectedMaster/);
  });

  it("rejects when posterFormatId is missing", () => {
    const b: any = { ...valid };
    delete b.posterFormatId;
    expect(validateClarityDynamicPayload(b)).toMatch(/posterFormatId/);
  });

  it("rejects non-object body", () => {
    expect(validateClarityDynamicPayload(null)).not.toBeNull();
    expect(validateClarityDynamicPayload("oops")).not.toBeNull();
  });
});
