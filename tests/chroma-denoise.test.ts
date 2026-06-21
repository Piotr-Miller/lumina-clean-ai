import { describe, expect, it } from "vitest";
import {
  denoiseChroma,
  DEFAULT_CHROMA_PARAMS,
  MAX_CHROMA_POSTPASS_PIXELS,
  type ChromaDenoiseParams,
} from "@/lib/engines/chroma-denoise";

// BT.601 (mirrors the module under test) for measuring Y/Cb/Cr from RGBA.
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function cb(r: number, g: number, b: number): number {
  return -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
}
function cr(r: number, g: number, b: number): number {
  return 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
}

function variance(values: number[]): number {
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  return values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
}

/** Deterministic pseudo-noise in `[0, range)` — no Math.random, so tests are stable. */
function noise(seed: number, range: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return Math.floor((x - Math.floor(x)) * range);
}

/**
 * Build an RGBA buffer. `pixel(p)` returns `[r,g,b,a]` for pixel index `p`.
 */
function buildBuffer(
  width: number,
  height: number,
  pixel: (p: number) => [number, number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const [r, g, b, a] = pixel(p);
    data[p * 4] = r;
    data[p * 4 + 1] = g;
    data[p * 4 + 2] = b;
    data[p * 4 + 3] = a;
  }
  return data;
}

function chromaSamples(data: Uint8ClampedArray): { cb: number[]; cr: number[] } {
  const cbs: number[] = [];
  const crs: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    cbs.push(cb(data[i], data[i + 1], data[i + 2]));
    crs.push(cr(data[i], data[i + 1], data[i + 2]));
  }
  return { cb: cbs, cr: crs };
}

describe("denoiseChroma", () => {
  it("(a) reduces Cb/Cr variance in a synthetic noisy near-black block", () => {
    const w = 32;
    const h = 32;
    // Near-black base (~luma 10) with strong, varying chroma noise per channel.
    const data = buildBuffer(w, h, (p) => [6 + noise(p + 1, 18), 6 + noise(p + 101, 18), 6 + noise(p + 201, 18), 255]);

    const before = chromaSamples(data);
    denoiseChroma(data, w, h);
    const after = chromaSamples(data);

    // Blurring chroma in deep shadow should collapse most of the variance.
    expect(variance(after.cb)).toBeLessThan(variance(before.cb) * 0.6);
    expect(variance(after.cr)).toBeLessThan(variance(before.cr) * 0.6);
  });

  it("(b) preserves per-pixel luminance within tolerance", () => {
    const w = 24;
    const h = 24;
    // Mixed brightness with chroma noise across the range.
    const data = buildBuffer(w, h, (p) => [(p * 7) % 256, 40 + noise(p + 3, 80), 40 + noise(p + 303, 80), 255]);

    const before: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      before.push(luma(data[i], data[i + 1], data[i + 2]));
    }

    denoiseChroma(data, w, h);

    let j = 0;
    for (let i = 0; i < data.length; i += 4, j++) {
      const after = luma(data[i], data[i + 1], data[i + 2]);
      // Y is preserved by construction; only byte rounding/clamping drifts it.
      expect(Math.abs(after - before[j])).toBeLessThanOrEqual(2);
    }
  });

  it("(c) leaves a bright, clean region ~unchanged (shadow weight ≈ 0)", () => {
    const w = 16;
    const h = 16;
    // Bright (~luma 230) with mild chroma variation — weight should be ~0.
    const data = buildBuffer(w, h, (p) => [
      225 + noise(p + 5, 12),
      225 + noise(p + 505, 12),
      225 + noise(p + 905, 12),
      255,
    ]);
    const original = data.slice();

    denoiseChroma(data, w, h);

    for (let i = 0; i < data.length; i++) {
      expect(Math.abs(data[i] - original[i])).toBeLessThanOrEqual(2);
    }
  });

  it("(d) keeps all RGB output bytes in range with no NaN", () => {
    const w = 20;
    const h = 20;
    // Span extremes to stress clamping.
    const data = buildBuffer(w, h, (p) => [noise(p + 1, 256), noise(p + 401, 256), noise(p + 801, 256), 255]);

    denoiseChroma(data, w, h);

    for (const byte of data) {
      expect(Number.isNaN(byte)).toBe(false);
      expect(byte).toBeGreaterThanOrEqual(0);
      expect(byte).toBeLessThanOrEqual(255);
    }
  });

  it("(e) is deterministic for fixed params", () => {
    const w = 18;
    const h = 18;
    const make = () =>
      buildBuffer(w, h, (p) => [10 + noise(p + 1, 40), 10 + noise(p + 201, 40), 10 + noise(p + 401, 40), 255]);

    const a = make();
    const b = make();
    denoiseChroma(a, w, h);
    denoiseChroma(b, w, h);

    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("(f) rejects malformed dimensions before allocating", () => {
    // Length mismatch (2×2 should be 16 bytes).
    expect(() => {
      denoiseChroma(new Uint8ClampedArray(4), 2, 2);
    }).toThrow(RangeError);
    // Non-positive / non-integer dimensions.
    expect(() => {
      denoiseChroma(new Uint8ClampedArray(0), 0, 0);
    }).toThrow(RangeError);
    expect(() => {
      denoiseChroma(new Uint8ClampedArray(16), 2.5, 1);
    }).toThrow(RangeError);
  });

  it("(f) rejects >12 MP input before allocating a full-frame buffer", () => {
    const width = 4000;
    const height = 4000; // 16 MP > 12 MP cap
    expect(width * height).toBeGreaterThan(MAX_CHROMA_POSTPASS_PIXELS);
    // A tiny buffer is enough: the size guard fires before any allocation/length check.
    expect(() => {
      denoiseChroma(new Uint8ClampedArray(4), width, height);
    }).toThrow(/12 MP/);
  });

  it("(g) leaves the alpha channel unchanged", () => {
    const w = 12;
    const h = 12;
    // Varying alpha (including translucent) must survive byte-for-byte.
    const data = buildBuffer(w, h, (p) => [
      8 + noise(p + 1, 30),
      8 + noise(p + 51, 30),
      8 + noise(p + 101, 30),
      p % 256,
    ]);
    const originalAlpha: number[] = [];
    for (let i = 3; i < data.length; i += 4) originalAlpha.push(data[i]);

    denoiseChroma(data, w, h);

    let k = 0;
    for (let i = 3; i < data.length; i += 4, k++) {
      expect(data[i]).toBe(originalAlpha[k]);
    }
  });

  it("exports conservative defaults and the 12 MP cap", () => {
    expect(MAX_CHROMA_POSTPASS_PIXELS).toBe(12_000_000);
    expect(DEFAULT_CHROMA_PARAMS.maxStrength).toBeGreaterThan(0);
    expect(DEFAULT_CHROMA_PARAMS.maxStrength).toBeLessThanOrEqual(1);
    expect(DEFAULT_CHROMA_PARAMS.blurRadius).toBeGreaterThanOrEqual(0);
  });

  it("honors a zero-radius (no-blur) param without throwing", () => {
    const w = 8;
    const h = 8;
    const params: ChromaDenoiseParams = { blurRadius: 0, maxStrength: 0.8, shadowCurve: 3 };
    const data = buildBuffer(w, h, (p) => [10 + noise(p + 1, 20), 10, 10, 255]);
    expect(() => {
      denoiseChroma(data, w, h, params);
    }).not.toThrow();
  });
});
