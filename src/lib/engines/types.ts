/**
 * Engine seam for LuminaClean's photo enhancement.
 *
 * A light Strategy interface for synchronous, Blob-returning enhancement.
 * S-01 ships the client-side Local engine through this contract; S-03 keeps
 * `EngineId` shared but forks Cloud into submit-then-wait orchestration.
 */

/** Engine identity. Local ships in S-01; "cloud" is reserved for S-03. */
export type EngineId = "local" | "cloud";

/** Output of an enhancement pass. The blob is the full-resolution result. */
export interface EnhanceResult {
  blob: Blob;
  width: number;
  height: number;
  /** MIME type of `blob` — preserved from the source (JPG→JPG, PNG→PNG). */
  mimeType: string;
}

/**
 * A photo-enhancement strategy. The caller decodes the source into an
 * `HTMLImageElement` / `ImageBitmap` and is responsible for validating it
 * (format, size, and `MAX_IMAGE_DIMENSION`) before calling `enhance`.
 */
export interface ImageEngine {
  id: EngineId;
  enhance(source: HTMLImageElement | ImageBitmap, opts: { mimeType: string }): Promise<EnhanceResult>;
}
