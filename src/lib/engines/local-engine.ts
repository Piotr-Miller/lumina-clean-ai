/**
 * Local (client-side) photo-enhancement engine.
 *
 * A deliberately-naive pass: a light native Gaussian blur to mask noise plus a
 * gamma LUT to lift shadows. Runs full-resolution on the main thread (Web
 * Workers are an MVP non-goal). The visible quality gap to the Cloud engine is
 * intentional — Local is the free taste, Cloud is the upgrade.
 *
 * DOM-dependent; not imported by the unit tests (those cover `image-helpers`).
 */
import { buildGammaLut } from "./image-helpers";
import { canvasToBlob, JPEG_QUALITY } from "./canvas-helpers";
import type { EnhanceResult, ImageEngine } from "./types";

/** Default gamma (> 1 brightens shadows/midtones) when the caller passes none. */
const GAMMA_DEFAULT = 1.5;
/** Default blur radius (px) — masks luminance noise without obliterating detail. */
const BLUR_PX_DEFAULT = 1.2;

/** Intrinsic pixel dimensions of a decoded source. */
function sourceDimensions(source: HTMLImageElement | ImageBitmap): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

export const localEngine: ImageEngine = {
  id: "local",
  async enhance(source, opts): Promise<EnhanceResult> {
    const { width, height } = sourceDimensions(source);
    // Per-call params (S-12 parameter panel); fall back to today's constants.
    const gamma = opts.gamma ?? GAMMA_DEFAULT;
    const blurPx = opts.blur ?? BLUR_PX_DEFAULT;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Your browser could not create a canvas to process the image.");
    }

    // 1. Native (GPU-backed) Gaussian blur applied while drawing the source.
    ctx.filter = `blur(${String(blurPx)}px)`;
    ctx.drawImage(source, 0, 0, width, height);
    ctx.filter = "none";

    // 2. Gamma lift via a single linear LUT pass over RGB (alpha untouched).
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const lut = buildGammaLut(gamma);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = lut[data[i]];
      data[i + 1] = lut[data[i + 1]];
      data[i + 2] = lut[data[i + 2]];
    }
    ctx.putImageData(imageData, 0, 0);

    const blob = await canvasToBlob(canvas, opts.mimeType, opts.mimeType === "image/jpeg" ? JPEG_QUALITY : undefined);
    return { blob, width, height, mimeType: opts.mimeType };
  },
};
