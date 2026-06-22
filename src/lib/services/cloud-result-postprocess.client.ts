/**
 * Browser-side wiring for the chroma-denoise post-pass.
 *
 * Two layers, deliberately split so the orchestration is Node-unit-testable
 * while the real pixel work stays browser-only:
 *
 *  - {@link processCloudResultBlob} — the real Canvas adapter. Decodes the
 *    fetched Bread `Blob`, draws it, reads RGBA, runs the pure
 *    {@link denoiseChroma} core, forces alpha opaque, and re-encodes JPEG. Only
 *    this function touches the DOM, and only when invoked (never at import).
 *  - {@link maybePostprocessCloudResult} — the flag/limit/fallback orchestrator.
 *    It decides whether to run the pass at all and degrades to the raw result on
 *    over-size or any processor failure. A `processor` can be injected so the
 *    decision logic is testable under Vitest's `node` env without a browser
 *    Canvas codec.
 *
 * Failure here is **quality degradation, not result loss**: a thrown processor
 * yields the original Bread `Blob` plus a scrub-safe `fallbackReason`, never an
 * error the caller must surface as a failed job.
 *
 * Kept free of any `astro:env`/supabase import so it loads + unit-tests under
 * the Vitest Node environment — see `tests/cloud-result-postprocess.test.ts`.
 */
import { denoiseChroma, MAX_CHROMA_POSTPASS_PIXELS } from "@/lib/engines/chroma-denoise";
import { canvasToBlob, JPEG_QUALITY } from "@/lib/engines/canvas-helpers";

/**
 * Force every alpha byte of an RGBA buffer to 255 (fully opaque), in place.
 *
 * Canvas `getImageData` always returns 4 channels and the chroma math touches
 * R/G/B only — an un-forced alpha would composite unpredictably when the buffer
 * is flattened to alpha-less JPEG. Pure + DOM-free so it's unit-testable.
 */
export function forceOpaque(data: Uint8ClampedArray): void {
  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255;
  }
}

/**
 * The real browser adapter: run the chroma post-pass over a fetched cloud-result
 * `Blob` and return a re-encoded **opaque JPEG** `Blob`. Touches the DOM
 * (`createImageBitmap` + Canvas), so it is browser-only and never called at
 * module import time. `width`/`height` are the decoded intrinsic dimensions
 * carried alongside the Blob (the pass preserves them).
 */
export async function processCloudResultBlob(blob: Blob, width: number, height: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Browser could not create a canvas for the chroma post-pass.");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    denoiseChroma(imageData.data, width, height);
    // The chroma math leaves alpha alone; force it opaque before the JPEG flatten.
    forceOpaque(imageData.data);
    ctx.putImageData(imageData, 0, 0);

    return await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}

/** A pluggable chroma processor — the real one is {@link processCloudResultBlob}. */
export type CloudResultProcessor = (blob: Blob, width: number, height: number) => Promise<Blob>;

export interface MaybePostprocessArgs {
  /** Build-time gate (`CHROMA_POSTPASS_ENABLED`); when false the pass is skipped. */
  enabled: boolean;
  /** The raw Bread result bytes. */
  blob: Blob;
  /** Decoded intrinsic dimensions of `blob`. */
  width: number;
  height: number;
  /** Injectable for Node tests; defaults to the real Canvas adapter. */
  processor?: CloudResultProcessor;
}

export interface PostprocessOutcome {
  /** The Blob to display + download: the processed JPEG, or the raw result. */
  blob: Blob;
  /** True only when `blob` is the processed JPEG (the caller mints an object URL). */
  processed: boolean;
  /** Non-null when the raw result was kept; a scrub-safe reason for logging. */
  fallbackReason: string | null;
}

/**
 * Decide whether to run the chroma post-pass and degrade safely on size or
 * failure. Never throws: disabled → raw; over the 12 MP guard → raw (processor
 * never invoked); processor success → processed JPEG; processor throw/encode
 * failure → raw + a bounded `fallbackReason`.
 */
export async function maybePostprocessCloudResult({
  enabled,
  blob,
  width,
  height,
  processor = processCloudResultBlob,
}: MaybePostprocessArgs): Promise<PostprocessOutcome> {
  if (!enabled) {
    return { blob, processed: false, fallbackReason: null };
  }
  if (width * height > MAX_CHROMA_POSTPASS_PIXELS) {
    return {
      blob,
      processed: false,
      fallbackReason: `over ${String(MAX_CHROMA_POSTPASS_PIXELS)}px guard (${String(width)}×${String(height)})`,
    };
  }
  try {
    const processedBlob = await processor(blob, width, height);
    return { blob: processedBlob, processed: true, fallbackReason: null };
  } catch (err) {
    return {
      blob,
      processed: false,
      fallbackReason: `processor failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}
