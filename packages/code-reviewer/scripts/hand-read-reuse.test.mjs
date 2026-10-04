// Hermetic tests for the hand-read reuse proposer (change finder-verification,
// plan.md Phase 2 §3; Definitions "Hand-read reuse").
import { describe, expect, it } from "vitest";

import { mergeFindings } from "../src/findings.ts";
import { dedupKey, proposeReuse } from "./hand-read-reuse.mjs";

const row = (overrides = {}) => ({
  id: "R1",
  pr: 269,
  codeVersion: "fca2778",
  file: "scripts/s17/build.py",
  startLine: 42,
  category: "correctness",
  description: "build_photo opens a path without checking it exists",
  ...overrides,
});
const prior = (overrides = {}) => ({ ...row({ id: "D13", claim: "same claim", label: "rejected" }), ...overrides });

describe("dedupKey", () => {
  it("is mergeFindings' identity: two findings with one key merge into one", () => {
    const a = { ...row(), severity: "major", suggestion: "s" };
    const b = { ...row({ description: "other words" }), severity: "minor", suggestion: "t" };
    expect(dedupKey(a)).toBe(dedupKey(b));
    expect(mergeFindings([a, b])).toHaveLength(1);
    expect(dedupKey(a)).toBe("scripts/s17/build.py:42|correctness");
  });
});

describe("proposeReuse — inherit only when PR, version, key and an owner claim match all hold", () => {
  it("inherits the label when all four hold", () => {
    const [entry] = proposeReuse({
      rows: [row()],
      prior: [prior()],
      claims: { R1: { prior: "D13", claimMatch: true } },
    });
    expect(entry).toMatchObject({ decision: "inherit", inherited: { priorId: "D13", label: "rejected" } });
  });

  it("without the owner's claim decision, a key match is only listed for the owner — no label", () => {
    const [entry] = proposeReuse({ rows: [row()], prior: [prior()] });
    expect(entry).toMatchObject({ decision: "needs-claim-decision", candidates: ["D13"] });
    expect(entry).not.toHaveProperty("inherited");
  });

  it("a claim the owner judged different is classified anew", () => {
    const [entry] = proposeReuse({
      rows: [row()],
      prior: [prior()],
      claims: { R1: { prior: "D13", claimMatch: false } },
    });
    expect(entry).toMatchObject({ decision: "classify" });
    expect(entry).not.toHaveProperty("inherited");
  });

  it.each([
    ["another PR", { pr: 240 }],
    ["another code version", { codeVersion: "54d3557" }],
    ["another line", { startLine: 43 }],
    ["another category", { category: "security" }],
  ])("%s never matches, so the row is classified anew", (_label, overrides) => {
    const [entry] = proposeReuse({ rows: [row()], prior: [prior(overrides)] });
    expect(entry).toMatchObject({ decision: "classify", candidates: [] });
  });

  it("refuses a claim decision that names a prior row not matching on PR, version and key", () => {
    expect(() =>
      proposeReuse({
        rows: [row()],
        prior: [prior({ pr: 240 })],
        claims: { R1: { prior: "D13", claimMatch: true } },
      }),
    ).toThrow(/does not match the row on PR, code version and dedup key/u);
  });

  it("refuses a claim decision for a row the table does not hold, or a malformed one", () => {
    expect(() =>
      proposeReuse({ rows: [row()], prior: [prior()], claims: { R9: { prior: "D13", claimMatch: true } } }),
    ).toThrow(/claims name row R9/u);
    expect(() => proposeReuse({ rows: [row()], prior: [prior()], claims: { R1: { prior: "D13" } } })).toThrow(
      /claimMatch/u,
    );
  });

  it("refuses rows without the fields a match needs, and duplicate ids", () => {
    expect(() => proposeReuse({ rows: [row({ codeVersion: undefined })], prior: [] })).toThrow(/lacks codeVersion/u);
    expect(() => proposeReuse({ rows: [row(), row()], prior: [] })).toThrow(/duplicate rows row id/u);
    expect(() => proposeReuse({ rows: [row()], prior: [prior({ label: undefined })] })).toThrow(/lacks label/u);
  });
});
