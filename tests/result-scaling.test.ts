import { describe, expect, it } from "vitest";
import { DISCLOSE_PIXEL_RATIO, shouldDiscloseResolution } from "@/lib/engines/result-scaling";

/** Bread's documented rule: long edge -> 1536, both dimensions floored to /8. */
function breadOutput(width: number, height: number): { resultWidth: number; resultHeight: number } {
  const longEdge = Math.max(width, height);
  const factor = longEdge <= 1536 ? 1 : 1536 / longEdge;
  const floor8 = (n: number) => Math.floor(Math.round(n) / 8) * 8;
  return { resultWidth: floor8(width * factor), resultHeight: floor8(height * factor) };
}

describe("shouldDiscloseResolution", () => {
  it("discloses a real downscale — the measured 9.83MP case", () => {
    // 3840x2560 -> 1536x1024, pixel ratio 0.160 (premise-check.md).
    expect(shouldDiscloseResolution({ sourceWidth: 3840, sourceHeight: 2560, ...breadOutput(3840, 2560) })).toBe(true);
  });

  it("discloses a typical 12MP phone upload", () => {
    expect(shouldDiscloseResolution({ sourceWidth: 4000, sourceHeight: 3000, ...breadOutput(4000, 3000) })).toBe(true);
  });

  it("discloses when the long edge is the height (portrait)", () => {
    expect(shouldDiscloseResolution({ sourceWidth: 2560, sourceHeight: 3840, ...breadOutput(2560, 3840) })).toBe(true);
  });

  it("stays silent on identical dimensions — the Local engine's case", () => {
    expect(
      shouldDiscloseResolution({ sourceWidth: 4000, sourceHeight: 3000, resultWidth: 4000, resultHeight: 3000 }),
    ).toBe(false);
  });

  it("stays silent when Bread passed the source through — the 0.54MP aurora", () => {
    // 899x600 is under the 1536 cap, so only /8 flooring applies: 896x600.
    const dims = { sourceWidth: 899, sourceHeight: 600, ...breadOutput(899, 600) };
    expect(dims.resultWidth).toBe(896);
    expect(shouldDiscloseResolution(dims)).toBe(false);
  });

  it("stays silent on an /8-floored near-match (rounding is not a resolution loss)", () => {
    // 1201x803 -> 1200x800 is a 0.5% drop; the threshold must not fire on it.
    expect(
      shouldDiscloseResolution({ sourceWidth: 1201, sourceHeight: 803, resultWidth: 1200, resultHeight: 800 }),
    ).toBe(false);
  });

  it("stays silent when the result is larger than the source", () => {
    expect(
      shouldDiscloseResolution({ sourceWidth: 800, sourceHeight: 600, resultWidth: 1600, resultHeight: 1200 }),
    ).toBe(false);
  });

  it("fires exactly at the threshold boundary and not just above it", () => {
    const source = { sourceWidth: 1000, sourceHeight: 1000 };
    const atRatio = Math.sqrt(DISCLOSE_PIXEL_RATIO) * 1000; // 948.68…
    // Just under 90% of the pixels -> disclose.
    expect(shouldDiscloseResolution({ ...source, resultWidth: 948, resultHeight: 948 })).toBe(true);
    // Just over -> stay silent.
    expect(shouldDiscloseResolution({ ...source, resultWidth: 949, resultHeight: 949 })).toBe(false);
    expect(Math.floor(atRatio)).toBe(948);
  });

  it("treats exactly 90% of the pixels as no loss (strict comparison)", () => {
    // 900x1000 = 900,000 is exactly 0.9 x 1000x1000. The rule is "below the
    // ratio", so the boundary itself must stay silent — this is what separates
    // `<` from `<=` and nothing else in the suite does.
    expect(
      shouldDiscloseResolution({ sourceWidth: 1000, sourceHeight: 1000, resultWidth: 900, resultHeight: 1000 }),
    ).toBe(false);
    // One pixel under the boundary does disclose.
    expect(
      shouldDiscloseResolution({ sourceWidth: 1000, sourceHeight: 1000, resultWidth: 899, resultHeight: 1000 }),
    ).toBe(true);
  });

  it.each([
    ["zero width", { sourceWidth: 0, sourceHeight: 3000, resultWidth: 1536, resultHeight: 1024 }],
    ["zero result", { sourceWidth: 4000, sourceHeight: 3000, resultWidth: 0, resultHeight: 0 }],
    ["negative", { sourceWidth: -4000, sourceHeight: 3000, resultWidth: 1536, resultHeight: 1024 }],
    ["NaN", { sourceWidth: Number.NaN, sourceHeight: 3000, resultWidth: 1536, resultHeight: 1024 }],
    ["Infinity", { sourceWidth: Number.POSITIVE_INFINITY, sourceHeight: 3000, resultWidth: 1536, resultHeight: 1024 }],
    ["fractional", { sourceWidth: 4000.5, sourceHeight: 3000, resultWidth: 1536, resultHeight: 1024 }],
  ])("fails closed on %s rather than guessing", (_label, dims) => {
    expect(shouldDiscloseResolution(dims)).toBe(false);
  });
});
