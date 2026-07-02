/**
 * Format-derivative workflow.
 *
 * Create exact-format derivative versions of an approved poster master
 * for OTHER supported poster formats — WITHOUT re-generating with any
 * AI provider. Pure canvas crop + resize, then upload as a new asset
 * linked to the source master.
 *
 * Ratio rules:
 *   - A-series ↔ A-series: same ISO ratio (1:√2). Pure resize, no crop.
 *   - 50×70 (5:7) → A-series: 50×70 is slightly WIDER than A. Safely
 *     side-crop a few px each side (e.g. 1600×2240 → A3 1584×2240 =
 *     8 px per side). Preferred source for A-series derivatives.
 *   - A-series → 50×70: A is NARROWER than 50×70. Can only reach 5:7 by
 *     vertically cropping (or extending, which we disallow). Emits a
 *     warning; caller must explicitly confirm.
 *
 * NEVER pads / adds white borders — this workflow is crop-only.
 */

import { gptImage2SizeForFormat, type Orientation } from "@/lib/openai-gpt-image-2-sizes";
import {
  getPrintFormat,
  getRecommendedGenerationSize,
  isAspectRatioMatch,
  assessExportReadiness,
} from "@/lib/print-formats";

export interface DerivativeCropBox {
  /** Left offset in source pixels. */
  x: number;
  /** Top offset in source pixels. */
  y: number;
  /** Cropped width in source pixels. */
  width: number;
  /** Cropped height in source pixels. */
  height: number;
}

export interface DerivativeTargetSize {
  width: number;
  height: number;
  /** True when width×height is the canonical exact size for the format. */
  exact: boolean;
}

export type DerivativeWarning =
  | "a-series-to-50x70-vertical-crop"
  | "cross-ratio-crop"
  | "target-larger-than-source";

export interface FormatDerivativePlan {
  sourceFormat: string;
  targetFormat: string;
  sourceWidth: number;
  sourceHeight: number;
  /** Final derivative pixel size (target's canonical size when known). */
  outputWidth: number;
  outputHeight: number;
  /** Crop rectangle applied to the source before resizing. */
  cropBox: DerivativeCropBox;
  /** True when target and source share the exact ratio (within tolerance). */
  sameRatio: boolean;
  /** Present when the derivation needs the caller to acknowledge tradeoffs. */
  warnings: DerivativeWarning[];
  /** True when only crop is used (never padding). Always true — kept explicit. */
  cropOnly: true;
  targetRatio: number;
  sourceRatio: number;
  orientation: Orientation;
}

/** Resolve a target pixel size for a format. Prefer exact gpt-image-2 sizes. */
export function resolveDerivativeTargetSize(
  targetFormatId: string,
  orientation: Orientation = "portrait",
): DerivativeTargetSize | null {
  const exact = gptImage2SizeForFormat(targetFormatId, orientation);
  if (exact) return { width: exact.width, height: exact.height, exact: true };
  const rec = getRecommendedGenerationSize(targetFormatId);
  if (rec.width > 0 && rec.height > 0) {
    return { width: rec.width, height: rec.height, exact: false };
  }
  return null;
}

/** Format ids that this workflow supports as sources or targets. */
export const SUPPORTED_DERIVATIVE_FORMATS = [
  "print_50x70",
  "print_a2",
  "print_a3",
  "print_a4",
] as const;
export type SupportedDerivativeFormat = (typeof SUPPORTED_DERIVATIVE_FORMATS)[number];

export function isSupportedDerivativeFormat(id: string): id is SupportedDerivativeFormat {
  return (SUPPORTED_DERIVATIVE_FORMATS as readonly string[]).includes(id);
}

/**
 * Compute the crop plan to derive `targetFormatId` from a source image of
 * `sourceWidth × sourceHeight` originally rendered for `sourceFormatId`.
 *
 * Pure: no DOM, no I/O.
 */
export function planFormatDerivative(input: {
  sourceFormatId: string;
  targetFormatId: string;
  sourceWidth: number;
  sourceHeight: number;
  orientation?: Orientation;
}): FormatDerivativePlan | null {
  if (input.sourceWidth <= 0 || input.sourceHeight <= 0) return null;
  if (input.sourceFormatId === input.targetFormatId) return null;

  const sourceFmt = getPrintFormat(input.sourceFormatId);
  const targetFmt = getPrintFormat(input.targetFormatId);
  if (!sourceFmt || !targetFmt) return null;

  const orientation: Orientation =
    input.orientation ?? (input.sourceWidth >= input.sourceHeight ? "landscape" : "portrait");

  const target = resolveDerivativeTargetSize(input.targetFormatId, orientation);
  if (!target) return null;

  const targetRatio =
    orientation === "portrait"
      ? targetFmt.aspectRatioDecimal
      : 1 / targetFmt.aspectRatioDecimal;
  const sourceRatio = input.sourceWidth / input.sourceHeight;

  const sameRatio = isAspectRatioMatch(input.sourceWidth, input.sourceHeight, targetRatio);

  // Compute the largest centred rectangle inside the source that matches
  // the target ratio. Same-ratio → whole source; otherwise crop the long axis.
  let cropW: number;
  let cropH: number;
  if (sameRatio) {
    cropW = input.sourceWidth;
    cropH = input.sourceHeight;
  } else if (sourceRatio > targetRatio) {
    // Source wider than target → crop horizontally (side-crop).
    cropH = input.sourceHeight;
    cropW = Math.round(cropH * targetRatio);
  } else {
    // Source narrower/taller than target → crop vertically.
    cropW = input.sourceWidth;
    cropH = Math.round(cropW / targetRatio);
  }
  const cropBox: DerivativeCropBox = {
    x: Math.max(0, Math.round((input.sourceWidth - cropW) / 2)),
    y: Math.max(0, Math.round((input.sourceHeight - cropH) / 2)),
    width: cropW,
    height: cropH,
  };

  const warnings: DerivativeWarning[] = [];
  const isA = (id: string) => id === "print_a2" || id === "print_a3" || id === "print_a4";

  // A-series → 50x70: the target is wider; we're forced to vertically crop.
  if (isA(input.sourceFormatId) && input.targetFormatId === "print_50x70" && !sameRatio) {
    warnings.push("a-series-to-50x70-vertical-crop");
  } else if (!sameRatio) {
    // Any other cross-ratio derivation is a mild warning (informational).
    warnings.push("cross-ratio-crop");
  }

  // If target pixel dims exceed the cropped source, the derivative will be
  // upsized — surface this so the caller can decide whether to also enhance.
  if (target.width > cropBox.width || target.height > cropBox.height) {
    warnings.push("target-larger-than-source");
  }

  return {
    sourceFormat: input.sourceFormatId,
    targetFormat: input.targetFormatId,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    outputWidth: target.width,
    outputHeight: target.height,
    cropBox,
    sameRatio,
    warnings,
    cropOnly: true,
    targetRatio,
    sourceRatio,
    orientation,
  };
}

/**
 * List candidate targets for a given source format. Prefers 50×70 as the
 * source master for A-series derivatives (documented in the workflow).
 */
export function listCandidateTargets(sourceFormatId: string): Array<{
  formatId: SupportedDerivativeFormat;
  preferredSource: boolean;
  requiresConfirmation: boolean;
}> {
  const isA = (id: string) => id === "print_a2" || id === "print_a3" || id === "print_a4";
  return SUPPORTED_DERIVATIVE_FORMATS.filter((id) => id !== sourceFormatId).map((id) => {
    const requiresConfirmation = isA(sourceFormatId) && id === "print_50x70";
    // When source is 50×70, A-series targets are the "preferred" pairing.
    const preferredSource = sourceFormatId === "print_50x70" && isA(id);
    return { formatId: id, preferredSource, requiresConfirmation };
  });
}

/**
 * Validate that a produced derivative meets the standard print checks:
 * exact pixel size, correct ratio, effective PPI, no padding used.
 */
export function validateDerivativeResult(input: {
  targetFormatId: string;
  producedWidth: number;
  producedHeight: number;
  usedPadding: boolean;
}): {
  ok: boolean;
  exactPixelMatch: boolean;
  ratioMatch: boolean;
  achievablePpi: number;
  noPadding: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const fmt = getPrintFormat(input.targetFormatId);
  if (!fmt) {
    return {
      ok: false,
      exactPixelMatch: false,
      ratioMatch: false,
      achievablePpi: 0,
      noPadding: !input.usedPadding,
      errors: [`unknown target format: ${input.targetFormatId}`],
    };
  }
  const orientation: Orientation =
    input.producedWidth >= input.producedHeight ? "landscape" : "portrait";
  const target = resolveDerivativeTargetSize(input.targetFormatId, orientation);
  const exactPixelMatch =
    !!target &&
    target.width === input.producedWidth &&
    target.height === input.producedHeight;
  const targetRatio =
    orientation === "portrait" ? fmt.aspectRatioDecimal : 1 / fmt.aspectRatioDecimal;
  const ratioMatch = isAspectRatioMatch(input.producedWidth, input.producedHeight, targetRatio);
  const readiness = assessExportReadiness(input.producedWidth, input.producedHeight, fmt);
  const noPadding = !input.usedPadding;

  if (!exactPixelMatch) errors.push("derivative pixel size does not match target");
  if (!ratioMatch) errors.push("derivative aspect ratio does not match target");
  if (input.usedPadding) errors.push("derivative used padding — crop-only invariant violated");

  return {
    ok: exactPixelMatch && ratioMatch && noPadding,
    exactPixelMatch,
    ratioMatch,
    achievablePpi: readiness.achievablePpi,
    noPadding,
    errors,
  };
}

// ─────────────────────────── Browser executor ───────────────────────────

async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load source image for derivative"));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      type,
    );
  });
}

export interface DerivativeExecutionResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  plan: FormatDerivativePlan;
}

/**
 * Apply a derivative plan in the browser: load, crop, resize, encode.
 * Returns the PNG blob + a data URL — caller decides how to persist
 * (saveToGallery, download, etc.).
 */
export async function executeFormatDerivative(input: {
  sourceImageUrl: string;
  plan: FormatDerivativePlan;
}): Promise<DerivativeExecutionResult> {
  const img = await loadImageElement(input.sourceImageUrl);
  const plan = input.plan;

  const canvas = document.createElement("canvas");
  canvas.width = plan.outputWidth;
  canvas.height = plan.outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // High-quality resize.
  ctx.imageSmoothingEnabled = true;
  (ctx as CanvasRenderingContext2D & { imageSmoothingQuality?: string }).imageSmoothingQuality =
    "high";

  ctx.drawImage(
    img,
    plan.cropBox.x,
    plan.cropBox.y,
    plan.cropBox.width,
    plan.cropBox.height,
    0,
    0,
    plan.outputWidth,
    plan.outputHeight,
  );

  const blob = await canvasToBlob(canvas, "image/png");
  const dataUrl = canvas.toDataURL("image/png");
  return { blob, dataUrl, width: plan.outputWidth, height: plan.outputHeight, plan };
}
