/**
 * Bleed configuration — single source of truth for the global poster
 * bleed system.
 *
 * Every exported / downloaded poster file in the app passes through the
 * helpers in this module. Bleed is applied at export time, in pixels,
 * via an **edge-stretch** strategy: the source artwork fills the trim
 * rectangle and the outermost 1 px row/column is stretched outward to
 * fill the bleed area. We never paint white margins, and we never crop.
 *
 * Customer-visible surfaces (mockups, gallery thumbnails, previews,
 * storefront) keep using trim dimensions — bleed is added only when a
 * file is exported.
 */

/** Default bleed applied to every export (millimetres, per side). */
export const DEFAULT_BLEED_MM = 3;

/**
 * Default safe-area inset (millimetres, from the trim edge). Important
 * content — text, logos, signatures, focal elements — should stay
 * outside this margin so it isn't lost to trimming or framing.
 */
export const DEFAULT_SAFE_MM = 10;

/**
 * DPI used when no print format / DPI is associated with the export
 * (e.g. raw "Original" downloads). 300 DPI is the printer-standard
 * baseline for poster work.
 */
export const DEFAULT_EXPORT_DPI = 300;

const MM_PER_INCH = 25.4;

export interface BleedConfig {
  bleedMm: number;
  safeMm: number;
}

export function getDefaultBleedConfig(): BleedConfig {
  return { bleedMm: DEFAULT_BLEED_MM, safeMm: DEFAULT_SAFE_MM };
}

/** Convert millimetres to pixels at a given DPI. Rounds to integer. */
export function mmToPx(mm: number, dpi: number): number {
  if (!Number.isFinite(mm) || !Number.isFinite(dpi) || dpi <= 0) return 0;
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/** Convert pixels to millimetres at a given DPI. */
export function pxToMm(px: number, dpi: number): number {
  if (!Number.isFinite(px) || !Number.isFinite(dpi) || dpi <= 0) return 0;
  return (px / dpi) * MM_PER_INCH;
}

export interface ComputeBleedInput {
  /** Trim canvas width in pixels (customer-visible). */
  trimWidthPx: number;
  /** Trim canvas height in pixels (customer-visible). */
  trimHeightPx: number;
  /** Effective DPI of the trim canvas. Defaults to {@link DEFAULT_EXPORT_DPI}. */
  dpi?: number;
  /** Bleed in mm. Defaults to {@link DEFAULT_BLEED_MM}. */
  bleedMm?: number;
  /** Safe-area inset in mm. Defaults to {@link DEFAULT_SAFE_MM}. */
  safeMm?: number;
}

export interface ComputeBleedResult {
  bleedPx: number;
  safePx: number;
  dpi: number;
  bleedMm: number;
  safeMm: number;
  trimWidth: number;
  trimHeight: number;
  /** Final exported canvas width = trim + 2 × bleed. */
  exportWidth: number;
  /** Final exported canvas height = trim + 2 × bleed. */
  exportHeight: number;
}

/** Compute pixel-space bleed metadata for an export. Pure function. */
export function computeBleedPixels(input: ComputeBleedInput): ComputeBleedResult {
  const dpi = input.dpi && input.dpi > 0 ? input.dpi : DEFAULT_EXPORT_DPI;
  const bleedMm = input.bleedMm ?? DEFAULT_BLEED_MM;
  const safeMm = input.safeMm ?? DEFAULT_SAFE_MM;
  const bleedPx = mmToPx(bleedMm, dpi);
  const safePx = mmToPx(safeMm, dpi);
  return {
    bleedPx,
    safePx,
    dpi,
    bleedMm,
    safeMm,
    trimWidth: input.trimWidthPx,
    trimHeight: input.trimHeightPx,
    exportWidth: input.trimWidthPx + bleedPx * 2,
    exportHeight: input.trimHeightPx + bleedPx * 2,
  };
}

/** Human-readable description of an export's trim/bleed/export sizing. */
export function describeBleed(
  trimWidthMm: number,
  trimHeightMm: number,
  bleedMm: number = DEFAULT_BLEED_MM,
): string {
  const exportW = trimWidthMm + bleedMm * 2;
  const exportH = trimHeightMm + bleedMm * 2;
  return `Trim ${trimWidthMm}×${trimHeightMm} mm · Export ${exportW}×${exportH} mm · ${bleedMm} mm bleed`;
}

export interface RenderWithBleedInput {
  /** Source artwork — already loaded and decoded. */
  source: CanvasImageSource;
  /** Natural source width in pixels. */
  sourceWidth: number;
  /** Natural source height in pixels. */
  sourceHeight: number;
  /** Trim width in destination pixels. */
  trimWidth: number;
  /** Trim height in destination pixels. */
  trimHeight: number;
  /** Bleed in destination pixels (per side). */
  bleedPx: number;
  /** Target canvas 2D context, already sized to trim + 2 × bleed. */
  ctx: CanvasRenderingContext2D;
}

/**
 * Render artwork into a trim+bleed canvas using the edge-stretch strategy.
 *
 *   1. The destination canvas must already be sized to
 *      `trimWidth + 2 × bleedPx` by `trimHeight + 2 × bleedPx`.
 *   2. The source is drawn to fill the trim rectangle exactly (no crop,
 *      no letterbox — the caller is responsible for matching aspect
 *      ratios; print-export does this via ratio-normalization first).
 *   3. The outermost 1 px rows/columns of the rendered trim region are
 *      stretched outward to fill the four bleed bands and the four
 *      corner squares. The result is a seamless edge extension — no
 *      white borders are ever painted.
 */
export function renderWithBleed(input: RenderWithBleedInput): void {
  const { ctx, source, trimWidth, trimHeight, bleedPx } = input;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 1. Draw artwork into the trim rectangle (offset by bleedPx).
  ctx.drawImage(
    source,
    0, 0, input.sourceWidth, input.sourceHeight,
    bleedPx, bleedPx, trimWidth, trimHeight,
  );

  if (bleedPx <= 0) return;

  // 2. Stretch the outer trim edges into the bleed bands. We grab a
  //    1 px strip of the rendered trim region and stretch it outward.
  //    Using drawImage(canvas, ...) is fast and uses GPU resampling.
  const c = ctx.canvas;
  // Top band: top 1 px row → entire top bleed band (full width).
  ctx.drawImage(c, bleedPx, bleedPx, trimWidth, 1, bleedPx, 0, trimWidth, bleedPx);
  // Bottom band.
  ctx.drawImage(
    c,
    bleedPx, bleedPx + trimHeight - 1, trimWidth, 1,
    bleedPx, bleedPx + trimHeight, trimWidth, bleedPx,
  );
  // Left band.
  ctx.drawImage(c, bleedPx, bleedPx, 1, trimHeight, 0, bleedPx, bleedPx, trimHeight);
  // Right band.
  ctx.drawImage(
    c,
    bleedPx + trimWidth - 1, bleedPx, 1, trimHeight,
    bleedPx + trimWidth, bleedPx, bleedPx, trimHeight,
  );
  // Corners — stretch the four corner pixels of the trim region.
  ctx.drawImage(c, bleedPx, bleedPx, 1, 1, 0, 0, bleedPx, bleedPx); // TL
  ctx.drawImage(
    c, bleedPx + trimWidth - 1, bleedPx, 1, 1,
    bleedPx + trimWidth, 0, bleedPx, bleedPx,
  ); // TR
  ctx.drawImage(
    c, bleedPx, bleedPx + trimHeight - 1, 1, 1,
    0, bleedPx + trimHeight, bleedPx, bleedPx,
  ); // BL
  ctx.drawImage(
    c, bleedPx + trimWidth - 1, bleedPx + trimHeight - 1, 1, 1,
    bleedPx + trimWidth, bleedPx + trimHeight, bleedPx, bleedPx,
  ); // BR
}
