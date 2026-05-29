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
import type { EnhanceResult, ImageEngine } from "./types";

/** Gamma > 1 brightens shadows/midtones. */
const GAMMA = 1.5;
/** Light blur radius (px) — masks luminance noise without obliterating detail. */
const BLUR_PX = 1.2;
/** JPEG re-encode quality for the result blob. */
const JPEG_QUALITY = 0.92;

/** Intrinsic pixel dimensions of a decoded source. */
function sourceDimensions(source: HTMLImageElement | ImageBitmap): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas could not encode the enhanced image."));
        }
      },
      mimeType,
      mimeType === "image/jpeg" ? JPEG_QUALITY : undefined,
    );
  });
}

export const localEngine: ImageEngine = {
  id: "local",
  async enhance(source, opts): Promise<EnhanceResult> {
    const { width, height } = sourceDimensions(source);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Your browser could not create a canvas to process the image.");
    }

    // 1. Native (GPU-backed) Gaussian blur applied while drawing the source.
    ctx.filter = `blur(${String(BLUR_PX)}px)`;
    ctx.drawImage(source, 0, 0, width, height);
    ctx.filter = "none";

    // 2. Gamma lift via a single linear LUT pass over RGB (alpha untouched).
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const lut = buildGammaLut(GAMMA);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = lut[data[i]];
      data[i + 1] = lut[data[i + 1]];
      data[i + 2] = lut[data[i + 2]];
    }
    ctx.putImageData(imageData, 0, 0);

    const blob = await canvasToBlob(canvas, opts.mimeType);
    return { blob, width, height, mimeType: opts.mimeType };
  },
};
