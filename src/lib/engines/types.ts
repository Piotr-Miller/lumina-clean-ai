/**
 * Engine seam for LuminaClean's photo enhancement.
 *
 * A light Strategy interface every engine satisfies. S-01 ships only the
 * client-side Local engine; S-03 plugs a Cloud engine in behind the same
 * `ImageEngine` contract without reworking the orchestration layer.
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
