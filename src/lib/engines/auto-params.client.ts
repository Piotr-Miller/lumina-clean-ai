/**
 * Browser-only pixel sampler for the Auto-parameter engine (S-12).
 *
 * Thin DOM wrapper: downscales the decoded source into an offscreen canvas
 * (longest edge ≤ 512 px) and extracts pixels for the pure `computeLumaStats`
 * core. Deliberately trivial — all tested logic lives in `auto-params.ts`; this
 * file is the untested DOM seam (parity verified manually, see plan Phase 2).
 */
import { computeLumaStats } from "./auto-params";
import type { LumaStats } from "./types";

/** Longest-edge cap for the analysis downscale — sub-ms `getImageData`. */
const SAMPLE_MAX_EDGE = 512;

function sourceDimensions(source: HTMLImageElement | ImageBitmap): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

/**
 * Sample the source's luma distribution from a ≤512 px downscale.
 *
 * @throws Error if a 2D canvas context can't be created.
 */
export function sampleImageLuma(source: HTMLImageElement | ImageBitmap): LumaStats {
  const { width, height } = sourceDimensions(source);
  const scale = Math.min(1, SAMPLE_MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Your browser could not create a canvas to analyze the image.");
  }
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return computeLumaStats(data);
}
