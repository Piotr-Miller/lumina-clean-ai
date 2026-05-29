/**
 * Pure, side-effect-free helpers for the Local engine.
 *
 * Deliberately DOM-free so they're unit-testable under vitest's `node`
 * environment (`File`/`Blob`/`Uint8ClampedArray` are Node globals). The
 * canvas pipeline lives separately in `local-engine.ts`.
 *
 * Unit-tested in `tests/image-helpers.test.ts`.
 */

/** Accepted upload MIME types. Mirrors the F-01 `photos` bucket (minus HEIC, which is detect-and-reject in S-01). */
export const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png"] as const;

/** Max upload size in bytes — mirrors the F-01 bucket `file_size_limit` (25 MB). */
export const MAX_FILE_BYTES = 25_000_000;

/**
 * Max pixel dimension (longest edge) we'll decode + process on the main thread.
 * A crash/OOM guard for pathological inputs, not the perf target (the ~2s NFR
 * targets 12MP ≈ 4000×3000). 8000px admits virtually every phone camera while
 * keeping the canvas allocation bounded.
 */
export const MAX_IMAGE_DIMENSION = 8000;

/** Discriminated result of file validation. */
export type FileValidation = { ok: true } | { ok: false; code: string; message: string };

const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

/**
 * Validate an uploaded file by MIME type and byte size only. Pixel dimensions
 * aren't knowable from a `File` here — the hook checks `MAX_IMAGE_DIMENSION`
 * after decode (see the Phase 3 `useLocalEnhance` hook).
 */
export function validateImageFile(file: File): FileValidation {
  if (HEIC_TYPES.has(file.type)) {
    return {
      ok: false,
      code: "unsupported_type",
      message: "HEIC photos aren't supported yet — please convert to JPG or PNG and try again.",
    };
  }
  if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      code: "unsupported_type",
      message: "Unsupported file type. Please upload a JPG or PNG image.",
    };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      code: "file_too_large",
      message: "This image is too large (max 25 MB). Try a smaller copy.",
    };
  }
  return { ok: true };
}

/**
 * Build a 256-entry gamma lookup table. `gamma > 1` brightens midtones/shadows
 * (the Local engine's intent for night photos): out = 255 · (in/255)^(1/gamma).
 */
export function buildGammaLut(gamma: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const inv = 1 / gamma;
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(255 * Math.pow(i / 255, inv));
  }
  return lut;
}

/** File extension for a supported output MIME type. */
function extForMime(mimeType: string): string {
  return mimeType === "image/png" ? "png" : "jpg";
}

/**
 * Derive a friendly download filename: `luminaclean-<sanitized-base>.<ext>`.
 * The extension follows the output MIME type, not the original name. The base
 * is the original filename minus its extension, sanitized to a safe slug.
 */
export function deriveDownloadName(originalName: string, mimeType: string): string {
  const dot = originalName.lastIndexOf(".");
  const rawBase = dot > 0 ? originalName.slice(0, dot) : originalName;
  const base =
    rawBase
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "photo";
  return `luminaclean-${base}.${extForMime(mimeType)}`;
}
