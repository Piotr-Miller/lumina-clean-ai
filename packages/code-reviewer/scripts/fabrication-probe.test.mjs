// Hermetic tests for the fabrication probe's argument gate (review F3): the
// arm-size cap must refuse batches larger than any pre-registered arm before
// a single paid call can start. No network, no API key.
import { describe, expect, it } from "vitest";

import { buildPrompt } from "../src/prompts.js";
import { buildProbeReviewUnit, MAX_ARM_ATTEMPTS, parseArgs, PINNED_PROVIDER } from "./fabrication-probe.mjs";

describe("buildProbeReviewUnit (r5 provenance binding)", () => {
  it("assembles the exact production unit and renders the truncation note", () => {
    const unit = buildProbeReviewUnit("diff text", {
      truncated: true,
      cutFile: "src/cut.ts",
      overCap: ["src/over.ts"],
    });
    expect(unit).toEqual({
      kind: "diff",
      diff: "diff text",
      truncated: true,
      cutFile: "src/cut.ts",
      overCapFiles: ["src/over.ts"],
    });
    const prompt = buildPrompt(unit);
    expect(prompt).toContain("truncated at 100 KB");
    expect(prompt).toContain("<truncation-metadata>");
    expect(prompt).toContain('"src/over.ts"');
  });

  it("omits cutFile when the manifest's cut file is null", () => {
    const unit = buildProbeReviewUnit("d", { truncated: true, cutFile: null, overCap: ["a.ts"] });
    expect(unit).toEqual({ kind: "diff", diff: "d", truncated: true, overCapFiles: ["a.ts"] });
  });

  it("adds no truncation fields for an uncapped manifest (rung r1)", () => {
    const unit = buildProbeReviewUnit("d", { truncated: false, cutFile: null, overCap: [] });
    expect(unit).toEqual({ kind: "diff", diff: "d" });
    expect(buildPrompt(unit)).not.toContain("truncation-metadata");
  });
});

describe("PINNED_PROVIDER (amendment A1)", () => {
  it("pins the single schema-enforcing upstream with fallbacks off and parameter support required", () => {
    expect(PINNED_PROVIDER).toEqual({
      order: ["venice"],
      allow_fallbacks: false,
      require_parameters: true,
      quantizations: ["fp4"],
    });
  });
});

describe("parseArgs", () => {
  it("accepts the largest pre-registered arm size", () => {
    expect(parseArgs(["--variant", "ci", "--rung", "base", "--n", "20"])).toMatchObject({
      variant: "ci",
      rung: "base",
      n: 20,
      dry: false,
    });
  });

  it("caps --n at the largest pre-registered arm", () => {
    expect(MAX_ARM_ATTEMPTS).toBe(20);
    expect(() => parseArgs(["--variant", "ci", "--n", "21"])).toThrow(/--n must be ≤ 20/);
  });

  it("still rejects non-positive and non-integer --n", () => {
    expect(() => parseArgs(["--variant", "ci", "--n", "0"])).toThrow(/positive integer/);
    expect(() => parseArgs(["--variant", "ci", "--n", "2.5"])).toThrow(/positive integer/);
  });
});
