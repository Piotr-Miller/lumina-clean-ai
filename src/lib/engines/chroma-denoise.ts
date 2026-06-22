/**
 * Adaptive YCbCr chroma-denoise post-pass — pure, DOM-free core.
 *
 * Bread (Cloud engine) lifts shadows well but leaves color (chroma) noise
 * revealed in dark / near-black regions. This pass blurs ONLY the Cb/Cr
 * channels and recombines them with the **original luminance (Y)**, blended
 * per-pixel by a shadow weight: strong in near-black, ~zero in highlights. So
 * shadow color noise is smoothed while luminance detail (and bright, clean
 * regions) stay untouched.
 *
 * Pure and DOM-free so it's unit-testable under vitest's `node` environment
 * (`Uint8ClampedArray` is a Node global). The Canvas decode/encode wiring lives
 * separately in the Phase-4 browser adapter; this module never touches the DOM.
 *
 * Operates in place on an RGBA pixel buffer (the Canvas `ImageData` 4-byte
 * stride). Touches R/G/B only — alpha is left for the caller to force opaque
 * before JPEG export. Memory is bounded to byte-sized full-frame Cb/Cr planes
 * plus one reusable byte scratch buffer (~36 MB at 12 MP); no full-frame float
 * buffers and no per-pixel/kernel allocations.
 *
 * Unit-tested in `tests/chroma-denoise.test.ts`.
 */

/** Tunable parameters for the chroma-denoise pass. */
export interface ChromaDenoiseParams {
  /** Box-blur radius (px) applied to the Cb/Cr planes. `0` disables the blur. */
  blurRadius: number;
  /** Maximum chroma-blend factor in `[0,1]`, reached in the darkest shadows. */
  maxStrength: number;
  /** Shadow-weight falloff exponent; higher concentrates the denoise in near-black. */
  shadowCurve: number;
}

/**
 * Conservative defaults. Tuned for "do little harm" before the Phase-5 A/B
 * pass refines them against real low-light photos.
 */
export const DEFAULT_CHROMA_PARAMS: ChromaDenoiseParams = {
  blurRadius: 2,
  maxStrength: 0.8,
  shadowCurve: 3,
};

/**
 * Hard upper bound on input size (12 MP ≈ 4000×3000). Larger buffers are
 * rejected before any full-frame allocation — the browser-side perf/memory
 * guard (the pass runs on the main thread).
 */
export const MAX_CHROMA_POSTPASS_PIXELS = 12_000_000;

/**
 * Build-time gate for the chroma post-pass. **Default OFF**: with this `false`
 * the cloud result path is byte-identical to today (no Canvas re-encode, raw
 * Bread output served). Flipping it ON is a deliberate, separate follow-up after
 * the Phase-5 A/B + GO/NO-GO acceptance — not a runtime/user toggle.
 */
export const CHROMA_POSTPASS_ENABLED = false;

/** Prevent pathological kernel sizes from monopolizing the browser main thread. */
const MAX_BLUR_RADIUS = 32;

// BT.601 RGB↔YCbCr coefficients (the same space JPEG uses).
const Y_R = 0.299;
const Y_G = 0.587;
const Y_B = 0.114;
const CB_R = -0.168736;
const CB_G = -0.331264;
const CB_B = 0.5;
const CR_R = 0.5;
const CR_G = -0.418688;
const CR_B = -0.081312;
const R_CR = 1.402;
const G_CB = -0.344136;
const G_CR = -0.714136;
const B_CB = 1.772;
const CHROMA_BIAS = 128;

/**
 * Find the largest shared scale in `[0,1]` that keeps an RGB displacement in
 * gamut. Scaling all three channel deltas together preserves their zero-luma
 * relationship instead of independently clamping channels and shifting Y.
 */
function maxInGamutScale(r: number, g: number, b: number, deltaR: number, deltaG: number, deltaB: number): number {
  let scale = 1;

  if (deltaR > 0) {
    scale = Math.min(scale, (255 - r) / deltaR);
  } else if (deltaR < 0) {
    scale = Math.min(scale, -r / deltaR);
  }
  if (deltaG > 0) {
    scale = Math.min(scale, (255 - g) / deltaG);
  } else if (deltaG < 0) {
    scale = Math.min(scale, -g / deltaG);
  }
  if (deltaB > 0) {
    scale = Math.min(scale, (255 - b) / deltaB);
  } else if (deltaB < 0) {
    scale = Math.min(scale, -b / deltaB);
  }

  return Math.max(0, scale);
}

/**
 * Separable box blur of a single byte plane, in place. Horizontal pass writes
 * `channel → scratch`, vertical pass writes `scratch → channel`, so the plane
 * holds the blurred result on return and `scratch` is left dirty (reusable).
 * Edges clamp to the nearest in-bounds sample. A running window sum keeps the
 * inner loops allocation-free.
 */
function boxBlurPlane(
  channel: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  const windowSize = radius * 2 + 1;

  // Horizontal pass: channel -> scratch.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const xx = k < 0 ? 0 : k >= width ? width - 1 : k;
      sum += channel[row + xx];
    }
    for (let x = 0; x < width; x++) {
      scratch[row + x] = Math.round(sum / windowSize);
      const outX = x - radius;
      const inX = x + radius + 1;
      const outIdx = outX < 0 ? 0 : outX;
      const inIdx = inX >= width ? width - 1 : inX;
      sum += channel[row + inIdx] - channel[row + outIdx];
    }
  }

  // Vertical pass: scratch -> channel.
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const yy = k < 0 ? 0 : k >= height ? height - 1 : k;
      sum += scratch[yy * width + x];
    }
    for (let y = 0; y < height; y++) {
      channel[y * width + x] = Math.round(sum / windowSize);
      const outY = y - radius;
      const inY = y + radius + 1;
      const outIdx = outY < 0 ? 0 : outY;
      const inIdx = inY >= height ? height - 1 : inY;
      sum += scratch[inIdx * width + x] - scratch[outIdx * width + x];
    }
  }
}

/**
 * Reduce Cb/Cr noise in dark regions of an RGBA buffer while preserving
 * luminance. Mutates `data` in place; touches R/G/B only (alpha untouched).
 *
 * Throws (before allocating any full-frame buffer) when dimensions are invalid,
 * the buffer length doesn't match `width * height * 4`, or the pixel count
 * exceeds {@link MAX_CHROMA_POSTPASS_PIXELS}.
 */
export function denoiseChroma(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: ChromaDenoiseParams = DEFAULT_CHROMA_PARAMS,
): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`chroma-denoise: invalid dimensions ${String(width)}×${String(height)}.`);
  }
  const pixelCount = width * height;
  if (pixelCount > MAX_CHROMA_POSTPASS_PIXELS) {
    throw new RangeError(
      `chroma-denoise: ${String(pixelCount)}px exceeds the ${String(MAX_CHROMA_POSTPASS_PIXELS)}px (12 MP) limit.`,
    );
  }
  if (data.length !== pixelCount * 4) {
    throw new RangeError(
      `chroma-denoise: buffer length ${String(data.length)} does not match ${String(width)}×${String(height)}×4 (${String(pixelCount * 4)}).`,
    );
  }

  const { blurRadius, maxStrength, shadowCurve } = params;
  if (!Number.isInteger(blurRadius) || blurRadius < 0 || blurRadius > MAX_BLUR_RADIUS) {
    throw new RangeError(`chroma-denoise: blurRadius must be an integer between 0 and ${String(MAX_BLUR_RADIUS)}.`);
  }
  if (!Number.isFinite(maxStrength) || maxStrength < 0 || maxStrength > 1) {
    throw new RangeError("chroma-denoise: maxStrength must be a finite number between 0 and 1.");
  }
  if (!Number.isFinite(shadowCurve) || shadowCurve <= 0) {
    throw new RangeError("chroma-denoise: shadowCurve must be a finite number greater than 0.");
  }

  // The only full-frame temporaries: two byte chroma planes + one reusable scratch.
  const cb = new Uint8ClampedArray(pixelCount);
  const cr = new Uint8ClampedArray(pixelCount);
  const scratch = new Uint8ClampedArray(pixelCount);

  // 1. RGB -> Cb/Cr. Y is NOT stored — it's recomputed at recombine from the
  //    still-intact RGB (avoids a third full-frame plane).
  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    cb[p] = CB_R * r + CB_G * g + CB_B * b + CHROMA_BIAS;
    cr[p] = CR_R * r + CR_G * g + CR_B * b + CHROMA_BIAS;
  }

  // 2. Blur only the chroma planes — luminance is never touched.
  if (blurRadius > 0) {
    boxBlurPlane(cb, scratch, width, height, blurRadius);
    boxBlurPlane(cr, scratch, width, height, blurRadius);
  }

  // 3. Per-luma shadow-weight LUT (256 entries — not full-frame). weight is the
  //    blend toward blurred chroma: maxStrength at black, ~0 toward white.
  const weightLut = new Float32Array(256);
  for (let yy = 0; yy < 256; yy++) {
    weightLut[yy] = maxStrength * Math.pow(1 - yy / 255, shadowCurve);
  }

  // 4. Recombine: keep the original Y, blend the original chroma toward the
  //    blurred chroma by the per-pixel shadow weight, write RGB back.
  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const yLuma = Y_R * r + Y_G * g + Y_B * b;
    const origCb = CB_R * r + CB_G * g + CB_B * b + CHROMA_BIAS;
    const origCr = CR_R * r + CR_G * g + CR_B * b + CHROMA_BIAS;

    const w = weightLut[Math.round(yLuma)];
    const deltaCb = (cb[p] - origCb) * w;
    const deltaCr = (cr[p] - origCr) * w;
    const deltaR = R_CR * deltaCr;
    const deltaG = G_CB * deltaCb + G_CR * deltaCr;
    const deltaB = B_CB * deltaCb;
    const scale = maxInGamutScale(r, g, b, deltaR, deltaG, deltaB);

    data[i] = r + deltaR * scale;
    data[i + 1] = g + deltaG * scale;
    data[i + 2] = b + deltaB * scale;
    // Alpha (data[i + 3]) deliberately untouched — the caller forces it opaque.
  }
}
