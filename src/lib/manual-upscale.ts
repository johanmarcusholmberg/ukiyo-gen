/**
 * Manual upscale planner.
 *
 * Pure helper used by the Advanced section of `EnhanceForPrintDialog`.
 * Given a corrected poster master and a user-chosen `{family, requestedScale}`,
 * predict the output dimensions, effective PPI for the selected print
 * format, and the warnings/blocks the UI should surface BEFORE we call
 * the provider.
 *
 * No I/O. Mirrors the safety rules of `calculatePrintTargetUpscale`:
 *   - Predicted long-side > maxLongSide → block (`exceededLimit=true`).
 *   - Below the 300 PPI target → warn but allow run.
 *   - Clarity → append a "may reinterpret details" note.
 *   - Real-ESRGAN scales are clamped to [2, 8] for provider compatibility.
 */

import { getPrintFormat } from "@/lib/print-formats";
import { TILE_8X_MAX_LONG_SIDE } from "@/lib/upscale-modes";
import {
  REALESRGAN_DYNAMIC_MIN_SCALE,
  REALESRGAN_DYNAMIC_MAX_SCALE,
  type PrintTargetUpscaleFamily,
} from "@/lib/print-target-upscale";

export type ManualUpscaleFamily = PrintTargetUpscaleFamily;

/** Scale presets exposed in the Advanced section. */
export const MANUAL_UPSCALE_PRESETS = [2, 3, 4, 5, 6, 8] as const;

export const CLARITY_REINTERPRET_NOTE =
  "Clarity can add rich detail but may slightly reinterpret fine elements. Use Real-ESRGAN for maximum fidelity.";

export interface PlanManualUpscaleInput {
  family: ManualUpscaleFamily;
  requestedScale: number;
  sourceWidth: number;
  sourceHeight: number;
  /** Optional — when set, predicted PPI is computed against this format. */
  posterFormatId?: string | null;
  targetDpi?: number;
  maxLongSide?: number;
}

export type ManualUpscaleStatus =
  | "ready"
  | "below_300_ppi"
  | "output_too_large"
  | "invalid_scale";

export interface ManualUpscalePlan {
  family: ManualUpscaleFamily;
  requestedScale: number;
  /** Scale clamped into the family's provider-supported range. */
  effectiveScale: number;
  scaleWasClamped: boolean;
  sourceWidth: number;
  sourceHeight: number;
  predictedWidth: number;
  predictedHeight: number;
  predictedLongSide: number;
  posterFormatId: string | null;
  targetWidth: number | null;
  targetHeight: number | null;
  targetDpi: number;
  predictedEffectivePpi: number | null;
  clears300Ppi: boolean;
  exceededLimit: boolean;
  maxLongSide: number;
  warnings: string[];
  status: ManualUpscaleStatus;
}

const CM_TO_INCHES = 1 / 2.54;

export function planManualUpscale(input: PlanManualUpscaleInput): ManualUpscalePlan {
  const maxLongSide = input.maxLongSide ?? TILE_8X_MAX_LONG_SIDE;
  const targetDpi = input.targetDpi ?? 300;
  const fmt = input.posterFormatId ? getPrintFormat(input.posterFormatId) ?? null : null;

  const warnings: string[] = [];
  let status: ManualUpscaleStatus = "ready";

  // Validate scale.
  if (
    !Number.isFinite(input.requestedScale) ||
    input.requestedScale <= 1 ||
    !Number.isFinite(input.sourceWidth) ||
    !Number.isFinite(input.sourceHeight) ||
    input.sourceWidth <= 0 ||
    input.sourceHeight <= 0
  ) {
    return {
      family: input.family,
      requestedScale: input.requestedScale,
      effectiveScale: 1,
      scaleWasClamped: false,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      predictedWidth: input.sourceWidth,
      predictedHeight: input.sourceHeight,
      predictedLongSide: Math.max(input.sourceWidth, input.sourceHeight),
      posterFormatId: input.posterFormatId ?? null,
      targetWidth: null,
      targetHeight: null,
      targetDpi,
      predictedEffectivePpi: null,
      clears300Ppi: false,
      exceededLimit: false,
      maxLongSide,
      warnings: ["Scale must be greater than 1."],
      status: "invalid_scale",
    };
  }

  // Family-specific clamp.
  let effectiveScale = input.requestedScale;
  let scaleWasClamped = false;
  if (input.family === "realesrgan") {
    if (effectiveScale < REALESRGAN_DYNAMIC_MIN_SCALE) {
      effectiveScale = REALESRGAN_DYNAMIC_MIN_SCALE;
      scaleWasClamped = true;
    } else if (effectiveScale > REALESRGAN_DYNAMIC_MAX_SCALE) {
      effectiveScale = REALESRGAN_DYNAMIC_MAX_SCALE;
      scaleWasClamped = true;
    }
  } else if (input.family === "clarity") {
    // Clarity practical ceiling matches the Real-ESRGAN 8× cap for a
    // single-pass run; no lower clamp.
    if (effectiveScale > 8) {
      effectiveScale = 8;
      scaleWasClamped = true;
    }
  }

  const predW = Math.round(input.sourceWidth * effectiveScale);
  const predH = Math.round(input.sourceHeight * effectiveScale);
  const predLong = Math.max(predW, predH);

  let targetW: number | null = null;
  let targetH: number | null = null;
  let ppi: number | null = null;
  if (fmt) {
    targetW = fmt.preferredPixelWidth;
    targetH = fmt.preferredPixelHeight;
    ppi = Math.round(
      Math.min(
        predW / (fmt.widthCm * CM_TO_INCHES),
        predH / (fmt.heightCm * CM_TO_INCHES),
      ),
    );
  }

  const clears300 =
    !!fmt &&
    !!targetW &&
    !!targetH &&
    predW >= targetW &&
    predH >= targetH &&
    (ppi ?? 0) >= targetDpi;
  const exceeded = predLong > maxLongSide;

  if (exceeded) {
    status = "output_too_large";
    warnings.push(
      `Predicted output ${predW}×${predH} px exceeds the ${maxLongSide} px safety limit and cannot be run.`,
    );
  } else if (fmt && !clears300) {
    status = "below_300_ppi";
    warnings.push(
      `This scale will not reach ${targetDpi} PPI for ${fmt.label}. It can still be used, but it will not be marked print-ready.`,
    );
  }

  if (input.family === "clarity") {
    warnings.push(CLARITY_REINTERPRET_NOTE);
  }

  if (scaleWasClamped) {
    warnings.push(
      `Requested scale was clamped to ${effectiveScale}× for the ${input.family} provider.`,
    );
  }

  return {
    family: input.family,
    requestedScale: input.requestedScale,
    effectiveScale,
    scaleWasClamped,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    predictedWidth: predW,
    predictedHeight: predH,
    predictedLongSide: predLong,
    posterFormatId: input.posterFormatId ?? null,
    targetWidth: targetW,
    targetHeight: targetH,
    targetDpi,
    predictedEffectivePpi: ppi,
    clears300Ppi: clears300,
    exceededLimit: exceeded,
    maxLongSide,
    warnings,
    status,
  };
}
