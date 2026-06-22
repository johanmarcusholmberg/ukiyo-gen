/**
 * Lightweight presentation metadata for the style selector UI.
 * Does NOT replace src/lib/style-config.ts (which holds prompt rules,
 * edge-fn routing and generator behavior). This file is only used by
 * the top-nav / style-selector to render cards, descriptions, categories.
 *
 * If you add a new style page, also add a row here so it shows up in the
 * style selector. Generation logic is unaffected.
 *
 * Phase-1 taxonomy (added 2026-06):
 *   - `family`, `visibility`, `variantOf`, `printSuitability`,
 *     `textureProfile`, `shortUserDescription`, `styleIntent` are pure
 *     metadata to power grouping/badges in the UI and to seed future
 *     per-style prompt and upscale work.
 *   - `negativePromptHints`, `printIntentModifier`, `upscaleNotes` are
 *     reserved fields populated for a handful of styles. They are NOT
 *     wired into the prompt compiler or upscale router yet.
 *   - No existing style IDs or routes changed. Generation behavior is
 *     unchanged.
 */

export type StyleCategory =
  | "Classic print"
  | "Illustration"
  | "Modern & graphic"
  | "Travel Photography"
  | "Experimental";

export type StyleFamily =
  | "japanese_ink"
  | "printmaking"
  | "modernist_graphic"
  | "painterly"
  | "botanical_naturalist"
  | "street_tattoo"
  | "minimalist"
  | "photo_mood"
  | "heritage_vintage"
  | "experimental_tool";

export type StyleVisibility = "primary" | "variant" | "hidden";

export type PrintSuitability = "excellent" | "good" | "risky";

export type TextureProfile =
  | "flat"
  | "clean"
  | "medium_texture"
  | "heavy_texture"
  | "grain_risky";

/** Display label and order for each family in the style selector. */
export const FAMILY_LABELS: Record<StyleFamily, string> = {
  japanese_ink: "Japanese & Ink",
  printmaking: "Printmaking",
  modernist_graphic: "Modernist & Graphic",
  painterly: "Painterly",
  botanical_naturalist: "Painterly & Naturalist",
  street_tattoo: "Street & Tattoo",
  minimalist: "Minimal",
  photo_mood: "Vintage & Heritage",
  heritage_vintage: "Vintage & Heritage",
  experimental_tool: "Experimental",
};

/** Render order for family groups in the selector. */
export const FAMILY_ORDER: StyleFamily[] = [
  "japanese_ink",
  "printmaking",
  "modernist_graphic",
  "painterly",
  "botanical_naturalist",
  "minimalist",
  "heritage_vintage",
  "photo_mood",
  "street_tattoo",
  "experimental_tool",
];

export interface StyleCatalogEntry {
  /** Route path for the style's generator page — stable ID, do not rename. */
  route: string;
  /** Display name */
  name: string;
  /** Small emoji/icon */
  emoji: string;
  /** One-sentence description shown on the selected-style card and style cards */
  description: string;
  /** Best-for / tagline shown on the selected-style card */
  bestFor?: string;
  /** Legacy category — retained for back-compat. Prefer `family`. */
  category: StyleCategory;

  // --- Phase-1 taxonomy metadata (presentation only) ---
  /** Broad family used for grouping in the style selector. */
  family?: StyleFamily;
  /** Whether the style is shown as a primary card or as a variant. */
  visibility?: StyleVisibility;
  /** If this is a variant, the parent style's route. */
  variantOf?: string;
  /** How well this style typically reproduces at large print sizes. */
  printSuitability?: PrintSuitability;
  /** Surface/texture profile — informs future upscale recipes. */
  textureProfile?: TextureProfile;
  /** Very short helper description (UI badges / tooltips). */
  shortUserDescription?: string;
  /** Intent tag — what users typically reach for this style for. */
  styleIntent?: string;

  // --- Phase-1 reserved fields (NOT wired into generation yet) ---
  negativePromptHints?: string[];
  printIntentModifier?: string;
  upscaleNotes?: string;
}

export const STYLE_CATALOG: StyleCatalogEntry[] = [
  // Classic print
  {
    route: "/",
    name: "Ukiyo-e",
    emoji: "🏯",
    description: "Traditional Japanese woodblock print style.",
    bestFor: "Atmospheric scenes, landscapes, waves, temples, cranes and poetic compositions.",
    category: "Classic print",
    family: "japanese_ink",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "medium_texture",
    styleIntent: "Poetic Japanese woodblock scenes",
    negativePromptHints: ["photorealistic", "3D render", "glossy", "cinematic photo"],
  },
  {
    route: "/risograph",
    name: "Risograph",
    emoji: "📠",
    description: "Layered duplicator print with grainy spot colors.",
    bestFor: "Zine covers, indie posters, retro-feel illustrations.",
    category: "Classic print",
    family: "printmaking",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "heavy_texture",
    styleIntent: "Grainy two-tone risograph poster",
    printIntentModifier:
      "Use larger visible ink textures and broad halftone patterns suitable for large-format print.",
  },
  {
    route: "/screenprint",
    name: "Screen Print",
    emoji: "🖨️",
    description: "Bold, flat-color silkscreen poster style.",
    bestFor: "Gig posters, two- to three-tone graphic prints.",
    category: "Classic print",
    family: "printmaking",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "medium_texture",
    styleIntent: "Bold flat-color silkscreen poster",
  },
  {
    route: "/xeroxzine",
    name: "Xerox Zine",
    emoji: "📋",
    description: "High-contrast photocopy zine aesthetic.",
    bestFor: "DIY punk-zine art, lo-fi black-and-white compositions.",
    category: "Classic print",
    family: "printmaking",
    visibility: "variant",
    variantOf: "/screenprint",
    printSuitability: "risky",
    textureProfile: "grain_risky",
    styleIntent: "High-contrast photocopy zine look",
  },

  // Illustration
  {
    route: "/lineart",
    name: "Line Art",
    emoji: "✒️",
    description: "Precise ink drawing with confident linework.",
    bestFor: "Botanical studies, architecture, single-line minimal sketches.",
    category: "Illustration",
    family: "japanese_ink",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "flat",
    styleIntent: "Clean ink linework",
  },
  {
    route: "/botanical",
    name: "Botanical",
    emoji: "🌿",
    description: "Watercolor botanical study illustration.",
    bestFor: "Flowers, ferns, mushrooms, herbarium-style plates.",
    category: "Illustration",
    family: "botanical_naturalist",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "medium_texture",
    styleIntent: "Herbarium-style botanical plates",
  },
  {
    route: "/tattooflash",
    name: "Tattoo Flash",
    emoji: "🔥",
    description: "Old-school tattoo flash sheet artwork.",
    bestFor: "Bold outlined icons, daggers, roses, hearts, eagles.",
    category: "Illustration",
    family: "street_tattoo",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "flat",
    styleIntent: "Old-school tattoo flash sheet",
  },
  {
    route: "/retrocomic",
    name: "Retro Comic",
    emoji: "💥",
    description: "Vintage comic-book panel art.",
    bestFor: "Action poses, halftone-shaded heroes, retro speech-bubble vibes.",
    category: "Illustration",
    family: "printmaking",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "heavy_texture",
    styleIntent: "Vintage comic panel art",
  },
  {
    route: "/whimsical-japanese",
    name: "Whimsical Japanese",
    emoji: "🦊",
    description: "Hand-painted Japanese-inspired storybook poster with anthropomorphic characters.",
    bestFor: "Whimsical animal heroes, ramen/tea/dumpling scenes, charming framed wall art.",
    category: "Illustration",
    family: "japanese_ink",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "medium_texture",
    styleIntent: "Storybook Japanese characters",
  },
  {
    route: "/modernist-cocktail",
    name: "Modernist Cocktail",
    emoji: "🍸",
    description: "Geometric mid-century beverage poster with limited palette and flat shapes.",
    bestFor: "Cocktails, wine, coffee, beer and spirits as bold collectible wall posters.",
    category: "Modern & graphic",
    family: "modernist_graphic",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "flat",
    styleIntent: "Mid-century beverage posters",
  },

  // Travel Photography
  {
    route: "/mediterranean-heritage",
    name: "Mediterranean Heritage",
    emoji: "🚪",
    description: "Fine-art Mediterranean travel photography with sunwashed materials and warm light.",
    bestFor: "Doors, windows, alleys, olive trees, harbors and heritage details as collectible travel posters.",
    category: "Travel Photography",
    family: "heritage_vintage",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "medium_texture",
    styleIntent: "Sunwashed Mediterranean travel art",
  },

  // Modern & graphic
  {
    route: "/scandinavian-poster",
    name: "Scandinavian",
    emoji: "🇸🇪",
    description: "Minimal Nordic poster design with calm palette.",
    bestFor: "Mid-century-modern interior prints, geometric shapes.",
    category: "Modern & graphic",
    family: "modernist_graphic",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "clean",
    styleIntent: "Calm Nordic interior poster",
  },
  {
    route: "/brutalistposter",
    name: "Brutalist",
    emoji: "⬛",
    description: "Raw, typographic brutalist poster look.",
    bestFor: "Editorial covers, heavy type, off-grid layouts.",
    category: "Modern & graphic",
    family: "modernist_graphic",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "flat",
    styleIntent: "Typographic brutalist poster",
  },
  {
    route: "/urbannoir",
    name: "Urban Noir",
    emoji: "🖤",
    description: "Gritty monochrome street-photography look.",
    bestFor: "Rain-slick nights, harsh shadows, cinematic moodboards.",
    category: "Modern & graphic",
    family: "photo_mood",
    visibility: "primary",
    printSuitability: "risky",
    textureProfile: "grain_risky",
    styleIntent: "Cinematic monochrome street mood",
    upscaleNotes:
      "Grain-heavy style. Prefer illustrative contrast over photographic noise for large prints.",
  },
  {
    route: "/minimalism",
    name: "Minimalism",
    emoji: "◻",
    description: "Calm, geometric minimal art.",
    bestFor: "Wall art with negative space and limited palettes.",
    category: "Modern & graphic",
    family: "minimalist",
    visibility: "primary",
    printSuitability: "excellent",
    textureProfile: "flat",
    styleIntent: "Calm geometric minimal art",
    negativePromptHints: ["ornate", "highly detailed", "busy background", "photorealistic texture"],
  },

  // Experimental
  {
    route: "/blend",
    name: "Blend",
    emoji: "✨",
    description: "Combine two styles into a hybrid output.",
    bestFor: "Exploring unexpected style crossovers.",
    category: "Experimental",
    family: "experimental_tool",
    visibility: "primary",
    styleIntent: "Hybrid style explorer",
  },
  {
    route: "/graffiti",
    name: "Graffiti",
    emoji: "🎨",
    description: "Spray-painted street art on urban surfaces.",
    bestFor: "Bold tags, dripping color, stencil portraits.",
    category: "Experimental",
    family: "street_tattoo",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "medium_texture",
    styleIntent: "Spray-painted street art",
  },
  {
    route: "/pulpmagazine",
    name: "Pulp Magazine",
    emoji: "📕",
    description: "1950s pulp-magazine cover art.",
    bestFor: "Lurid sci-fi and crime-fiction cover compositions.",
    category: "Experimental",
    family: "printmaking",
    visibility: "variant",
    variantOf: "/retrocomic",
    printSuitability: "good",
    textureProfile: "heavy_texture",
    styleIntent: "1950s pulp-magazine covers",
  },
  {
    route: "/popart",
    name: "Pop Art",
    emoji: "🎯",
    description: "Saturated pop-art with Ben-Day dots and bold outlines.",
    bestFor: "Punchy graphic portraits and consumer-object icons.",
    category: "Experimental",
    family: "printmaking",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "medium_texture",
    styleIntent: "Saturated pop-art portraits",
  },
  {
    route: "/vintage",
    name: "Vintage",
    emoji: "🍷",
    description: "Aged vintage poster and label art.",
    bestFor: "Apothecary, travel-poster and old-label compositions.",
    category: "Experimental",
    family: "heritage_vintage",
    visibility: "primary",
    printSuitability: "good",
    textureProfile: "medium_texture",
    styleIntent: "Aged vintage posters and labels",
  },
];

export const STYLE_CATEGORIES: StyleCategory[] = [
  "Classic print",
  "Illustration",
  "Modern & graphic",
  "Travel Photography",
  "Experimental",
];

export function getStyleByRoute(route: string): StyleCatalogEntry | undefined {
  return STYLE_CATALOG.find((s) => s.route === route);
}

/**
 * Short label suitable for a UI badge based on a style's texture/print
 * profile. Returns null when no badge is useful.
 */
export function getStyleBadge(entry: StyleCatalogEntry): string | null {
  if (entry.visibility === "variant") return "Variant";
  if (entry.textureProfile === "grain_risky") return "Grain-heavy";
  if (entry.textureProfile === "heavy_texture") return "Textured";
  if (entry.printSuitability === "excellent" && entry.textureProfile === "flat")
    return "Sharp print";
  if (entry.printSuitability === "excellent") return "Large-format friendly";
  return null;
}
