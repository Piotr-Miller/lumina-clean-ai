import { clamp } from "./clamp.js";

export const RATE_LIMIT_MAX = 100;

/** Whether the caller has reached the per-window cap. */
export function isRateLimited(count: number): boolean {
  return clamp(count, 0, RATE_LIMIT_MAX) >= RATE_LIMIT_MAX;
}
