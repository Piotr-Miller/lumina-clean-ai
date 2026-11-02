/**
 * S-19 Phase 4 exposure curve (plan Phase 4; constants: configs/curve.json, owner decision
 * 2026-11-02). Side-effect free, so local-arms.ts and the tests share one definition.
 *
 * The curve keeps Local's exposure intent, its Auto gamma g, and limits the lift where Local
 * overdoes it: dark tones get only λ0 of the gamma lift, rising smoothly to the full lift at the
 * median, and the lift fades by h above p95. Per channel, like the app's gamma LUT:
 *
 *   y(x) = x + λ(x)·(x^(1/g) − x)
 *   λ(x) = [λ0 + (1 − λ0)·S(p05, p50, x)] · [1 − h·S(p95, 1, x)]
 *
 * S is smoothstep. p05, p50 and p95 come from the input's LumaStats, so the curve is a pure
 * function of those statistics and the fixed constants; nothing is chosen per photo.
 */
import type { LumaStats } from "../../src/lib/engines/types";

export interface CurveConfig {
  name: string;
  lambda0: number;
  highlight_fade: number;
}

function smoothstep(a: number, b: number, x: number): number {
  if (b <= a) return x >= b ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The curve at x ∈ [0, 1]. */
export function curve(x: number, gamma: number, stats: LumaStats, cfg: CurveConfig): number {
  const lift = Math.pow(x, 1 / gamma) - x;
  const toe = cfg.lambda0 + (1 - cfg.lambda0) * smoothstep(stats.p05, stats.p50, x);
  const shoulder = 1 - cfg.highlight_fade * smoothstep(stats.p95, 1, x);
  return x + toe * shoulder * lift;
}

/** 8-bit lookup table, rounded like the app's `buildGammaLut`. */
export function buildCurveLut(gamma: number, stats: LumaStats, cfg: CurveConfig): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * curve(i / 255, gamma, stats, cfg));
  return lut;
}
