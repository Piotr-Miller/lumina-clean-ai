import { describe, expect, it } from "vitest";
import { BREAD_GAMMA, BREAD_STRENGTH, BREAD_VERSION, buildBreadInput } from "@/lib/services/bread";

describe("BREAD_VERSION", () => {
  // The committed pin. Bumped reviewably via `npm run resolve:bread-version`
  // (it rewrites this assertion too); never hand-edit to follow "latest".
  it("matches the reviewed, pinned mingcv/bread version hash", () => {
    expect(BREAD_VERSION).toBe("057a4e073829a8c50f2622206f71a8ed25331cd07a520bc264469389c7c11e54");
  });
});

describe("buildBreadInput", () => {
  it("maps the source URL onto the locked gamma/strength defaults", () => {
    const url = "https://signed/source.jpg";
    expect(buildBreadInput(url)).toEqual({ image: url, gamma: BREAD_GAMMA, strength: BREAD_STRENGTH });
  });

  it("uses the Phase-0 defaults (gamma 1.2 ≤ 1.5, strength 0.2 ≤ 0.2)", () => {
    expect(BREAD_GAMMA).toBe(1.2);
    expect(BREAD_STRENGTH).toBe(0.2);
    expect(BREAD_GAMMA).toBeLessThanOrEqual(1.5);
    expect(BREAD_STRENGTH).toBeLessThanOrEqual(0.2);
  });

  it("passes the image URL through verbatim", () => {
    expect(buildBreadInput("https://x/y?token=abc&exp=1").image).toBe("https://x/y?token=abc&exp=1");
  });

  it("applies per-job overrides when present (S-12)", () => {
    const url = "https://signed/source.jpg";
    expect(buildBreadInput(url, { gamma: 1.1, strength: 0.05 })).toEqual({ image: url, gamma: 1.1, strength: 0.05 });
  });

  it("falls back to the locked default for each absent/undefined override field", () => {
    const url = "https://signed/source.jpg";
    // Only gamma overridden → strength stays at the default.
    expect(buildBreadInput(url, { gamma: 1.3 })).toEqual({ image: url, gamma: 1.3, strength: BREAD_STRENGTH });
    // Only strength overridden → gamma stays at the default.
    expect(buildBreadInput(url, { strength: 0.1 })).toEqual({ image: url, gamma: BREAD_GAMMA, strength: 0.1 });
    // Explicit undefined fields fall back too (the `?? default` path).
    expect(buildBreadInput(url, { gamma: undefined, strength: undefined })).toEqual({
      image: url,
      gamma: BREAD_GAMMA,
      strength: BREAD_STRENGTH,
    });
  });
});
