/**
 * Deterministic Auto-parameter engine for LuminaClean (S-12).
 *
 * Pure, DOM-free core: turns raw pixel data into luma statistics
 * (`computeLumaStats`) and maps those to recommended per-engine parameters
 * (`recommendParams`). No ML, no vision model — a target-median gamma curve
 * with highlight protection (the established auto-tone approach), plus a
 * conservative secondary blur add-on for Local. The single source of truth for
 * slider/validator bounds is `PARAM_RANGES`.
 *
 * DOM-free by design so it's unit-testable under vitest's `node` environment
 * (the browser-only pixel sampler lives in `auto-params.client.ts`).
 *
 * Unit-tested in `tests/auto-params.test.ts`.
 */
import type { BreadParams, LocalParams, LumaStats } from "./types";

/** Per-engine, per-parameter slider/validator bounds + Auto-less default. */
export const PARAM_RANGES = {
  local: {
    gamma: { min: 1.0, max: 1.8, step: 0.05, default: 1.5 },
    blur: { min: 0.0, max: 2.0, step: 0.1, default: 1.2 },
  },
  cloud: {
    gamma: { min: 1.0, max: 1.5, step: 0.05, default: 1.2 },
    strength: { min: 0.0, max: 0.2, step: 0.05, default: 0.2 },
  },
} as const;

/** Rec.709 luma coefficients (correct for sRGB). */
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/** Luma thresholds (normalized [0,1]). */
const SHADOW_T = 0.18; // Y < 0.18 → deep shadow
const HIGHLIGHT_T = 0.9; // Y > 0.90 → highlight
const CLIP_T = 0.98; // Y > 0.98 → near-clipped

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Compute luma statistics from an RGBA pixel buffer. Pure: array in → object
 * out. Builds a 256-bin histogram of Rec.709 luma; percentiles are nearest-rank
 * (smallest bin whose cumulative fraction ≥ q).
 *
 * @throws RangeError if `pixels` is empty or its length is not a multiple of 4.
 */
export function computeLumaStats(pixels: Uint8ClampedArray): LumaStats {
  if (pixels.length === 0 || pixels.length % 4 !== 0) {
    throw new RangeError(`pixels length ${String(pixels.length)} must be a positive multiple of 4 (RGBA).`);
  }

  const hist = new Float64Array(256);
  const total = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    const y = LUMA_R * pixels[i] + LUMA_G * pixels[i + 1] + LUMA_B * pixels[i + 2];
    const bin = clamp(Math.round(y), 0, 255);
    hist[bin] += 1;
  }

  let mean = 0;
  let shadow = 0;
  let highlight = 0;
  let clip = 0;
  for (let bin = 0; bin < 256; bin++) {
    const count = hist[bin];
    if (count === 0) continue;
    const value = bin / 255;
    mean += value * count;
    if (value < SHADOW_T) shadow += count;
    if (value > HIGHLIGHT_T) highlight += count;
    if (value > CLIP_T) clip += count;
  }
  mean /= total;

  const percentile = (q: number): number => {
    const target = q * total;
    let cum = 0;
    for (let bin = 0; bin < 256; bin++) {
      cum += hist[bin];
      if (cum >= target) return bin / 255;
    }
    return 1;
  };

  return {
    mean,
    p05: percentile(0.05),
    p25: percentile(0.25),
    p50: percentile(0.5),
    p75: percentile(0.75),
    p95: percentile(0.95),
    p99: percentile(0.99),
    shadowRatio: shadow / total,
    highlightRatio: highlight / total,
    clipRatio: clip / total,
  };
}

/**
 * Core gamma decision shared by both engines (before per-engine clamp):
 * a target-median curve with highlight protection. Returns an unclamped gamma.
 */
function baseGamma(stats: LumaStats): number {
  const targetMedian = stats.shadowRatio > 0.65 && stats.p95 < 0.65 ? 0.26 : 0.3;
  let gamma = Math.log(Math.max(stats.p50, 0.03)) / Math.log(targetMedian);
  // Highlight guards: pull gamma down when the image already has bright tones.
  if (stats.p95 > 0.85) gamma *= 0.8;
  if (stats.clipRatio > 0.005) gamma = Math.min(gamma, 1.1);
  return gamma;
}

/**
 * Conservative secondary blur add-on for Local — a darkness proxy that must
 * never dominate the gamma decision. Piecewise on `p50`, capped low when
 * highlights are strong, with a small bump for very high gamma, clamped to a
 * conservative ceiling (≤0.7) for the Auto recommendation. The slider range
 * (`PARAM_RANGES.local.blur`) stays wider so the user can push higher manually.
 */
function recommendBlur(stats: LumaStats, gamma: number): number {
  let blur: number;
  if (stats.p50 >= 0.3) {
    blur = 0.05; // already-bright
  } else if (stats.p50 >= 0.12) {
    blur = 0.2; // moderate night
  } else if (stats.p50 >= 0.06) {
    blur = 0.4; // dark
  } else {
    blur = 0.6; // very-dark
  }
  // Highlight-heavy inputs get minimal blur regardless of median.
  if (stats.p95 > 0.85) blur = Math.min(blur, 0.1);
  // Small bump when the gamma lift is strong.
  if (gamma >= 1.6) blur += 0.1;
  return clamp(blur, 0.0, 0.7);
}

export function recommendParams(stats: LumaStats, engine: "local"): LocalParams;
export function recommendParams(stats: LumaStats, engine: "cloud"): BreadParams;
export function recommendParams(stats: LumaStats, engine: "local" | "cloud"): LocalParams | BreadParams {
  const g = baseGamma(stats);

  if (engine === "local") {
    const gamma = clamp(g, PARAM_RANGES.local.gamma.min, PARAM_RANGES.local.gamma.max);
    return { gamma, blur: recommendBlur(stats, gamma) };
  }

  // Cloud / Bread.
  let gamma = clamp(g, PARAM_RANGES.cloud.gamma.min, PARAM_RANGES.cloud.gamma.max);
  let strength = clamp(0.05 + 0.15 * clamp((0.3 - stats.p50) / 0.3, 0, 1), 0.0, 0.2);
  if (stats.p95 > 0.85) strength *= 0.7;
  if (stats.clipRatio > 0.005) {
    strength = Math.min(strength, 0.1);
    gamma = Math.min(gamma, 1.1);
  }
  return { gamma, strength, provisional: true };
}
