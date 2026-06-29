/**
 * Pure parameter-panel helpers (S-12, Phase 2) — clamping, value formatting,
 * immutable override-set updates, and the Bread type guard. Node-environment
 * unit tests (no DOM).
 */
import { describe, expect, it } from "vitest";
import { PARAM_RANGES } from "@/lib/engines/auto-params";
import {
  clampParamValue,
  formatParamValue,
  isBreadParams,
  withOverride,
} from "@/components/enhance/param-panel-helpers";

describe("clampParamValue", () => {
  const range = { min: 1.0, max: 1.8 };

  it("clamps below min and above max", () => {
    expect(clampParamValue(0.5, range)).toBe(1.0);
    expect(clampParamValue(2.5, range)).toBe(1.8);
  });

  it("passes in-range values through", () => {
    expect(clampParamValue(1.4, range)).toBe(1.4);
    expect(clampParamValue(1.0, range)).toBe(1.0);
    expect(clampParamValue(1.8, range)).toBe(1.8);
  });

  it("falls back to min for non-finite input", () => {
    expect(clampParamValue(Number.NaN, range)).toBe(1.0);
    expect(clampParamValue(Number.POSITIVE_INFINITY, range)).toBe(1.0);
  });

  it("keeps every PARAM_RANGES default within its own bounds", () => {
    const ranges = [
      PARAM_RANGES.local.gamma,
      PARAM_RANGES.local.blur,
      PARAM_RANGES.cloud.gamma,
      PARAM_RANGES.cloud.strength,
    ];
    for (const r of ranges) {
      expect(clampParamValue(r.default, r)).toBe(r.default);
    }
  });
});

describe("formatParamValue", () => {
  it("uses 1 decimal for coarse steps (≥0.1) and 2 for fine steps", () => {
    expect(formatParamValue(1.2, 0.1)).toBe("1.2"); // blur
    expect(formatParamValue(1.05, 0.05)).toBe("1.05"); // gamma
    expect(formatParamValue(0.2, 0.05)).toBe("0.20"); // strength
  });
});

describe("withOverride", () => {
  it("returns a new set containing the key without mutating the input", () => {
    const prev = new Set<"gamma" | "blur">(["gamma"]);
    const next = withOverride(prev, "blur");
    expect(next).not.toBe(prev);
    expect([...next].sort()).toEqual(["blur", "gamma"]);
    expect([...prev]).toEqual(["gamma"]); // input untouched
  });

  it("is idempotent for an already-present key", () => {
    const prev = new Set<"gamma">(["gamma"]);
    expect([...withOverride(prev, "gamma")]).toEqual(["gamma"]);
  });
});

describe("isBreadParams", () => {
  it("distinguishes Bread params from Local params by the strength field", () => {
    expect(isBreadParams({ gamma: 1.2, strength: 0.2 })).toBe(true);
    expect(isBreadParams({ gamma: 1.5, blur: 1.2 })).toBe(false);
  });
});
