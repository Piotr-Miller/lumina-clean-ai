// Hermetic tests for the hand-read sampler (change `finder-model-swap`,
// Phase 1 §4): synthetic tables, a fixed seed, no network.
import { describe, expect, it } from "vitest";

import { draw, freeze, limitFor, validateTable } from "./hand-read-sample.mjs";

const SEED = "0f".repeat(32);
const table = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `R${String(i + 1).padStart(2, "0")}`, claim: `c${String(i)}` }));
const drawn = (rows, seed = SEED) => draw(rows, { sha: freeze(rows), seed });

describe("freeze", () => {
  it("hashes content, not layout: key order does not change the sha256", () => {
    expect(freeze([{ id: "A", claim: "x" }])).toBe(freeze([{ claim: "x", id: "A" }]));
  });

  it("any content change changes the sha256", () => {
    expect(freeze([{ id: "A", claim: "x" }])).not.toBe(freeze([{ id: "A", claim: "y" }]));
  });

  it.each([
    ["a non-array", { id: "A" }],
    ["a row without an id", [{ claim: "x" }]],
    ["a duplicate id", [{ id: "A" }, { id: "A" }]],
  ])("refuses %s", (_label, value) => {
    expect(() => validateTable(value)).toThrow();
  });
});

describe("draw", () => {
  it("is reproducible: the same table and seed give the same sample", () => {
    expect(drawn(table(60))).toEqual(drawn(table(60)));
  });

  it("a different seed gives a different sample", () => {
    expect(drawn(table(60)).sample).not.toEqual(drawn(table(60), "a1".repeat(32)).sample);
  });

  it("refuses a table changed after the freeze", () => {
    const rows = table(10);
    const sha = freeze(rows);
    rows[3] = { ...rows[3], claim: "edited after the freeze" };
    expect(() => draw(rows, { sha, seed: SEED })).toThrow(/does not match the frozen/u);
  });

  it("refuses a seed that is not 32 bytes of hex", () => {
    const rows = table(5);
    expect(() => draw(rows, { sha: freeze(rows), seed: "1234" })).toThrow(/--seed/u);
  });

  it("N ≥ 40: draws 40 distinct rows, limit 2", () => {
    const result = drawn(table(55));
    expect(result).toMatchObject({ n: 55, limit: 2 });
    expect(new Set(result.sample).size).toBe(40);
  });

  it("N = 25: all 25 rows, limit 1", () => {
    const result = drawn(table(25));
    expect(result).toMatchObject({ n: 25, limit: 1 });
    expect([...result.sample].sort()).toEqual(table(25).map((r) => r.id));
  });

  it("N = 19: limit 0", () => {
    expect(drawn(table(19))).toMatchObject({ n: 19, limit: 0 });
  });

  it("N = 0: G3 FAIL, no draw", () => {
    const result = drawn([]);
    expect(result).toEqual({ n: 0, limit: 0, fail: "G3 FAIL: no findings" });
  });
});

describe("limitFor", () => {
  it.each([
    [40, 2],
    [100, 2],
    [39, 1],
    [20, 1],
    [19, 0],
    [1, 0],
  ])("N = %i → at most %i rejected", (n, limit) => {
    expect(limitFor(n)).toBe(limit);
  });
});
