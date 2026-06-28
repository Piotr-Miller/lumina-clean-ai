/**
 * Auto-params analyzer + recommender (S-12, Phase 1).
 *
 * Three test groups:
 *  1. `computeLumaStats` on hand-built synthetic RGBA buffers (exact expected
 *     values — the histogram/percentile math).
 *  2. `recommendParams` monotonicity on a synthetic stats sweep (gamma is
 *     non-increasing in p50 with the highlight guards held below threshold).
 *  3. Range-based oracle over committed `tests/fixtures/auto-params/*.json`
 *     stats (precomputed offline — no image decode in the Node gate). Assertions
 *     key off each fixture's computed stats, not its label.
 *
 * Regenerate fixtures: `python scripts/gen_auto_params_fixtures.py`
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeLumaStats, PARAM_RANGES, recommendParams } from "@/lib/engines/auto-params";
import type { LumaStats } from "@/lib/engines/types";

const EPS = 1e-9;

/** Build a uniform-gray RGBA buffer of `n` pixels at luma byte `v` (R=G=B=v). */
function grayBuffer(n: number, v: number, alpha = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n; p++) {
    data[p * 4] = v;
    data[p * 4 + 1] = v;
    data[p * 4 + 2] = v;
    data[p * 4 + 3] = alpha;
  }
  return data;
}

describe("computeLumaStats", () => {
  it("uniform black → all zero, full shadow", () => {
    const s = computeLumaStats(grayBuffer(100, 0));
    expect(s.mean).toBe(0);
    expect(s.p50).toBe(0);
    expect(s.shadowRatio).toBe(1);
    expect(s.highlightRatio).toBe(0);
    expect(s.clipRatio).toBe(0);
  });

  it("uniform white → all one, full highlight + clip", () => {
    const s = computeLumaStats(grayBuffer(100, 255));
    expect(s.mean).toBe(1);
    expect(s.p50).toBe(1);
    expect(s.shadowRatio).toBe(0);
    expect(s.highlightRatio).toBe(1);
    expect(s.clipRatio).toBe(1);
  });

  it("uniform mid-gray (128) → ~0.502 everywhere", () => {
    const s = computeLumaStats(grayBuffer(50, 128));
    expect(s.mean).toBeCloseTo(128 / 255, 6);
    expect(s.p50).toBeCloseTo(128 / 255, 6);
    expect(s.shadowRatio).toBe(0);
    expect(s.highlightRatio).toBe(0);
  });

  it("half-black / half-white → mean 0.5, split ratios, nearest-rank percentiles", () => {
    const data = new Uint8ClampedArray(200 * 4);
    for (let p = 0; p < 200; p++) {
      const v = p < 100 ? 0 : 255;
      data[p * 4] = v;
      data[p * 4 + 1] = v;
      data[p * 4 + 2] = v;
      data[p * 4 + 3] = 255;
    }
    const s = computeLumaStats(data);
    expect(s.mean).toBeCloseTo(0.5, 6);
    expect(s.p50).toBe(0); // q=0.5 lands at the end of the black half
    expect(s.p95).toBe(1);
    expect(s.shadowRatio).toBe(0.5);
    expect(s.highlightRatio).toBe(0.5);
    expect(s.clipRatio).toBe(0.5);
  });

  it("uses Rec.709 luma and ignores alpha", () => {
    // Pure red: Y = 0.2126 * 255 ≈ 54.21 → bin 54.
    const opaque = computeLumaStats(new Uint8ClampedArray([255, 0, 0, 255]));
    const transparent = computeLumaStats(new Uint8ClampedArray([255, 0, 0, 0]));
    expect(opaque.p50).toBeCloseTo(54 / 255, 6);
    expect(transparent.p50).toBe(opaque.p50); // alpha does not affect luma
  });

  it("rejects malformed buffers", () => {
    expect(() => computeLumaStats(new Uint8ClampedArray(0))).toThrow(RangeError);
    expect(() => computeLumaStats(new Uint8ClampedArray(6))).toThrow(RangeError);
  });
});

/** A LumaStats with neutral, guard-free defaults; override per test. */
function statsWith(over: Partial<LumaStats>): LumaStats {
  return {
    mean: 0.3,
    p05: 0.1,
    p25: 0.2,
    p50: 0.3,
    p75: 0.4,
    p95: 0.5,
    p99: 0.6,
    shadowRatio: 0.3,
    highlightRatio: 0,
    clipRatio: 0,
    ...over,
  };
}

describe("recommendParams — monotonicity (synthetic sweep)", () => {
  // p95/clipRatio/shadowRatio held below guard thresholds so only p50 varies.
  const sweep = [0.03, 0.06, 0.1, 0.15, 0.2, 0.3, 0.45, 0.6].map((p50) =>
    statsWith({ p50, p95: 0.5, clipRatio: 0, shadowRatio: 0.5 }),
  );

  it("local gamma is non-increasing as p50 increases", () => {
    const gammas = sweep.map((s) => recommendParams(s, "local").gamma);
    for (let i = 1; i < gammas.length; i++) {
      expect(gammas[i]).toBeLessThanOrEqual(gammas[i - 1] + EPS);
    }
  });

  it("cloud gamma is non-increasing as p50 increases", () => {
    const gammas = sweep.map((s) => recommendParams(s, "cloud").gamma);
    for (let i = 1; i < gammas.length; i++) {
      expect(gammas[i]).toBeLessThanOrEqual(gammas[i - 1] + EPS);
    }
  });
});

interface Fixture {
  name: string;
  class: string;
  provenance: "real" | "synthetic";
  source: string;
  stats: LumaStats;
}

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "auto-params");
const fixtures: Fixture[] = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(FIXTURE_DIR, f), "utf-8")) as Fixture);

describe("recommendParams — oracle (committed fixtures)", () => {
  it("loaded an 8–12 image oracle spanning the luma classes", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(8);
    expect(fixtures.length).toBeLessThanOrEqual(12);
  });

  describe.each(fixtures)("$name ($provenance)", ({ stats }) => {
    const local = recommendParams(stats, "local");
    const cloud = recommendParams(stats, "cloud");

    it("outputs are within PARAM_RANGES", () => {
      expect(local.gamma).toBeGreaterThanOrEqual(PARAM_RANGES.local.gamma.min);
      expect(local.gamma).toBeLessThanOrEqual(PARAM_RANGES.local.gamma.max);
      expect(local.blur).toBeGreaterThanOrEqual(PARAM_RANGES.local.blur.min);
      expect(local.blur).toBeLessThanOrEqual(PARAM_RANGES.local.blur.max);
      expect(cloud.gamma).toBeGreaterThanOrEqual(PARAM_RANGES.cloud.gamma.min);
      expect(cloud.gamma).toBeLessThanOrEqual(PARAM_RANGES.cloud.gamma.max);
      expect(cloud.strength).toBeGreaterThanOrEqual(PARAM_RANGES.cloud.strength.min);
    });

    it("Bread strength never exceeds 0.2 and Auto marks it provisional", () => {
      expect(cloud.strength).toBeLessThanOrEqual(0.2 + EPS);
      expect(cloud.provisional).toBe(true);
    });

    it("Auto blur stays a conservative secondary add-on (≤0.7)", () => {
      expect(local.blur).toBeLessThanOrEqual(0.7 + EPS);
    });
  });

  it("already-bright inputs (p50 ≥ 0.30) get gamma ≈ 1.0 and low blur", () => {
    const bright = fixtures.filter((f) => f.stats.p50 >= 0.3);
    expect(bright.length).toBeGreaterThan(0);
    for (const f of bright) {
      const local = recommendParams(f.stats, "local");
      expect(local.gamma).toBeLessThanOrEqual(1.15);
      expect(local.blur).toBeLessThanOrEqual(0.1 + EPS);
    }
  });

  it("genuinely-dark inputs (p50 ≤ 0.06, no strong highlights/clip) get a strong lift", () => {
    const dark = fixtures.filter((f) => f.stats.p50 <= 0.06 && f.stats.p95 <= 0.85 && f.stats.clipRatio <= 0.005);
    expect(dark.length).toBeGreaterThan(0);
    for (const f of dark) {
      const local = recommendParams(f.stats, "local");
      expect(local.gamma).toBeGreaterThanOrEqual(1.5);
      expect(local.blur).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("near-clipped inputs (clipRatio > 0.005) cap gamma and Bread strength", () => {
    const clipped = fixtures.filter((f) => f.stats.clipRatio > 0.005);
    expect(clipped.length).toBeGreaterThan(0);
    for (const f of clipped) {
      expect(recommendParams(f.stats, "local").gamma).toBeLessThanOrEqual(1.1 + EPS);
      const cloud = recommendParams(f.stats, "cloud");
      expect(cloud.gamma).toBeLessThanOrEqual(1.1 + EPS);
      expect(cloud.strength).toBeLessThanOrEqual(0.1 + EPS);
    }
  });

  it("highlight-heavy inputs (p95 > 0.85) are not maxed out", () => {
    const hot = fixtures.filter((f) => f.stats.p95 > 0.85);
    expect(hot.length).toBeGreaterThan(0);
    for (const f of hot) {
      expect(recommendParams(f.stats, "local").gamma).toBeLessThanOrEqual(1.5);
    }
  });
});
