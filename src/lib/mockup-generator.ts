/**
 * Etsy mockup generator.
 *
 * Renders the master artwork into a set of listing-ready scenes defined in
 * `mockup-templates.ts`. The pipeline is intentionally simple:
 *
 *   master image (loaded once)
 *     → for each template:
 *         draw background → draw frame (if any) → place artwork → shadow
 *     → toBlob() → JPEG
 *
 * Rules:
 *   - the input *must* be the master asset URL (caller resolves via
 *     `getExportSourceAssetForImage` from `lib/image-assets.ts`)
 *   - never crops the artwork unless the template explicitly asks for it
 *     (`layout === "crop"`)
 *   - rendering is image-based (canvas drawImage) — no DOM screenshots
 *
 * The generator returns blobs *plus* object URLs so the UI can preview them
 * without re-downloading. Always call `revokeMockupBundle` when discarding.
 */
import JSZip from "jszip";

import {
  MOCKUP_TEMPLATES,
  getDefaultMockupTemplates,
  getMockupTemplate,
  type MockupTemplate,
  type FrameStyle,
} from "@/lib/mockup-templates";

/* ------------------------------------------------------------------ */
/* Public types                                                       */
/* ------------------------------------------------------------------ */

export interface GenerateMockupsOptions {
  /** Template ids to render. Defaults to the Etsy basic pack. */
  templateIds?: string[];
  /** JPEG quality (0..1). Default 0.92 — high enough for listings. */
  quality?: number;
  /** Optional progress callback, invoked between renders. */
  onProgress?: (progress: { done: number; total: number; currentLabel?: string }) => void;
}

export interface MockupResult {
  templateId: string;
  label: string;
  layout: MockupTemplate["layout"];
  fileName: string;
  blob: Blob;
  /** ObjectURL — caller must revoke (use `revokeMockupBundle`). */
  url: string;
  width: number;
  height: number;
}

export interface MockupBundle {
  results: MockupResult[];
  generatedAt: number;
}

/* ------------------------------------------------------------------ */
/* Image loading                                                      */
/* ------------------------------------------------------------------ */

function loadImage(src: string, timeoutMs = 60_000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const t = setTimeout(() => {
      img.src = "";
      reject(new Error("Source image load timed out"));
    }, timeoutMs);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => {
      clearTimeout(t);
      reject(new Error("Failed to load source image"));
    };
    img.src = src;
  });
}

/* ------------------------------------------------------------------ */
/* Drawing primitives                                                 */
/* ------------------------------------------------------------------ */

function paintBackground(ctx: CanvasRenderingContext2D, t: MockupTemplate, w: number, h: number) {
  const { background } = t;
  if (background.gradientTo) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, background.color);
    grad.addColorStop(1, background.gradientTo);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = background.color;
  }
  ctx.fillRect(0, 0, w, h);

  if (background.floorAt && background.floorColor) {
    const floorY = h * background.floorAt;
    ctx.fillStyle = background.floorColor;
    ctx.fillRect(0, floorY, w, h - floorY);
    // Subtle floor/wall transition shadow
    const grad = ctx.createLinearGradient(0, floorY - h * 0.04, 0, floorY + h * 0.02);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.08)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, floorY - h * 0.04, w, h * 0.06);
  }
}

interface PlacedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function fitRect(
  imgW: number,
  imgH: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  const ratio = Math.min(maxW / imgW, maxH / imgH);
  return { width: imgW * ratio, height: imgH * ratio };
}

function drawShadow(
  ctx: CanvasRenderingContext2D,
  rect: PlacedRect,
  frame: FrameStyle,
) {
  ctx.save();
  ctx.shadowColor = frame.shadowColor;
  ctx.shadowBlur = frame.shadowBlur;
  ctx.shadowOffsetY = frame.shadowOffsetY;
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawFrameStack(
  ctx: CanvasRenderingContext2D,
  outer: PlacedRect,
  frame: FrameStyle,
  shortSide: number,
  artworkRect: PlacedRect,
) {
  // Outer frame
  ctx.fillStyle = frame.color;
  ctx.fillRect(outer.x, outer.y, outer.width, outer.height);

  // Mat (passe-partout)
  if (frame.matRatio && frame.matColor) {
    const mat = frame.matRatio * shortSide;
    ctx.fillStyle = frame.matColor;
    ctx.fillRect(
      artworkRect.x - mat,
      artworkRect.y - mat,
      artworkRect.width + mat * 2,
      artworkRect.height + mat * 2,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Per-layout renderers                                               */
/* ------------------------------------------------------------------ */

function renderFrameLayout(
  ctx: CanvasRenderingContext2D,
  t: MockupTemplate,
  src: HTMLImageElement,
  w: number,
  h: number,
) {
  paintBackground(ctx, t, w, h);

  const shortSide = Math.min(w, h);
  const maxArtW = w * t.artworkMaxWidthRatio;
  const maxArtH = h * t.artworkMaxHeightRatio;
  const fitted = fitRect(src.naturalWidth, src.naturalHeight, maxArtW, maxArtH);
  const artworkRect: PlacedRect = {
    x: (w - fitted.width) / 2,
    y: h * t.artworkCenterY - fitted.height / 2,
    width: fitted.width,
    height: fitted.height,
  };

  if (t.frame) {
    const thickness = t.frame.thicknessRatio * shortSide;
    const mat = (t.frame.matRatio ?? 0) * shortSide;
    const outerRect: PlacedRect = {
      x: artworkRect.x - mat - thickness,
      y: artworkRect.y - mat - thickness,
      width: artworkRect.width + (mat + thickness) * 2,
      height: artworkRect.height + (mat + thickness) * 2,
    };
    drawShadow(ctx, outerRect, t.frame);
    drawFrameStack(ctx, outerRect, t.frame, shortSide, artworkRect);
  }

  ctx.drawImage(src, artworkRect.x, artworkRect.y, artworkRect.width, artworkRect.height);
}

function renderCleanLayout(
  ctx: CanvasRenderingContext2D,
  t: MockupTemplate,
  src: HTMLImageElement,
  w: number,
  h: number,
) {
  paintBackground(ctx, t, w, h);
  const maxArtW = w * t.artworkMaxWidthRatio;
  const maxArtH = h * t.artworkMaxHeightRatio;
  const fitted = fitRect(src.naturalWidth, src.naturalHeight, maxArtW, maxArtH);
  const x = (w - fitted.width) / 2;
  const y = h * t.artworkCenterY - fitted.height / 2;
  // Soft drop shadow even without a frame
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.12)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.fillRect(x, y, fitted.width, fitted.height);
  ctx.restore();
  ctx.drawImage(src, x, y, fitted.width, fitted.height);
}

function renderCropLayout(
  ctx: CanvasRenderingContext2D,
  t: MockupTemplate,
  src: HTMLImageElement,
  w: number,
  h: number,
) {
  paintBackground(ctx, t, w, h);
  const frac = Math.max(0.15, Math.min(0.95, t.cropFraction ?? 0.45));
  const cropW = src.naturalWidth * frac;
  const cropH = src.naturalHeight * frac;
  const cropX = (src.naturalWidth - cropW) / 2;
  const cropY = (src.naturalHeight - cropH) / 2;

  const maxArtW = w * t.artworkMaxWidthRatio;
  const maxArtH = h * t.artworkMaxHeightRatio;
  const fitted = fitRect(cropW, cropH, maxArtW, maxArtH);
  const dx = (w - fitted.width) / 2;
  const dy = h * t.artworkCenterY - fitted.height / 2;

  ctx.drawImage(src, cropX, cropY, cropW, cropH, dx, dy, fitted.width, fitted.height);
}

function renderSizeGuideLayout(
  ctx: CanvasRenderingContext2D,
  t: MockupTemplate,
  src: HTMLImageElement,
  w: number,
  h: number,
) {
  paintBackground(ctx, t, w, h);
  const sizes = t.sizeGuideSizes ?? [];
  if (!sizes.length) return;

  const shortSide = Math.min(w, h);
  const maxBlock = h * t.artworkMaxHeightRatio;
  const largest = sizes.reduce((a, b) => (b.heightCm > a.heightCm ? b : a), sizes[0]);
  const scaleCmToPx = maxBlock / largest.heightCm;

  const gap = w * 0.04;
  const totalWidth = sizes.reduce((sum, s) => sum + s.widthCm * scaleCmToPx, 0) + gap * (sizes.length - 1);
  let cursorX = (w - totalWidth) / 2;
  const baselineY = h * t.artworkCenterY + maxBlock / 2;

  ctx.fillStyle = "#1A1A1A";
  ctx.font = `${Math.round(shortSide * 0.024)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (const size of sizes) {
    const blockW = size.widthCm * scaleCmToPx;
    const blockH = size.heightCm * scaleCmToPx;
    const x = cursorX;
    const y = baselineY - blockH;

    if (t.frame) {
      const thickness = t.frame.thicknessRatio * shortSide;
      const outerRect: PlacedRect = {
        x: x - thickness,
        y: y - thickness,
        width: blockW + thickness * 2,
        height: blockH + thickness * 2,
      };
      drawShadow(ctx, outerRect, t.frame);
      ctx.fillStyle = t.frame.color;
      ctx.fillRect(outerRect.x, outerRect.y, outerRect.width, outerRect.height);
    }

    // Artwork — preserve aspect ratio inside this size's frame using contain-fit
    const fitted = fitRect(src.naturalWidth, src.naturalHeight, blockW, blockH);
    const artX = x + (blockW - fitted.width) / 2;
    const artY = y + (blockH - fitted.height) / 2;
    ctx.drawImage(src, artX, artY, fitted.width, fitted.height);

    // Label
    ctx.fillStyle = "#1A1A1A";
    ctx.fillText(`${size.label} cm`, x + blockW / 2, baselineY + h * 0.025);

    cursorX += blockW + gap;
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Mockup canvas export failed"))),
      type,
      quality,
    );
  });
}

async function renderTemplate(
  t: MockupTemplate,
  src: HTMLImageElement,
  quality: number,
): Promise<MockupResult> {
  const w = t.outputWidth;
  const h = Math.round((t.outputWidth * t.aspect.h) / t.aspect.w);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  switch (t.layout) {
    case "frame":
    case "interior":
      renderFrameLayout(ctx, t, src, w, h);
      break;
    case "clean":
      renderCleanLayout(ctx, t, src, w, h);
      break;
    case "crop":
      renderCropLayout(ctx, t, src, w, h);
      break;
    case "size_guide":
      renderSizeGuideLayout(ctx, t, src, w, h);
      break;
  }

  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  return {
    templateId: t.id,
    label: t.label,
    layout: t.layout,
    fileName: `mockup_${t.id}.jpg`,
    blob,
    url: blobToObjectUrl(blob),
    width: w,
    height: h,
  };
}

/**
 * Render the configured mockup pack from a master image URL.
 *
 * The caller must pass the *master* asset URL — typically the result of
 * `getExportSourceAssetForImage(image)` from `lib/image-assets.ts`.
 */
export async function generateMockupsForImage(
  masterUrl: string,
  options: GenerateMockupsOptions = {},
): Promise<MockupBundle> {
  if (!masterUrl) throw new Error("No master asset available for mockup generation");
  const templates = (options.templateIds && options.templateIds.length
    ? options.templateIds.map((id) => getMockupTemplate(id)).filter((t): t is MockupTemplate => !!t)
    : getDefaultMockupTemplates());

  if (!templates.length) throw new Error("No mockup templates selected");

  const quality = options.quality ?? 0.92;
  const src = await loadImage(masterUrl);
  const results: MockupResult[] = [];

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    options.onProgress?.({ done: i, total: templates.length, currentLabel: t.label });
    try {
      const r = await renderTemplate(t, src, quality);
      results.push(r);
    } catch (err) {
      // Skip a single failing template rather than nuke the whole pack.
      console.warn(`Mockup '${t.id}' failed to render:`, err);
    }
  }
  options.onProgress?.({ done: templates.length, total: templates.length });

  return { results, generatedAt: Date.now() };
}

export function revokeMockupBundle(bundle: MockupBundle | null) {
  if (!bundle) return;
  for (const r of bundle.results) {
    try { URL.revokeObjectURL(r.url); } catch { /* noop */ }
  }
}

/** Return all known templates (for selector UIs). */
export function getMockupTemplates(): MockupTemplate[] {
  return MOCKUP_TEMPLATES;
}

/* ------------------------------------------------------------------ */
/* ZIP packaging                                                      */
/* ------------------------------------------------------------------ */

export async function buildMockupZip(bundle: MockupBundle): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder("mockups");
  if (!folder) throw new Error("Failed to create mockups folder in ZIP");
  for (const r of bundle.results) {
    folder.file(r.fileName, r.blob);
  }
  folder.file(
    "README.txt",
    [
      "Etsy listing mockups",
      "",
      "Generated from the master asset of your artwork.",
      "Use these images as listing thumbnails and product previews.",
      "",
      "Files:",
      ...bundle.results.map((r) => `  - ${r.fileName} (${r.width}×${r.height})`),
    ].join("\n"),
  );
  return zip.generateAsync({ type: "blob" });
}

export function downloadMockupZip(zipBlob: Blob, fileName = "etsy-mockups.zip") {
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadMockupResult(result: MockupResult) {
  const a = document.createElement("a");
  a.href = result.url;
  a.download = result.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
