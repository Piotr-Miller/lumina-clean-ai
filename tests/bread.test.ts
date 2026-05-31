import { describe, expect, it } from "vitest";
import { BREAD_GAMMA, BREAD_STRENGTH, BREAD_VERSION, buildBreadInput } from "@/lib/services/bread";

describe("BREAD_VERSION", () => {
  it("is the locked Phase-0 mingcv/bread version hash", () => {
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
});
