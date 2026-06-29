/**
 * Engine seam for LuminaClean's photo enhancement.
 *
 * A light Strategy interface for synchronous, Blob-returning enhancement.
 * S-01 ships the client-side Local engine through this contract; S-03 keeps
 * `EngineId` shared but forks Cloud into submit-then-wait orchestration.
 */

/** Engine identity. Local ships in S-01; "cloud" is reserved for S-03. */
export type EngineId = "local" | "cloud";

/**
 * Luma distribution of a (downscaled) image, in normalized [0,1] space.
 * Produced by `computeLumaStats` (S-12 auto-params) and consumed by
 * `recommendParams`. Percentiles are nearest-rank over a 256-bin histogram.
 */
export interface LumaStats {
  /** Mean luma. */
  mean: number;
  /** 5th percentile luma. */
  p05: number;
  /** 25th percentile luma. */
  p25: number;
  /** Median luma. */
  p50: number;
  /** 75th percentile luma. */
  p75: number;
  /** 95th percentile luma. */
  p95: number;
  /** 99th percentile luma. */
  p99: number;
  /** Fraction of pixels with luma < 0.18 (deep shadow). */
  shadowRatio: number;
  /** Fraction of pixels with luma > 0.90 (highlights). */
  highlightRatio: number;
  /** Fraction of pixels with luma > 0.98 (near-clipped). */
  clipRatio: number;
}

/** Recommended/active Local engine parameters. */
export interface LocalParams {
  /** Gamma lift (1.0 = no lift). */
  gamma: number;
  /** Gaussian blur radius in px. */
  blur: number;
}

/** Recommended/active Cloud (Bread) engine parameters. */
export interface BreadParams {
  /** Gamma passed to Bread (model ceiling 1.5). */
  gamma: number;
  /** Bread denoise strength (model ceiling 0.2). */
  strength: number;
  /**
   * Set by Auto for Cloud: bright-input behavior is unvalidated against the
   * real model, so the recommendation is provisional (see plan §"What We're
   * NOT Doing"). Absent/false for user-set values.
   */
  provisional?: boolean;
}

/** Output of an enhancement pass. The blob is the full-resolution result. */
export interface EnhanceResult {
  blob: Blob;
  width: number;
  height: number;
  /** MIME type of `blob` — preserved from the source (JPG→JPG, PNG→PNG). */
  mimeType: string;
}

/**
 * A photo-enhancement strategy. The caller decodes the source into an
 * `HTMLImageElement` / `ImageBitmap` and is responsible for validating it
 * (format, size, and `MAX_IMAGE_DIMENSION`) before calling `enhance`.
 */
export interface ImageEngine {
  id: EngineId;
  enhance(
    source: HTMLImageElement | ImageBitmap,
    opts: { mimeType: string; gamma?: number; blur?: number },
  ): Promise<EnhanceResult>;
}
