/**
 * Shared DOM Canvas encode helper for the Local engine and the cloud-result
 * chroma post-pass.
 *
 * DOM-dependent (`canvas.toBlob`), so it deliberately lives **separately** from
 * the DOM-free `image-helpers.ts` (which is unit-tested under vitest's `node`
 * env and must stay importable there). Its job is to single-source the JPEG
 * re-encode quality so the two Canvas paths can't silently drift apart.
 */

/** JPEG re-encode quality shared by the Local engine and the chroma post-pass. */
export const JPEG_QUALITY = 0.92;

/**
 * Promisified `canvas.toBlob`, rejecting if the codec returns null. `quality`
 * is forwarded verbatim (the browser ignores it for non-lossy MIME types).
 */
export function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas could not encode the image."));
        }
      },
      mimeType,
      quality,
    );
  });
}
