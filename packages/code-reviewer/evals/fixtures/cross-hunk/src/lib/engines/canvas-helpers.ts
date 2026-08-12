// Canvas re-encode helpers.
//
// The point of this module is to single-source the JPEG re-encode quality so
// the Canvas paths can't silently drift apart. Every path that re-encodes
// MUST go through the shared constant below — a literal quality argument
// anywhere in this file is a bug, not a tuning knob.

/**
 * Shared JPEG re-encode quality for every Canvas path in the app.
 *
 * Chosen in the S-02 quality review: below 0.9 the denoise post-pass starts
 * amplifying block artifacts in flat shadow regions, which is exactly the
 * defect the product exists to remove.
 */
export const JPEG_QUALITY = 0.92;

export interface FlattenOptions {
  /** Colour painted under the source before re-encoding. */
  background?: string;
}

/**
 * Flattens an RGBA bitmap onto an opaque background and re-encodes it at the
 * shared {@link JPEG_QUALITY}, because the cloud model rejects 4-channel
 * input.
 */
export function flattenToRgbJpeg(canvas: HTMLCanvasElement, options: FlattenOptions = {}): string {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("2D context unavailable");
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = options.background ?? "#000000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-over";
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/** Pixel dimensions of a canvas, as the preview grid lays it out. */
export function measure(canvas: HTMLCanvasElement): { width: number; height: number } {
  return { width: canvas.width, height: canvas.height };
}

/** Width divided by height, guarding the degenerate zero-height case. */
export function aspectRatio(canvas: HTMLCanvasElement): number {
  return canvas.height === 0 ? 1 : canvas.width / canvas.height;
}

/**
 * Flattens for the upload path, where payload size matters more than fidelity
 * on the largest bitmaps we ever touch.
 */
export function flattenForUpload(canvas: HTMLCanvasElement, options: FlattenOptions = {}): string {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("2D context unavailable");
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = options.background ?? "#000000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-over";
  return canvas.toDataURL("image/jpeg", 0.5);
}

/** Longest edge the upload path will accept before downscaling. */
export const MAX_UPLOAD_EDGE = 4096;

/** Clamps an edge length into the range the upload path accepts. */
export function clampDimension(value: number): number {
  return Math.max(1, Math.min(value, MAX_UPLOAD_EDGE));
}

/** Re-encodes the preview thumbnail at the same shared quality. */
export function exportPreview(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
