# Standardized Bleed System (revised)

## Goal

**Every** exported/downloaded poster file ships with a static **3 mm bleed** on all sides and a defined **10 mm safe area** inside the trim line. No download path is exempt — including "Original" downloads. Mockups, previews, gallery thumbnails and storefront keep displaying the **trim** image only.

## Core rules

1. Bleed is applied at export time, in pixels, via edge-stretch (never white margins).
2. Customer-visible surfaces always use trim dimensions.
3. Source images are never delivered untouched through any download button.

## Architecture

```text
                ┌────────────────────────────┐
                │      bleed-config.ts       │  single source of truth
                │  DEFAULT_BLEED_MM = 3      │
                │  DEFAULT_SAFE_MM  = 10     │
                │  computeBleedPixels(...)   │
                │  renderWithBleed(img,...)  │  ← edge-stretch
                └─────────────┬──────────────┘
                              │
   ┌──────────────┬───────────┴──────────────┬──────────────────┐
   │ print-export │  etsy-export             │  raw-download    │
   │ (single PNG) │  (ZIP bundle)            │  (any image)     │
   └──────────────┴──────────────────────────┴──────────────────┘
                              │
                  ┌───────────┴────────────┐
                  │ mockups / gallery /    │  ← ALWAYS trim only
                  │ previews / storefront  │
                  └────────────────────────┘
```

## Changes

### 1. New module — `src/lib/bleed-config.ts`
- `DEFAULT_BLEED_MM = 3`, `DEFAULT_SAFE_MM = 10`, `DEFAULT_EXPORT_DPI = 300`.
- `BleedConfig = { bleedMm, safeMm }` and `getDefaultBleedConfig()`.
- `computeBleedPixels({ trimWidthPx, trimHeightPx, dpi, bleedMm })` → `{ bleedPx, exportWidth, exportHeight, safePx }`.
- `mmToPx(mm, dpi)`, `pxToMm(px, dpi)`.
- `renderWithBleed(source, { trimWidth, trimHeight, bleedPx, ctx })` — draws the artwork to **fill** the trim rectangle centred inside the trim+bleed canvas, then **stretches the outer 1 px row/column** outward to fill the bleed area. Never paints white.
- `describeBleed(trimWmm, trimHmm, bleedMm)` → `"Trim 200×300 mm · Export 206×306 mm · 3 mm bleed"`.

### 2. `src/lib/print-formats.ts`
- Add `widthMm` / `heightMm` derived from cm fields.
- New helper `getPrintExportSizeWithBleed(formatId, dpi, bleedMm)` → `{ trim, bleed, export }` pixel triplet.
- `assessExportReadiness` keeps evaluating against trim (bleed is generated, not required from source).

### 3. `src/lib/print-export.ts`
- After computing trim pixels (existing `targetW/H`), expand canvas to `exportW/H = trim + 2×bleedPx`, render via `renderWithBleed`.
- `PrintExportResult` gains: `trimWidth`, `trimHeight`, `exportWidth`, `exportHeight`, `bleedMm`, `safeMm`, `bleedPx`.
- `width`/`height` continue to report what's in the blob (export size) so download UIs stay accurate.
- `assertCanvasWithinLimits` runs on bleed-inflated dimensions.

### 4. `src/lib/etsy-export.ts` + `export-templates.ts`
- `ExportSize` gains derived `bleedPixelWidth/Height`.
- `renderSizeToBlob` always renders into trim+bleed via `renderWithBleed`. Existing `withBorder` becomes a true white frame **inside the trim** (border ≠ bleed); ZIP filename keeps `_bordered` suffix when used.
- All filenames get a `_bleed3mm` suffix.
- README.txt lists trim + export + bleed + safe-area note per size.

### 5. `EtsyExportDialog.tsx`
- Each size row shows trim, export pixel size, and "3 mm bleed".
- Readiness panel adds: "All files include 3 mm bleed; keep important content ≥10 mm inside the trim line."

### 6. Poster Composer export
- `usePosterComposer`/`exportPoster` call into the same `preparePrintExport`/`renderWithBleed` path, so bleed is inherited automatically. Composer's reserved safe-area band stays inside trim.

### 7. **Raw / "Original" downloads — new behaviour**
- New helper `src/lib/raw-download.ts → downloadWithBleed(imageUrl, { filename, printFormatId?, dpi? })`:
  - If `printFormatId` resolves: render via `preparePrintExport` (trim = format trim, bleed = 3 mm).
  - Otherwise: load the source image, treat its natural pixel dims as the **trim canvas**, use provided `dpi` or `DEFAULT_EXPORT_DPI = 300`, compute `bleedPx = mmToPx(3, dpi)`, render via `renderWithBleed`.
  - Always returns a PNG blob with bleed baked in. **Never streams the source untouched.**
- `src/components/generation/DownloadButton.tsx` now calls `downloadWithBleed` instead of `fetch → blob → anchor`. Accepts optional `printFormatId` and `dpi` props.
- All other call sites that fetch/save raw image URLs for download (audit `Gallery.tsx`, `GeneratedImageActions.tsx`, `BatchGenerator.tsx` download buttons) are switched to `downloadWithBleed`. **Display thumbnails are not touched** — only the click-to-download paths.

### 8. Mockups / previews / gallery / storefront
- No image changes. `ImagePreviewMockups`, `EtsyMockupDialog`, `Gallery`, `print-readiness` continue to render trim. Where any UI displays an export pixel size for a *download*, label it `"Export: W×H px (incl. 3 mm bleed)"`; where it displays a customer/poster size, keep trim.

### 9. Metadata
- `PrintExportResult`/`EtsyExportResult` carry the trim/export/bleed/safe fields. No DB migration in this phase; downstream persistence is opt-in.

### 10. Tests
- New `src/lib/bleed-config.test.ts` — mm↔px math, 50×70/30×40/A4/A3/A2 at 150 & 300 DPI, edge-stretch result dimensions = trim + 2·bleedPx.
- Extend `src/lib/print-export.test.ts` — every export reports export = trim + 2·bleed; canvas limit guard fires on inflated size.
- New `src/lib/raw-download.test.ts` (jsdom canvas mock) — no-format path uses source natural dims as trim and adds 3 mm at 300 DPI.

## Backwards compatibility

- Default behaviour change: **every** download is now 3 mm larger per side. This is the intended acceptance criterion.
- `withBorder` (Etsy) preserved — border lives inside trim, bleed wraps it.
- Edge-stretch handles sources without dedicated bleed content; no outpainting cost. True outpainting can replace `renderWithBleed`'s strategy later behind a flag without API changes.
- Memory rule "Never crop artwork for print or framing" is preserved — edge-stretch adds pixels outside the trim, the trim region itself is unchanged.

## Acceptance

- Every exported/downloaded poster file — print export, Etsy ZIP, poster composer export, Original download, any future export preset — includes static 3 mm bleed on all sides.
- Raw/original downloads are **no exception**; they go through `downloadWithBleed`.
- No download path ever adds white margins; edge-stretch is the only fill strategy.
- Mockups, gallery thumbnails, previews and storefront keep displaying trim size.
- Export UIs distinguish trim vs export dimensions and surface "3 mm bleed".
- `tsc --noEmit` clean; existing vitest suite green; new tests pass.
