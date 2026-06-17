/**
 * Build an audit-friendly metadata payload describing an upscale-routing
 * decision (recommended vs selected mode, target, required scale, etc.).
 *
 * Pure helper — no I/O. Intended to be embedded into an existing
 * `asset_cost_events.metadata` row written via `recordAssetCostEvent`
 * so we can answer "why was mode X used?" without schema changes.
 *
 * Cost totals are unaffected: callers should record this event with
 * `estimatedCost: null`, since the actual upscale cost is captured
 * separately (sync by webhook, async by direct provider call) and we do
 * NOT want to double-count.
 */
import {
  recommendPrintUpscaleRoute,
  assessSelectedMode,
  type PrintUpscaleRoutingInput,
} from "@/lib/print-upscale-routing";
import { UPSCALE_MODES, type UpscaleMode } from "@/lib/upscale-modes";

export interface UpscaleRoutingMetadata {
  sourceWidth: number | null;
  sourceHeight: number | null;
  targetWidth: number | null;
  targetHeight: number | null;
  posterFormatId: string | null;
  requiredScale: number | null;
  recommendedMode: UpscaleMode | null;
  selectedMode: UpscaleMode;
  matchedRecommendation: boolean;
  manualOverride: boolean;
  alreadyUpscaled: boolean;
  routingReason: string;
  routingWarning: string | null;
  selectedClearsTarget: boolean | null;
  selectedWarning: string | null;
  expectedOutput: { width: number; height: number } | null;
}

export function buildUpscaleRoutingMetadata(
  input: PrintUpscaleRoutingInput,
  selectedMode: UpscaleMode,
): UpscaleRoutingMetadata {
  const routing = recommendPrintUpscaleRoute(input);
  const assessed = assessSelectedMode(input, selectedMode);
  const cfg = UPSCALE_MODES[selectedMode];

  const recommended = routing.recommendedMode;
  // "manual override" = the user picked something different from the
  // routing recommendation. Only meaningful when routing actually had
  // input enough to recommend a mode.
  const matchedRecommendation =
    recommended != null && recommended === selectedMode;
  const manualOverride = recommended != null && recommended !== selectedMode;

  const expectedOutput =
    assessed.expectedOutput ??
    (input.sourceWidth && input.sourceHeight && cfg
      ? {
          width: Math.round(input.sourceWidth * cfg.scaleFactor),
          height: Math.round(input.sourceHeight * cfg.scaleFactor),
        }
      : null);

  return {
    sourceWidth: input.sourceWidth ?? null,
    sourceHeight: input.sourceHeight ?? null,
    targetWidth: routing.target?.width ?? null,
    targetHeight: routing.target?.height ?? null,
    posterFormatId: input.posterFormatId ?? null,
    requiredScale: routing.requiredScale,
    recommendedMode: recommended,
    selectedMode,
    matchedRecommendation,
    manualOverride,
    alreadyUpscaled: !!input.alreadyUpscaled,
    routingReason: routing.reason,
    routingWarning: routing.warning,
    selectedClearsTarget: routing.target ? assessed.clearsTarget : null,
    selectedWarning: assessed.warning,
    expectedOutput,
  };
}
