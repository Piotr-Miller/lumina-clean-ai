/**
 * Bread (Replicate) input mapping — a pure, dependency-free module.
 *
 * Shared verbatim across the Deno boundary: imported by both the Astro app /
 * Vitest (`@/lib/services/bread`) and the Supabase Edge Function (relative path
 * or `deno.json` import map). Keep it free of `@/` imports and of any
 * npm-/Deno-specific API so it resolves cleanly in every context (lesson #4 —
 * no `astro:env`, no Deno globals).
 *
 * The version hash and the gamma/strength defaults are locked by the Phase-0
 * spike (`context/changes/cloud-ai-realtime-result/spike-findings.md`).
 */

/** Pinned `mingcv/bread` model version. Bump reviewably via `npm run resolve:bread-version` — never hand-edit to follow "latest". */
export const BREAD_VERSION = "057a4e073829a8c50f2622206f71a8ed25331cd07a520bc264469389c7c11e54";

/** Default brightening gamma (≤1.5). Phase-0 default. */
export const BREAD_GAMMA = 1.2;

/** Default denoise strength (≤0.2). Phase-0 default. */
export const BREAD_STRENGTH = 0.2;

/** Shape of Bread's prediction `input` object. */
export interface BreadInput {
  image: string;
  gamma: number;
  strength: number;
}

/**
 * Map a fetchable source image URL to Bread's prediction input. `imageUrl` is a
 * short-TTL signed READ URL for the private source object (Replicate fetches it
 * directly). Per-job `overrides` (S-12: the user's panel choices, persisted on
 * the `jobs` row) take precedence; an absent/undefined override falls back to
 * the locked Phase-0 default. Bounds are already enforced upstream (zod on
 * create-job), so this module just maps — it does not re-clamp.
 */
export function buildBreadInput(imageUrl: string, overrides?: { gamma?: number; strength?: number }): BreadInput {
  return {
    image: imageUrl,
    gamma: overrides?.gamma ?? BREAD_GAMMA,
    strength: overrides?.strength ?? BREAD_STRENGTH,
  };
}
