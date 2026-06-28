/**
 * Pure helpers for the parameter panel (S-12) — DOM-free so they're unit-tested
 * under vitest's `node` environment. Keep all panel value math here.
 */
import type { LocalParams, BreadParams } from "@/lib/engines/types";

/** Slider range descriptor (a slice of `PARAM_RANGES`). */
export interface ParamRange {
  min: number;
  max: number;
  step: number;
  default: number;
}

/** Clamp a raw slider value into its range (defensive; Radix also clamps). */
export function clampParamValue(value: number, range: Pick<ParamRange, "min" | "max">): number {
  if (!Number.isFinite(value)) return range.min;
  return Math.min(Math.max(value, range.min), range.max);
}

/**
 * Format a parameter value for display, with decimals inferred from the step:
 * step ≥ 0.1 → 1 decimal (e.g. blur 1.2); finer steps → 2 decimals (gamma 1.05).
 */
export function formatParamValue(value: number, step: number): string {
  const decimals = step >= 0.1 ? 1 : 2;
  return value.toFixed(decimals);
}

/** Parameter keys, per engine — the panel iterates these. */
export type LocalParamKey = keyof LocalParams;
export type BreadParamKey = "gamma" | "strength";
export type ParamKey = LocalParamKey | BreadParamKey;

/** Return a new override set with `key` added (immutable; never mutates input). */
export function withOverride<K extends string>(prev: ReadonlySet<K>, key: K): Set<K> {
  const next = new Set(prev);
  next.add(key);
  return next;
}

/** Type guard: does a params object carry Bread's `provisional` flag? */
export function isBreadParams(params: LocalParams | BreadParams): params is BreadParams {
  return "strength" in params;
}
