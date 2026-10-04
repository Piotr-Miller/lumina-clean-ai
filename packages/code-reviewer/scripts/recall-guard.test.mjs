// Hermetic tests for the R4 recall guard (change finder-verification, plan.md
// Phase 2 §3): synthetic series records, no network.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  attemptsOf,
  EMPTY_LIST_LINE,
  EXIT_EMPTY_LIST,
  evaluateRecall,
  main,
  PR_SERIES_STAGES,
  required,
} from "./recall-guard.mjs";

/** One valid attempt: `pre` = pre-verification ids, `published` = the ids that survived verification. */
const attempt = (n, pre, published = pre, overrides = {}) => ({
  kind: "attempt",
  id: `a${String(n)}`,
  attempt: n,
  stages: PR_SERIES_STAGES,
  case: "240",
  n: 10,
  g1Pass: true,
  measurementError: null,
  verification: { status: pre.length === 0 ? "no-findings" : "verified", verdicts: pre.map((id) => ({ id })) },
  findings: published.map((id) => ({ id })),
  ...overrides,
});
const DEFECTS = [{ id: "K1" }, { id: "K2" }];

/** Series where K1 is raised in `k` attempts (by F1) and published in `p` of them. */
function series(k, p, total = 10) {
  const attempts = [];
  const matches = {};
  for (let i = 1; i <= total; i += 1) {
    const raised = i <= k;
    attempts.push(attempt(i, raised ? ["F1"] : [], raised && i <= p ? ["F1"] : []));
    matches[`a${String(i)}`] = raised ? { F1: ["K1"] } : {};
  }
  return { attempts, matches };
}
const guard = (k, p) => evaluateRecall({ defects: DEFECTS, ...series(k, p) });
const k1 = (result) => result.perDefect.find((d) => d.id === "K1");

describe("the majority rule floor(k/2) + 1", () => {
  it.each([
    [2, 2],
    [3, 2],
    [10, 6],
  ])("k = %i needs %i", (k, needed) => {
    expect(required(k)).toBe(needed);
    expect(k1(guard(k, needed))).toMatchObject({ k, p: needed, pass: true });
    expect(k1(guard(k, needed - 1))).toMatchObject({ k, p: needed - 1, pass: false });
  });

  it("k = 2 with one published is FAIL — a tie is not a majority", () => {
    expect(guard(2, 1).verdict).toBe("FAIL");
  });

  it("PASS when every raised defect meets its majority; an unraised one is reported, not failed", () => {
    const result = guard(3, 2);
    expect(result.verdict).toBe("PASS");
    expect(result.perDefect.find((d) => d.id === "K2")).toMatchObject({
      k: 0,
      pass: null,
      note: "not raised — no evidence about the verifier",
    });
    expect(k1(result).detection).toEqual({ x: 2, of: 10, over: "all attempts" });
  });

  it("FAIL when one raised defect misses its majority", () => {
    expect(guard(10, 5).verdict).toBe("FAIL");
  });
});

describe("NOT PROVEN — never PASS", () => {
  it("no defect raised in any attempt", () => {
    expect(guard(0, 0).verdict).toBe("NOT PROVEN");
  });

  it("an empty defect list", () => {
    const { attempts, matches } = series(0, 0);
    expect(evaluateRecall({ defects: [], matches, attempts }).verdict).toBe("NOT PROVEN");
  });
});

describe("matching (plan-review 3rd run F5)", () => {
  it("two findings matching K in one attempt, one published and one refuted → K is published there", () => {
    const attempts = [attempt(1, ["F1", "F2"], ["F2"])];
    const result = evaluateRecall({ defects: DEFECTS, attempts, matches: { a1: { F1: ["K1"], F2: ["K1"] } } });
    expect(k1(result)).toMatchObject({ k: 1, p: 1, pass: true });
  });

  it("one finding matched to [K1, K2] raises both", () => {
    const attempts = [attempt(1, ["F1"], [])];
    const result = evaluateRecall({ defects: DEFECTS, attempts, matches: { a1: { F1: ["K1", "K2"] } } });
    expect(result.perDefect.map((d) => [d.id, d.k, d.p])).toEqual([
      ["K1", 1, 0],
      ["K2", 1, 0],
    ]);
    expect(result.verdict).toBe("FAIL");
  });

  it("counts only valid attempts: an invalid or measurement-error attempt raises nothing", () => {
    const attempts = [
      attempt(1, ["F1"], ["F1"]),
      attempt(2, ["F1"], [], { g1Pass: false }),
      attempt(3, ["F1"], [], { measurementError: 'verification status "skipped-no-source"' }),
    ];
    const result = evaluateRecall({
      defects: DEFECTS,
      attempts,
      matches: { a1: { F1: ["K1"] }, a2: { F1: ["K1"] }, a3: { F1: ["K1"] } },
    });
    expect(k1(result)).toMatchObject({ k: 1, p: 1 });
    expect(result.valid).toBe(1);
    expect(k1(result).detection).toEqual({ x: 1, of: 3, over: "all attempts" });
  });

  it.each([
    ["a pre-verification finding without an entry", { a1: {} }, /a1\/F1 has no owner-approved match entry/u],
    ["an unknown defect", { a1: { F1: ["K9"] } }, /unknown defect K9/u],
    ["an unknown attempt", { a1: { F1: [] }, a9: {} }, /attempt a9/u],
    [
      "a finding the attempt does not hold",
      { a1: { F1: [], F7: [] } },
      /a1\/F7, which is not a pre-verification finding/u,
    ],
    ["a match that is not a list", { a1: { F1: "K1" } }, /must be a list/u],
  ])("refuses %s", (_label, matches, pattern) => {
    expect(() => evaluateRecall({ defects: DEFECTS, attempts: [attempt(1, ["F1"])], matches })).toThrow(pattern);
  });

  it("refuses duplicate defect ids", () => {
    expect(() => evaluateRecall({ defects: [{ id: "K1" }, { id: "K1" }], attempts: [], matches: {} })).toThrow(
      /duplicate defect id/u,
    );
  });
});

describe("attemptsOf", () => {
  it("keeps attempt records and skips the started markers", () => {
    const text = [JSON.stringify({ kind: "started", attempt: 1 }), JSON.stringify(attempt(1, []))].join("\n");
    expect(attemptsOf(`${text}\n`).map((r) => r.id)).toEqual(["a1"]);
  });
});

// impl-review phase 2 F7.
describe("series integrity and detection over all attempts", () => {
  it("refuses a duplicate attempt id — it would be counted twice in k", () => {
    const attempts = [attempt(1, ["F1"]), { ...attempt(2, ["F1"]), id: "a1" }];
    expect(() => evaluateRecall({ defects: DEFECTS, attempts, matches: { a1: { F1: ["K1"] } } })).toThrow(
      /attempt id a1 is recorded twice/u,
    );
  });

  it("refuses a duplicate attempt number", () => {
    const attempts = [attempt(1, []), { ...attempt(2, []), attempt: 1 }];
    expect(() => evaluateRecall({ defects: DEFECTS, attempts, matches: {} })).toThrow(/attempt 1 is recorded twice/u);
  });

  it("refuses a G2 series (stages finder,verifier): not a PR series", () => {
    const attempts = [attempt(1, [], [], { stages: "finder,verifier" })];
    expect(() => evaluateRecall({ defects: DEFECTS, attempts, matches: {} })).toThrow(/not a PR series/u);
  });

  it("refuses records of two different series", () => {
    const attempts = [attempt(1, []), attempt(2, [], [], { case: "269" })];
    expect(() => evaluateRecall({ defects: DEFECTS, attempts, matches: {} })).toThrow(/more than one series/u);
  });

  it("counts detection over ALL attempts: a publish inside an invalid attempt counts in x", () => {
    const attempts = [attempt(1, ["F1"], ["F1"]), attempt(2, ["F1"], ["F1"], { g1Pass: false })];
    const result = evaluateRecall({ defects: DEFECTS, attempts, matches: { a1: { F1: ["K1"] }, a2: { F1: ["K1"] } } });
    expect(k1(result)).toMatchObject({ k: 1, p: 1 });
    expect(k1(result).detection).toEqual({ x: 2, of: 2, over: "all attempts" });
  });

  it("an invalid attempt's findings need their match entries too", () => {
    const attempts = [attempt(1, ["F1"], [], { g1Pass: false })];
    expect(() => evaluateRecall({ defects: DEFECTS, attempts, matches: {} })).toThrow(/a1\/F1 has no owner-approved/u);
  });
});

describe("impl-review a8844a6 F5 — an empty K list is information only, with its own exit code", () => {
  const runMain = (defects, { k = 0, p = 0 } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), "recall-guard-"));
    const { attempts, matches } = series(k, p);
    const paths = ["defects.json", "matches.json", "series.jsonl"].map((name) => join(dir, name));
    writeFileSync(paths[0], JSON.stringify(defects));
    writeFileSync(paths[1], JSON.stringify(matches));
    writeFileSync(paths[2], attempts.map((a) => `${JSON.stringify(a)}\n`).join(""));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = main(paths);
      return { code, out: log.mock.calls.map((call) => String(call[0])) };
    } finally {
      log.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("an empty list prints the information-only line and exits EXIT_EMPTY_LIST, not FAIL's 1", () => {
    const { code, out } = runMain([]);
    expect(EXIT_EMPTY_LIST).not.toBe(1);
    expect(code).toBe(EXIT_EMPTY_LIST);
    expect(out).toContain("R4: NOT PROVEN (empty K list — information only, gate.md §5)");
    expect(out).toContain(EMPTY_LIST_LINE);
    expect(out.some((line) => line === "R4: NOT PROVEN")).toBe(false);
  });

  it("a non-empty list with nothing raised is a plain NOT PROVEN with exit 1", () => {
    const { code, out } = runMain(DEFECTS);
    expect(code).toBe(1);
    expect(out).toContain("R4: NOT PROVEN");
    expect(out).not.toContain(EMPTY_LIST_LINE);
  });

  it("FAIL exits 1 and PASS exits 0", () => {
    expect(runMain(DEFECTS, { k: 10, p: 5 }).code).toBe(1);
    expect(runMain(DEFECTS, { k: 3, p: 2 }).code).toBe(0);
  });

  it("evaluateRecall tells the two NOT PROVEN cases apart", () => {
    const { attempts, matches } = series(0, 0);
    expect(evaluateRecall({ defects: [], matches, attempts }).notProvenReason).toBe("empty-list");
    expect(guard(0, 0).notProvenReason).toBe("none-raised");
    expect(guard(3, 2).notProvenReason).toBeNull();
  });
});
