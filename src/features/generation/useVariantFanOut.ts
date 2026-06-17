/**
 * useVariantFanOut — generate N variants in parallel through the
 * existing generation router. No router/provider/prompt changes.
 *
 * Each "tile" holds independent state so per-tile retries and discards
 * never affect siblings. Failures inside one tile do not throw out of
 * `start()` — they are captured into that tile's error.
 */
import { useCallback, useRef, useState } from "react";
import { generateImage } from "@/lib/generation-router";
import { supportsDeterministicSeedReplay } from "@/lib/provider-print-sizing";
import type {
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
} from "@/lib/generation-types";

export type VariantStatus = "idle" | "loading" | "done" | "error";

export interface VariantTile {
  id: number;
  status: VariantStatus;
  response?: NormalizedGenerationResponse;
  error?: string;
}

/** Outcome of a `keepAtPrintResolution` attempt. */
export interface KeepAtPrintResolutionResult {
  /** The asset the caller should save. Always present on success. */
  response: NormalizedGenerationResponse;
  /** True when a second generation actually ran (deterministic replay path). */
  regenerated: boolean;
  /**
   * When `regenerated` is false, the reason — surfaced so callers can
   * decide whether to show a "kept preview-sized asset" hint.
   */
  reason?: "no-replay-support" | "no-modelid" | "tile-not-done";
}

export interface UseVariantFanOutResult {
  tiles: VariantTile[];
  isRunning: boolean;
  start: (req: NormalizedGenerationRequest) => Promise<void>;
  retryOne: (id: number) => Promise<void>;
  discard: (id: number) => void;
  discardAll: () => void;
  /**
   * Keep variant `id`; if (and only if) the resolved model supports
   * deterministic seed replay, re-run that variant at `sizeIntent: "print"`
   * and return the higher-res asset. Otherwise return the existing
   * preview-sized asset unchanged so we never swap the user's chosen
   * image for a different-looking regeneration.
   */
  keepAtPrintResolution: (id: number) => Promise<KeepAtPrintResolutionResult | null>;
}

export function useVariantFanOut(count = 4): UseVariantFanOutResult {
  const makeIdle = useCallback(
    (): VariantTile[] =>
      Array.from({ length: count }, (_, i) => ({ id: i, status: "idle" as const })),
    [count],
  );

  const [tiles, setTiles] = useState<VariantTile[]>(makeIdle);
  const [isRunning, setIsRunning] = useState(false);
  const reqRef = useRef<NormalizedGenerationRequest | null>(null);

  const runOne = useCallback(async (id: number, req: NormalizedGenerationRequest) => {
    setTiles((cur) =>
      cur.map((t) =>
        t.id === id ? { ...t, status: "loading", error: undefined, response: undefined } : t,
      ),
    );
    try {
      const { response } = await generateImage(req);
      setTiles((cur) =>
        cur.map((t) => (t.id === id ? { ...t, status: "done", response } : t)),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTiles((cur) =>
        cur.map((t) => (t.id === id ? { ...t, status: "error", error: msg } : t)),
      );
    }
  }, []);

  const start = useCallback(
    async (req: NormalizedGenerationRequest) => {
      reqRef.current = req;
      setIsRunning(true);
      setTiles(
        Array.from({ length: count }, (_, i) => ({ id: i, status: "loading" as const })),
      );
      try {
        await Promise.allSettled(
          Array.from({ length: count }, (_, i) => runOne(i, req)),
        );
      } finally {
        setIsRunning(false);
      }
    },
    [count, runOne],
  );

  const retryOne = useCallback(
    async (id: number) => {
      if (!reqRef.current) return;
      await runOne(id, reqRef.current);
    },
    [runOne],
  );

  const discard = useCallback((id: number) => {
    setTiles((cur) =>
      cur.map((t) =>
        t.id === id ? { id, status: "idle" as const } : t,
      ),
    );
  }, []);

  const discardAll = useCallback(() => {
    reqRef.current = null;
    setTiles(makeIdle());
  }, [makeIdle]);

  const keepAtPrintResolution = useCallback(
    async (id: number): Promise<KeepAtPrintResolutionResult | null> => {
      const tile = tiles.find((t) => t.id === id);
      if (!tile || tile.status !== "done" || !tile.response) {
        return null;
      }
      const baseReq = reqRef.current;
      const modelId =
        tile.response.resolvedModelId ??
        tile.response.requestedModelId ??
        baseReq?.modelId;

      if (!baseReq) {
        return { response: tile.response, regenerated: false, reason: "tile-not-done" };
      }
      if (!modelId) {
        return { response: tile.response, regenerated: false, reason: "no-modelid" };
      }
      if (!supportsDeterministicSeedReplay(modelId)) {
        return {
          response: tile.response,
          regenerated: false,
          reason: "no-replay-support",
        };
      }

      // Deterministic replay path: re-run at print intent so the asset
      // we save is higher-res but visually identical.
      const replayReq: NormalizedGenerationRequest = {
        ...baseReq,
        sizeIntent: "print",
      };
      const { response } = await generateImage(replayReq);
      return { response, regenerated: true };
    },
    [tiles],
  );

  return {
    tiles,
    isRunning,
    start,
    retryOne,
    discard,
    discardAll,
    keepAtPrintResolution,
  };
}
