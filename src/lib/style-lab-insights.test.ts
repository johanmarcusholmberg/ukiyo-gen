import { describe, it, expect } from "vitest";
import {
  normalizePrompt,
  aggregateStylePerformance,
  aggregateProviderPerformance,
  aggregateTopPrompts,
  aggregateCollectionPerformance,
  computeQuickInsights,
  type InsightsData,
  type InsightImage,
} from "./style-lab-insights";

const img = (over: Partial<InsightImage>): InsightImage => ({
  id: Math.random().toString(36).slice(2),
  mode: "japanese",
  generation_provider: "gemini",
  generation_model: "gemini-2.5-flash-image",
  prompt: "A red door",
  rating: 0,
  is_favorite: false,
  is_archived: false,
  is_rejected: false,
  created_at: new Date().toISOString(),
  ...over,
});

const mkData = (images: InsightImage[], collections: { id: string; name: string }[] = [], membership: Record<string, string[]> = {}): InsightsData => {
  const m = new Map<string, Set<string>>();
  for (const [imgId, cIds] of Object.entries(membership)) m.set(imgId, new Set(cIds));
  return { images, collections, membership: m };
};

describe("style-lab-insights", () => {
  it("normalizePrompt trims, lowercases, collapses spaces", () => {
    expect(normalizePrompt("  Hello   WORLD  ")).toBe("hello world");
  });

  it("aggregates style performance with best provider above min sample", () => {
    const imgs: InsightImage[] = [
      // 5 gemini @ 5 stars on japanese
      ...Array.from({ length: 5 }, () =>
        img({ mode: "japanese", generation_provider: "gemini", rating: 5, is_favorite: true }),
      ),
      // 5 openai @ 3 stars on japanese
      ...Array.from({ length: 5 }, () =>
        img({ mode: "japanese", generation_provider: "openai", rating: 3, is_rejected: true }),
      ),
    ];
    const rows = aggregateStylePerformance(mkData(imgs));
    const jp = rows.find((r) => r.mode === "japanese")!;
    expect(jp.total).toBe(10);
    expect(jp.favoriteCount).toBe(5);
    expect(jp.rejectCount).toBe(5);
    expect(jp.rejectRate).toBe(0.5);
    expect(jp.bestProvider).toBe("gemini");
    expect(jp.bestProviderAvg).toBe(5);
  });

  it("groups providers by style", () => {
    const imgs = [
      img({ mode: "vintage", generation_provider: "gemini", rating: 4 }),
      img({ mode: "vintage", generation_provider: "gemini", rating: 5 }),
      img({ mode: "vintage", generation_provider: "openai", rating: 2 }),
    ];
    const rows = aggregateProviderPerformance(mkData(imgs));
    const gem = rows.find((r) => r.mode === "vintage" && r.provider === "gemini")!;
    expect(gem.total).toBe(2);
    expect(gem.avgRating).toBe(4.5);
  });

  it("normalizes prompts and enforces minimum occurrences", () => {
    const imgs = [
      img({ prompt: "A weathered green door", rating: 5 }),
      img({ prompt: "a weathered green door  ", rating: 4 }),
      img({ prompt: "A WEATHERED GREEN DOOR", rating: 3 }),
      img({ prompt: "Once only" }),
    ];
    const rows = aggregateTopPrompts(mkData(imgs), 3);
    expect(rows).toHaveLength(1);
    expect(rows[0].times).toBe(3);
    expect(rows[0].avgRating).toBe(4);
  });

  it("collection performance counts members and skips empty", () => {
    const a = img({ id: "a", rating: 5, is_favorite: true });
    const b = img({ id: "b", rating: 3 });
    const data = mkData([a, b], [{ id: "c1", name: "Doors" }, { id: "c2", name: "Empty" }], { a: ["c1"], b: ["c1"] });
    const rows = aggregateCollectionPerformance(data);
    const doors = rows.find((r) => r.id === "c1")!;
    expect(doors.total).toBe(2);
    expect(doors.avgRating).toBe(4);
    expect(doors.favoriteCount).toBe(1);
    expect(rows.find((r) => r.id === "c2")!.total).toBe(0);
  });

  it("computes quick insights highlights", () => {
    const imgs = [
      ...Array.from({ length: 5 }, () => img({ mode: "vintage", rating: 5, generation_provider: "gemini" })),
      ...Array.from({ length: 6 }, () => img({ mode: "japanese", rating: 3, generation_provider: "openai" })),
    ];
    const q = computeQuickInsights(mkData(imgs));
    expect(q.highestRatedStyle?.mode).toBe("vintage");
    expect(q.mostGeneratedStyle?.mode).toBe("japanese");
    expect(q.bestProviderOverall?.provider).toBe("gemini");
  });
});
