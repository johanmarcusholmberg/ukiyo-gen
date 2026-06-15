/**
 * VariantGrid — 2×2 picker for the variant fan-out.
 *
 * Pure presentation: receives tiles + callbacks. Keeps state ownership
 * inside ImageGenerator. Each tile shows a skeleton, the generated
 * image, or an error with retry. Per-tile "Keep" hands the response
 * back to the parent which runs the existing save path.
 */
import { Loader2, RefreshCcw, Check, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VariantTile } from "./useVariantFanOut";
import type { NormalizedGenerationResponse } from "@/lib/generation-types";

export interface VariantGridProps {
  tiles: VariantTile[];
  busy?: boolean;
  onKeep: (tile: VariantTile, response: NormalizedGenerationResponse) => void | Promise<void>;
  onDiscard: (tileId: number) => void;
  onRetry: (tileId: number) => void;
  onDiscardAll: () => void;
  savedTileIds?: ReadonlySet<number>;
  savingTileId?: number | null;
}

export default function VariantGrid({
  tiles,
  busy,
  onKeep,
  onDiscard,
  onRetry,
  onDiscardAll,
  savedTileIds,
  savingTileId,
}: VariantGridProps) {
  const hasAny = tiles.some((t) => t.status !== "idle");
  if (!hasAny) return null;

  return (
    <section className="space-y-2" aria-label="Generated variants">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-foreground">
          Variants {busy ? "(generating…)" : "(pick the best)"}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDiscardAll}
          disabled={busy}
          className="font-display text-[11px] h-7"
        >
          Discard all
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <VariantTileCard
            key={tile.id}
            tile={tile}
            onKeep={onKeep}
            onDiscard={onDiscard}
            onRetry={onRetry}
            saved={!!savedTileIds?.has(tile.id)}
            saving={savingTileId === tile.id}
          />
        ))}
      </div>
    </section>
  );
}

function VariantTileCard({
  tile,
  onKeep,
  onDiscard,
  onRetry,
  saved,
  saving,
}: {
  tile: VariantTile;
  onKeep: VariantGridProps["onKeep"];
  onDiscard: VariantGridProps["onDiscard"];
  onRetry: VariantGridProps["onRetry"];
  saved: boolean;
  saving: boolean;
}) {
  const r = tile.response;
  return (
    <div
      className={cn(
        "relative rounded-sm border border-border bg-card overflow-hidden flex flex-col",
        "aspect-square",
      )}
    >
      <div className="relative flex-1 min-h-0 bg-muted/30 flex items-center justify-center">
        {tile.status === "loading" && (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        )}
        {tile.status === "error" && (
          <div className="p-3 text-center space-y-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto" />
            <p className="font-display text-[11px] text-muted-foreground line-clamp-3">
              {tile.error || "Generation failed"}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="font-display text-[11px] h-7"
              onClick={() => onRetry(tile.id)}
            >
              <RefreshCcw className="h-3 w-3 mr-1" /> Retry
            </Button>
          </div>
        )}
        {tile.status === "done" && r && (
          <img
            src={r.imageUrl}
            alt={`Variant ${tile.id + 1}`}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {tile.status === "idle" && (
          <span className="font-display text-[11px] text-muted-foreground">
            Variant {tile.id + 1}
          </span>
        )}
      </div>

      {tile.status === "done" && r && (
        <div className="p-2 flex items-center justify-between gap-2 border-t border-border/60">
          <span className="font-display text-[10px] text-muted-foreground truncate">
            {r.generationProvider}
            {r.width && r.height ? ` · ${r.width}×${r.height}` : ""}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="font-display text-[11px] h-7 px-2"
              onClick={() => onDiscard(tile.id)}
              disabled={saving}
              title="Discard this variant"
            >
              <X className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              className="font-display text-[11px] h-7 px-2"
              onClick={() => onKeep(tile, r)}
              disabled={saved || saving}
              title={saved ? "Saved" : "Keep this variant"}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3 mr-1" />
              )}
              {saved ? "Saved" : "Keep"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
