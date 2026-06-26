/**
 * Central poster-master guard.
 *
 * Single source of truth for "turn a raw provider/upscaler image into a
 * print-ready master at the EXACT selected poster ratio". Every save,
 * replace, upscale-source, and export path should go through this helper
 * so we cannot regress to off-ratio masters.
 *
 * Hard rules (mirror project memory):
 *   - Never crop. Never stretch. Only pad.
 *   - Raw provider output is preserved separately on the metadata.
 *   - If enforcement fails we throw — never silently save off-ratio.
 */
import { loadImageDimensions } from "@/lib/image-metadata";
import { getPrintFormat } from "@/lib/print-formats";
import {
  enforcePosterRatio,
  planPosterRatioCorrection,
  POSTER_RATIO_TOLERANCE,
} from "@/lib/poster-ratio-enforce";

export type PosterRatioCorrectionMethod = "none" | "pad" | "post_upscale_pad";

export interface PosterMaster {
  /** Untouched provider URL, kept for provenance. */
  rawProviderImageUrl: string;
  /** Corrected master URL — the only URL downstream consumers should use. */
  masterImageUrl: string;
  originalWidth: number;
  originalHeight: number;
  masterWidth: number;
  masterHeight: number;
  posterFormatId: string;
  targetAspectRatio: number;
  originalAspectRatio: number;
  masterAspectRatio: number;
  ratioCorrected: boolean;
  ratioCorrectionMethod: PosterRatioCorrectionMethod;
  /** True when provider returned exact-ratio output (within tolerance). */
  providerExactMatch: boolean;
  /** Inverse — true when we had to pad. */
  providerAdjusted: boolean;
}

export interface PreparePosterMasterInput {
  rawImageUrl: string;
  posterFormatId: string;
  /** Method label to record (defaults to "pad"). Pass "post_upscale_pad" after upscale. */
  correctionMethod?: "pad" | "post_upscale_pad";
  background?: string;
}

/**
 * Lightweight ratio check — returns true if `width/height` matches the
 * poster format's target ratio within tolerance.
 */
export function isWithinPosterRatio(
  width: number | null | undefined,
  height: number | null | undefined,
  posterFormatId: string | null | undefined,
): boolean {
  if (!width || !height || !posterFormatId) return false;
  const fmt = getPrintFormat(posterFormatId);
  if (!fmt) return false;
  const source = width / height;
  const ratioError = Math.abs(source - fmt.aspectRatioDecimal) / fmt.aspectRatioDecimal;
  return ratioError <= POSTER_RATIO_TOLERANCE;
}

/**
 * Probe a URL's pixel dimensions. Wraps `loadImageDimensions` with a
 * descriptive error so failures bubble up clearly.
 */
async function probeDimensions(url: string): Promise<{ width: number; height: number }> {
  try {
    return await loadImageDimensions(url);
  } catch (e) {
    throw new Error(
      `poster-master: failed to probe image dimensions (${e instanceof Error ? e.message : String(e)})`,
    );
  }
}

/**
 * Run the central enforcement pipeline. Resolves to a `PosterMaster`
 * record describing the corrected master. Throws if dimensions cannot be
 * probed, if the poster format is unknown, or if the canvas/upload
 * fallback fails — never silently degrades to the raw output.
 */
export async function preparePosterMaster(
  input: PreparePosterMasterInput,
): Promise<PosterMaster> {
  const fmt = getPrintFormat(input.posterFormatId);
  if (!fmt) {
    throw new Error(`poster-master: unknown posterFormatId "${input.posterFormatId}"`);
  }

  const dims = await probeDimensions(input.rawImageUrl);
  const plan = planPosterRatioCorrection(dims.width, dims.height, input.posterFormatId);
  if (!plan) {
    throw new Error("poster-master: failed to plan ratio correction");
  }

  // Already in tolerance — keep raw URL as master, record exact match.
  if (plan.method === "none") {
    const ratio = dims.width / dims.height;
    return {
      rawProviderImageUrl: input.rawImageUrl,
      masterImageUrl: input.rawImageUrl,
      originalWidth: dims.width,
      originalHeight: dims.height,
      masterWidth: dims.width,
      masterHeight: dims.height,
      posterFormatId: input.posterFormatId,
      targetAspectRatio: fmt.aspectRatioDecimal,
      originalAspectRatio: ratio,
      masterAspectRatio: ratio,
      ratioCorrected: false,
      ratioCorrectionMethod: "none",
      providerExactMatch: true,
      providerAdjusted: false,
    };
  }

  // Off-ratio — run the enforcement executor.
  const enforced = await enforcePosterRatio({
    imageUrl: input.rawImageUrl,
    formatId: input.posterFormatId,
    background: input.background,
  });
  if (!enforced) {
    throw new Error("poster-master: enforcePosterRatio returned null");
  }
  // Defence in depth — confirm the corrected output is within tolerance
  // before we expose it as the master.
  if (!isWithinPosterRatio(enforced.width, enforced.height, input.posterFormatId)) {
    throw new Error(
      `poster-master: enforced output still off-ratio (${enforced.width}x${enforced.height} for ${input.posterFormatId})`,
    );
  }

  return {
    rawProviderImageUrl: input.rawImageUrl,
    masterImageUrl: enforced.url,
    originalWidth: dims.width,
    originalHeight: dims.height,
    masterWidth: enforced.width,
    masterHeight: enforced.height,
    posterFormatId: input.posterFormatId,
    targetAspectRatio: fmt.aspectRatioDecimal,
    originalAspectRatio: dims.width / dims.height,
    masterAspectRatio: enforced.width / enforced.height,
    ratioCorrected: true,
    ratioCorrectionMethod: input.correctionMethod ?? "pad",
    providerExactMatch: false,
    providerAdjusted: true,
  };
}

/**
 * Save-time invariant. Given the gallery save options, ensure a
 * print-ready master matches the selected poster ratio. Mutates a
 * shallow clone with the corrected URLs/dimensions and a metadata blob.
 *
 * Skips silently for non-print rows (no `printFormatId`).
 */
export interface EnsuredPrintMaster<T> {
  opts: T;
  master: PosterMaster | null;
}

export async function ensurePrintMasterInSaveOpts<
  T extends {
    imageUrl: string;
    printFormatId?: string;
    masterImageUrl?: string;
    baseImageUrl?: string;
    masterWidth?: number;
    masterHeight?: number;
    actualWidthPx?: number;
    actualHeightPx?: number;
    baseWidthPx?: number;
    baseHeightPx?: number;
  },
>(opts: T): Promise<EnsuredPrintMaster<T>> {
  const posterFormatId = opts.printFormatId;
  if (!posterFormatId) return { opts, master: null };

  // Skip if caller already supplied master dims that are exactly on-ratio.
  if (
    opts.masterWidth &&
    opts.masterHeight &&
    isWithinPosterRatio(opts.masterWidth, opts.masterHeight, posterFormatId)
  ) {
    return { opts, master: null };
  }

  let master: PosterMaster;
  try {
    master = await preparePosterMaster({
      rawImageUrl: opts.masterImageUrl || opts.imageUrl,
      posterFormatId,
    });
  } catch (e) {
    throw new Error(
      `Print-ready save blocked: could not produce a ${posterFormatId} master (${e instanceof Error ? e.message : String(e)})`,
    );
  }

  // Use corrected URL as the master AND as the imageUrl that gallery.ts
  // uploads as the base — we never persist the raw off-ratio asset as
  // the storage object that downstream code reads back.
  const next: T = {
    ...opts,
    imageUrl: master.masterImageUrl,
    baseImageUrl: master.masterImageUrl,
    masterImageUrl: master.masterImageUrl,
    masterWidth: master.masterWidth,
    masterHeight: master.masterHeight,
    actualWidthPx: master.masterWidth,
    actualHeightPx: master.masterHeight,
    baseWidthPx: master.masterWidth,
    baseHeightPx: master.masterHeight,
  };
  return { opts: next, master };
}
