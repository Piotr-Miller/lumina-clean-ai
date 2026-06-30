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

/** Decode a File's bytes into a loaded image via a transient object URL. */
function decodeFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image failed to decode."));
    };
    img.src = url;
  });
}

/**
 * Flatten a (possibly alpha) image File to an opaque RGB JPEG File — the reactive
 * recovery for the RGBA/torch failure (Bread requires a 3-channel input; an alpha
 * PNG is 4-channel). Pre-fills the canvas opaque white BEFORE `drawImage` so
 * transparent pixels composite onto white (JPEG has no alpha channel), then
 * re-encodes at the shared {@link JPEG_QUALITY}. The output name swaps the
 * extension to `.jpg` so the re-submit carries an honest MIME/extension pair.
 */
export async function flattenToRgbJpeg(file: File): Promise<File> {
  const img = await decodeFile(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  const base = file.name.replace(/\.[^./\\]+$/, "");
  return new File([blob], `${base || "photo"}.jpg`, { type: "image/jpeg" });
}
