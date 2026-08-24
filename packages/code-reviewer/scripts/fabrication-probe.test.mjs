// Hermetic tests for the fabrication probe's argument gate (review F3): the
// arm-size cap must refuse batches larger than any pre-registered arm before
// a single paid call can start. No network, no API key.
import { describe, expect, it } from "vitest";

import { buildPrompt } from "../src/prompts.js";
import { buildProbeReviewUnit, MAX_ARM_ATTEMPTS, parseArgs, PINNED_PROVIDER } from "./fabrication-probe.mjs";

// The finder truncation note was REVERTED (change `r5-note-revert`), so the
// probe unit is kind+diff for every run — which is what `--pre-note` already
// produced. These pin that the instrument still matches production exactly,
// which is the property the whole campaign depends on.
describe("buildProbeReviewUnit (matches production after the r5 revert)", () => {
  it("sends ONLY kind+diff, even for a truncated manifest", () => {
    const unit = buildProbeReviewUnit("diff text", {
      truncated: true,
      cutFile: "src/cut.ts",
      overCap: ["src/over.ts"],
    });
    expect(unit).toEqual({ kind: "diff", diff: "diff text" });
  });

  it("renders a prompt with no truncation channel at all", () => {
    const unit = buildProbeReviewUnit("d", { truncated: true, cutFile: "c.ts", overCap: ["a.ts"] });
    const prompt = buildPrompt(unit);
    expect(prompt).not.toContain("truncated at 100 KB");
    expect(prompt).not.toContain("<truncation-metadata>");
    expect(prompt).not.toContain("a.ts");
  });

  it("is identical whether or not the manifest reports truncation", () => {
    const capped = buildProbeReviewUnit("d", { truncated: true, cutFile: "c.ts", overCap: ["a.ts"] });
    const uncapped = buildProbeReviewUnit("d", { truncated: false, cutFile: null, overCap: [] });
    expect(buildPrompt(capped)).toBe(buildPrompt(uncapped));
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
