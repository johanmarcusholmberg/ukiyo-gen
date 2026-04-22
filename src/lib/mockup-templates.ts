/**
 * Etsy listing mockup templates.
 *
 * Each template describes how the master artwork should be composed onto a
 * scene that's suitable for an Etsy listing thumbnail / hero image.
 *
 * Rendering itself lives in `lib/mockup-generator.ts` — this file is the
 * declarative source of truth for which mockups exist and how they're laid
 * out. Templates intentionally favor minimal, brand-cohesive scenes
 * (Scandinavian / neutral palette) over photorealistic interiors.
 *
 * Future expansion (boho, luxury, seasonal, branded packs, text overlays)
 * can be added by extending `MockupLayout` and registering new templates —
 * no changes to the generator's public API are required.
 */

export type MockupLayout = "frame" | "interior" | "crop" | "clean" | "size_guide";

export interface MockupBackground {
  /** Solid CSS-style colour (used by every layout as a fallback). */
  color: string;
  /** Optional secondary colour for a subtle vertical gradient (top → bottom). */
  gradientTo?: string;
  /** Optional simple horizon line (interior wall/floor split) at this fraction. */
  floorAt?: number;
  /** Floor colour when `floorAt` is set. */
  floorColor?: string;
}

export interface FrameStyle {
  /** Outer frame colour. */
  color: string;
  /** Frame thickness as a fraction of the *short* canvas side. */
  thicknessRatio: number;
  /** Inner mat (passe-partout) thickness as a fraction of the short side. */
  matRatio?: number;
  /** Mat colour. */
  matColor?: string;
  /** Drop shadow blur radius in pixels. */
  shadowBlur: number;
  /** Drop shadow colour (rgba string). */
  shadowColor: string;
  /** Vertical shadow offset in pixels. */
  shadowOffsetY: number;
}

export interface MockupTemplate {
  id: string;
  label: string;
  description: string;
  layout: MockupLayout;
  /** Output canvas width in pixels. Height is derived from `aspect`. */
  outputWidth: number;
  /** Aspect ratio of the *output canvas* (mockup), not the artwork. */
  aspect: { w: number; h: number };
  /** Background scene. */
  background: MockupBackground;
  /** Frame styling — only used by `layout === "frame"` and `"interior"`. */
  frame?: FrameStyle;
  /** Padding around the artwork inside the frame, fraction of short side. */
  artworkPadding: number;
  /** Maximum artwork width as a fraction of canvas width. */
  artworkMaxWidthRatio: number;
  /** Maximum artwork height as a fraction of canvas height. */
  artworkMaxHeightRatio: number;
  /** Vertical centre of the artwork as a fraction of canvas height. */
  artworkCenterY: number;
  /**
   * For `crop` layouts — fraction of the source image to keep (centred).
   * 0.4 = keep the middle 40% of width & height.
   */
  cropFraction?: number;
  /**
   * For `size_guide` — list of size labels to render side-by-side.
   * Pixel widths are derived proportionally from the largest entry.
   */
  sizeGuideSizes?: { label: string; widthCm: number; heightCm: number }[];
}

/* ------------------------------------------------------------------ */
/* Template registry                                                  */
/* ------------------------------------------------------------------ */

const MINIMAL_FRAME: MockupTemplate = {
  id: "minimal_frame",
  label: "Minimal frame",
  description: "Clean Scandinavian wall with a centred frame and soft shadow.",
  layout: "frame",
  outputWidth: 2400,
  aspect: { w: 4, h: 5 },
  background: {
    color: "#F4F1EC",
    gradientTo: "#ECE7DF",
  },
  frame: {
    color: "#1A1A1A",
    thicknessRatio: 0.018,
    matRatio: 0.035,
    matColor: "#FFFFFF",
    shadowBlur: 60,
    shadowColor: "rgba(0,0,0,0.18)",
    shadowOffsetY: 24,
  },
  artworkPadding: 0.0,
  artworkMaxWidthRatio: 0.62,
  artworkMaxHeightRatio: 0.72,
  artworkCenterY: 0.5,
};

const INTERIOR_LIVING: MockupTemplate = {
  id: "interior_living",
  label: "Interior scene",
  description: "Neutral living-room wall with subtle floor line.",
  layout: "interior",
  outputWidth: 2400,
  aspect: { w: 3, h: 2 },
  background: {
    color: "#E8E2D8",
    gradientTo: "#D8D1C5",
    floorAt: 0.82,
    floorColor: "#B8A98F",
  },
  frame: {
    color: "#2A2520",
    thicknessRatio: 0.014,
    matRatio: 0.028,
    matColor: "#FAF8F4",
    shadowBlur: 70,
    shadowColor: "rgba(0,0,0,0.22)",
    shadowOffsetY: 28,
  },
  artworkPadding: 0.0,
  artworkMaxWidthRatio: 0.42,
  artworkMaxHeightRatio: 0.6,
  artworkCenterY: 0.42,
};

const CLOSE_UP_DETAIL: MockupTemplate = {
  id: "close_up_detail",
  label: "Close-up detail",
  description: "Centre crop of the artwork to showcase texture and quality.",
  layout: "crop",
  outputWidth: 2400,
  aspect: { w: 1, h: 1 },
  background: { color: "#FFFFFF" },
  artworkPadding: 0.04,
  artworkMaxWidthRatio: 0.96,
  artworkMaxHeightRatio: 0.96,
  artworkCenterY: 0.5,
  cropFraction: 0.45,
};

const CLEAN_BACKGROUND: MockupTemplate = {
  id: "clean_background",
  label: "Clean background",
  description: "Artwork on a plain background — ideal for thumbnails.",
  layout: "clean",
  outputWidth: 2400,
  aspect: { w: 1, h: 1 },
  background: {
    color: "#FBF9F4",
    gradientTo: "#F1ECE2",
  },
  artworkPadding: 0.06,
  artworkMaxWidthRatio: 0.78,
  artworkMaxHeightRatio: 0.78,
  artworkCenterY: 0.5,
};

const SIZE_GUIDE: MockupTemplate = {
  id: "size_guide",
  label: "Size guide",
  description: "Side-by-side comparison of common print sizes.",
  layout: "size_guide",
  outputWidth: 2400,
  aspect: { w: 3, h: 2 },
  background: {
    color: "#F4F1EC",
    gradientTo: "#E8E2D8",
  },
  frame: {
    color: "#1A1A1A",
    thicknessRatio: 0.008,
    shadowBlur: 30,
    shadowColor: "rgba(0,0,0,0.15)",
    shadowOffsetY: 12,
  },
  artworkPadding: 0,
  artworkMaxWidthRatio: 0.9,
  artworkMaxHeightRatio: 0.7,
  artworkCenterY: 0.48,
  sizeGuideSizes: [
    { label: "20×30", widthCm: 20, heightCm: 30 },
    { label: "30×40", widthCm: 30, heightCm: 40 },
    { label: "50×70", widthCm: 50, heightCm: 70 },
  ],
};

export const MOCKUP_TEMPLATES: MockupTemplate[] = [
  MINIMAL_FRAME,
  INTERIOR_LIVING,
  CLOSE_UP_DETAIL,
  CLEAN_BACKGROUND,
  SIZE_GUIDE,
];

/** Templates that ship as the default Etsy-ready mockup pack (3–5 images). */
export const DEFAULT_MOCKUP_PACK_IDS: string[] = [
  MINIMAL_FRAME.id,
  INTERIOR_LIVING.id,
  CLOSE_UP_DETAIL.id,
  CLEAN_BACKGROUND.id,
];

export function getMockupTemplate(id: string): MockupTemplate | undefined {
  return MOCKUP_TEMPLATES.find((t) => t.id === id);
}

export function getDefaultMockupTemplates(): MockupTemplate[] {
  return DEFAULT_MOCKUP_PACK_IDS
    .map((id) => getMockupTemplate(id))
    .filter((t): t is MockupTemplate => !!t);
}
