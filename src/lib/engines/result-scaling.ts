/**
 * Pure predicate for the Cloud-path resolution disclosure (S-18).
 *
 * Bread caps its output's long edge at 1536px and floors both dimensions to a
 * multiple of 8, and that is not configurable — so a real phone photo comes
 * back at roughly a sixth of the pixels the Local engine returns, while a
 * source already under the cap passes through untouched. The UI has no way for
 * the user to notice either case, which is what this decides.
 *
 * Deliberately DOM-free so it's unit-testable under vitest's `node`
 * environment; this repo has no component-test harness, so the decision lives
 * here rather than inside `EnhanceWorkspace`. Same env-free-core split as
 * `image-helpers.ts`.
 *
 * Unit-tested in `tests/result-scaling.test.ts`.
 */

/** Intrinsic pixel dimensions of the uploaded source and the returned result. */
export interface ResolutionPair {
  sourceWidth: number;
  sourceHeight: number;
  resultWidth: number;
  resultHeight: number;
}

/**
 * Fraction of the source's pixels the result must fall below before the drop is
 * worth telling the user about.
 *
 * Bread floors each dimension to a multiple of 8, which on its own costs under
 * 1% at realistic result sizes — a 1201x803 source returning 1200x800 loses
 * 0.5%. Ten percent leaves ~9x headroom over that, so rounding never trips the
 * disclosure, while a genuine downscale (a 9.83MP frame returning 1536x1024 is
 * a ratio of 0.160) clears it by a wide margin.
 */
export const DISCLOSE_PIXEL_RATIO = 0.9;

/** True only for a finite, positive, whole pixel count. */
function isPixelCount(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Whether the cloud result lost enough pixels that the UI should say so.
 *
 * Fails closed: any missing, zero, negative, fractional or non-finite dimension
 * returns `false`, so a partial decode never produces a caption stating numbers
 * we don't actually have. Equal dimensions and an upscale are both `false` too
 * — the Local engine and any pass-through cloud job land there and must stay
 * visually untouched.
 */
export function shouldDiscloseResolution({
  sourceWidth,
  sourceHeight,
  resultWidth,
  resultHeight,
}: ResolutionPair): boolean {
  if (![sourceWidth, sourceHeight, resultWidth, resultHeight].every(isPixelCount)) {
    return false;
  }
  return resultWidth * resultHeight < DISCLOSE_PIXEL_RATIO * (sourceWidth * sourceHeight);
}
