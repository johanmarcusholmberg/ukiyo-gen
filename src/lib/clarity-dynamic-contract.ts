/**
 * Shared contract for the Clarity dynamic upscale request.
 *
 * Mirrors the validation block in
 * `supabase/functions/upscale-image/index.ts` (look for the
 * "CLARITY DYNAMIC CONTRACT" header). Keep both in sync — the test
 * `clarity-dynamic-contract.test.ts` is the authoritative spec.
 *
 * Used by `useUpscale` to assemble the request body and by tests to
 * verify the edge function will accept it.
 */

export type ClarityDynamicFlow = "target_300" | "manual";

export interface ClarityDynamicRequestBody {
  imageUrl: string;
  mode: "clarity_dynamic";
  upscaleFlow: ClarityDynamicFlow;
  upscaleFamily: "clarity";
  requestedScale: number;
  /** Passthrough — Clarity Upscaler input field. Always equal to requestedScale. */
  scale_factor: number;
  sourceWasCorrectedMaster: true;
  posterFormatId: string;
  galleryImageId?: string;
  recipe?: { id?: string; label?: string; reason?: string };
  metadata?: Record<string, unknown>;
}

export const CLARITY_DYNAMIC_MIN_SCALE_EXCLUSIVE = 1;
export const CLARITY_DYNAMIC_MAX_SCALE_INCLUSIVE = 8;

/**
 * Pure validator. Returns null when the payload satisfies the contract
 * or a human-readable reason string otherwise. The edge function returns
 * 400 on a non-null reason — there is no silent fallback.
 */
export function validateClarityDynamicPayload(
  body: unknown,
): string | null {
  if (!body || typeof body !== "object") return "Body must be an object.";
  const b = body as Record<string, unknown>;
  if (b.mode !== "clarity_dynamic") return "mode must be 'clarity_dynamic'.";
  if (typeof b.imageUrl !== "string" || b.imageUrl.length === 0)
    return "imageUrl is required.";
  if (b.upscaleFamily !== "clarity") return "upscaleFamily must be 'clarity'.";
  if (b.upscaleFlow !== "target_300" && b.upscaleFlow !== "manual")
    return "upscaleFlow must be 'target_300' or 'manual'.";
  const scale =
    typeof b.requestedScale === "number"
      ? b.requestedScale
      : typeof b.scale_factor === "number"
        ? b.scale_factor
        : NaN;
  if (
    !Number.isFinite(scale) ||
    scale <= CLARITY_DYNAMIC_MIN_SCALE_EXCLUSIVE ||
    scale > CLARITY_DYNAMIC_MAX_SCALE_INCLUSIVE
  )
    return `requestedScale must be in (${CLARITY_DYNAMIC_MIN_SCALE_EXCLUSIVE}, ${CLARITY_DYNAMIC_MAX_SCALE_INCLUSIVE}].`;
  if (b.sourceWasCorrectedMaster !== true)
    return "sourceWasCorrectedMaster must be true.";
  if (typeof b.posterFormatId !== "string" || b.posterFormatId.length === 0)
    return "posterFormatId is required.";
  return null;
}
