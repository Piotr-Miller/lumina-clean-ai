import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  backtickedIdentifiers,
  EXCERPT_LIMITS,
  findTopLevelUnits,
  planExcerpts,
  type ExcerptLimits,
  type ExcerptPlan,
  type FindingExcerpt,
} from "./excerpts.js";
import type { IdentifiedFinding } from "./schemas.js";
import { readDiffScoped } from "./source-provider.js";

// Hermetic: files live in memory and reach the planner through the real
// structured reader, so allowlist and refusal behaviour are the production ones.

const ROOT = join("/repo");

const readerFor = (files: Record<string, string>) =>
  readDiffScoped({
    allowedPaths: new Set(Object.keys(files)),
    root: ROOT,
    realpath: (path) => path,
    isRegularFile: () => true,
    readFile: (path) => {
      const relative = Object.keys(files).find((name) => join(ROOT, name) === path);
      if (relative === undefined) throw new Error("ENOENT");
      return files[relative];
    },
  });

const plan = (
  files: Record<string, string>,
  findings: IdentifiedFinding[],
  limits: ExcerptLimits = EXCERPT_LIMITS,
): ExcerptPlan => {
  const read = readerFor(files);
  return planExcerpts({ findings, read, diffPaths: read.paths, limits });
};

const finding = (overrides: Partial<IdentifiedFinding> & { id: string }): IdentifiedFinding => ({
  file: "src/a.ts",
  severity: "minor",
  category: "correctness",
  description: "d",
  suggestion: "s",
  ...overrides,
});

/** `count` numbered filler lines, `// n`, starting at `from`. */
const filler = (from: number, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `// line ${String(from + index)}`);

const blocksOf = (result: ExcerptPlan, id: string) => {
  const entry: FindingExcerpt | undefined = Object.hasOwn(result.perFinding, id) ? result.perFinding[id] : undefined;
  if (entry === undefined || !("blockIds" in entry)) throw new Error(`no blocks for ${id}: ${JSON.stringify(entry)}`);
  return result.blocks.filter((block) => entry.blockIds.includes(block.blockId));
};

const spans = (result: ExcerptPlan, id: string) =>
  blocksOf(result, id).map((block) => `${block.path}:${String(block.startLine)}-${String(block.endLine)}`);

describe("findTopLevelUnits — E2's grammar", () => {
  it("finds JS/TS functions, arrow consts and classes, each ending at its column-0 closing line", () => {
    const lines = [
      'import x from "x";',
      "",
      "export async function load(a) {",
      "  return a;",
      "}",
      "const helper = (b) => {",
      "  return b;",
      "};",
      "export default class Store {",
      "  get() {}",
      "}",
    ];
    expect(findTopLevelUnits("src/a.ts", lines)).toEqual([
      { name: "load", start: 3, end: 5 },
      { name: "helper", start: 6, end: 8 },
      { name: "Store", start: 9, end: 11 },
    ]);
  });

  it("does not end a unit on `}: Props) {` — a multi-line destructured signature runs to its real `}`", () => {
    const lines = [
      "export function Panel({",
      "  title,",
      "  body,",
      "}: Props) {",
      "  const x = title;",
      "  return body;",
      "}",
    ];
    expect(findTopLevelUnits("src/Panel.tsx", lines)).toEqual([{ name: "Panel", start: 1, end: 7 }]);
  });

  it("treats a typed const arrow as a unit", () => {
    const lines = ["export const handler: Handler = async (req) => {", "  return req;", "};"];
    expect(findTopLevelUnits("src/h.ts", lines)).toEqual([{ name: "handler", start: 1, end: 3 }]);
  });

  it("confirms an arrow whose parameter list spans lines", () => {
    const lines = ["export const make = async (", "  a: number,", "): Promise<void> => {", "  await a;", "};"];
    expect(findTopLevelUnits("src/m.ts", lines)).toEqual([{ name: "make", start: 1, end: 5 }]);
  });

  it("does not treat a non-function const as a unit", () => {
    const lines = ["export const STRINGS = {", '  title: "t",', "} as const;", "const total = (a + b) * 2;"];
    expect(findTopLevelUnits("src/strings.ts", lines)).toEqual([]);
  });

  it("ends a one-line unit on its own line", () => {
    const lines = ["export const double = (n) => n * 2;", "function id(x) { return x; }", "// tail"];
    expect(findTopLevelUnits("src/one.ts", lines)).toEqual([
      { name: "double", start: 1, end: 1 },
      { name: "id", start: 2, end: 2 },
    ]);
  });

  it("finds Python def / async def / class, ending at the last code line before the next column-0 statement", () => {
    const lines = [
      "import os",
      "",
      "def decode(path,",
      "):",
      "    return path",
      "",
      "# a comment between units",
      "@decorator",
      "async def main():",
      "    pass",
      "class Box:",
      "    x = 1",
      "",
    ];
    expect(findTopLevelUnits("scripts/d.py", lines)).toEqual([
      { name: "decode", start: 3, end: 5 },
      { name: "main", start: 9, end: 10 },
      { name: "Box", start: 11, end: 12 },
    ]);
  });

  // impl-review phase 1 F6: a column-0 line inside a triple-quoted string is
  // string content, not the next statement.
  it("does not end a Python def on a column-0 line inside a triple-quoted string", () => {
    const lines = [
      "def usage():",
      '    text = """',
      "Usage: run [options]",
      "  --all  everything",
      '"""',
      "    return text",
      "",
      "def main():",
      "    pass",
    ];
    expect(findTopLevelUnits("scripts/u.py", lines)).toEqual([
      { name: "usage", start: 1, end: 6 },
      { name: "main", start: 8, end: 9 },
    ]);
  });

  it("does not start a Python unit on a `def` line inside a module-level string", () => {
    const lines = ['DOC = """', "def not_a_unit():", '"""', "def real():", "    pass"];
    expect(findTopLevelUnits("scripts/doc.py", lines)).toEqual([{ name: "real", start: 4, end: 5 }]);
  });

  // impl-review phase 1 F6: an expression-bodied arrow with no `;` has no
  // closing line, and must not run on into the next top-level statement.
  it("ends a JS arrow const without `;` before the next top-level statement", () => {
    const lines = [
      "const inc = (a) => a + 1",
      "",
      "// config",
      "export const CONFIG = {",
      "  retries: 2,",
      "};",
      "export const twice = (a) =>",
      "  inc(inc(a))",
      "export function last() {",
      "}",
    ];
    expect(findTopLevelUnits("src/c.ts", lines)).toEqual([
      { name: "inc", start: 1, end: 1 },
      { name: "twice", start: 7, end: 8 },
      { name: "last", start: 9, end: 10 },
    ]);
  });

  it("gives other file types no units", () => {
    expect(findTopLevelUnits("README.md", ["function x() {", "}"])).toEqual([]);
  });
});

describe("backtickedIdentifiers", () => {
  it("returns identifiers in order of appearance, deduped, with calls and member access reduced", () => {
    expect(backtickedIdentifiers("`main()` calls `img.draft()` then `main` and `--all` and `a b`")).toEqual([
      "main",
      "draft",
    ]);
  });
});

describe("planExcerpts — E1 module header", () => {
  it("is lines 1 … h − 1 before the first unit, capped at 40", () => {
    const file = [...filler(1, 50), "function f() {", "  return 1;", "}"].join("\n");
    const result = plan({ "src/a.ts": file }, [finding({ id: "F1", startLine: 52 })]);
    expect(spans(result, "F1")).toEqual(["src/a.ts:1-40", "src/a.ts:51-53"]);
  });

  it("is absent when the first unit starts on line 1", () => {
    const file = ["function f() {", "  return 1;", "}"].join("\n");
    expect(spans(plan({ "src/a.ts": file }, [finding({ id: "F1", startLine: 2 })]), "F1")).toEqual(["src/a.ts:1-3"]);
  });

  it("is lines 1 … min(40, total) in a file with zero units (plan-review 3rd run F2)", () => {
    const file = ["export const STRINGS = {", '  a: "a",', "} as const;"].join("\n");
    const result = plan({ "src/s.ts": file }, [finding({ id: "F1", file: "src/s.ts" })]);
    expect(spans(result, "F1")).toEqual(["src/s.ts:1-3"]);

    const tests = ['describe("x", () => {', ...filler(2, 60), "});"].join("\n");
    const onlyDescribe = plan({ "t/x.test.ts": tests }, [finding({ id: "F1", file: "t/x.test.ts" })]);
    expect(spans(onlyDescribe, "F1")).toEqual(["t/x.test.ts:1-40"]);
  });
});

describe("planExcerpts — E2 enclosing unit, snapping and fallback", () => {
  it("delivers every unit intersecting the cited range, whole", () => {
    const file = ['import x from "x";', "function a() {", "  x();", "}", "function b() {", "  x();", "}"].join("\n");
    const result = plan({ "src/a.ts": file }, [finding({ id: "F1", startLine: 3, endLine: 6 })]);
    expect(spans(result, "F1")).toEqual(["src/a.ts:1-7"]);
  });

  it("windows a unit longer than 80 lines to ±30 around the cited range, plus its first line", () => {
    const body = filler(3, 100).map((line) => `  ${line}`);
    const file = ['import x from "x";', "function big() {", ...body, "}"].join("\n");
    const result = plan({ "src/a.ts": file }, [finding({ id: "F1", startLine: 60 })]);
    expect(spans(result, "F1")).toEqual(["src/a.ts:1-2", "src/a.ts:30-90"]);
  });

  it("snaps to the first two backticked identifiers naming a same-file unit when no unit intersects", () => {
    const file = [
      'import x from "x";',
      "",
      "function one() {",
      "}",
      "function two() {",
      "}",
      "function three() {",
      "}",
    ].join("\n");
    const result = plan({ "src/a.ts": file }, [
      finding({ id: "F1", startLine: 1, description: "`three` and `one()` and `two` misuse `x`" }),
    ]);
    expect(spans(result, "F1")).toEqual(["src/a.ts:1-4", "src/a.ts:7-8"]);
  });

  it("falls back to ±25 lines around the cited range when nothing snaps", () => {
    const file = [...filler(1, 100), "function f() {", "}"].join("\n");
    const result = plan({ "src/a.ts": file }, [finding({ id: "F1", startLine: 70 })]);
    expect(spans(result, "F1")).toEqual(["src/a.ts:1-40", "src/a.ts:45-95"]);
  });

  it("treats a cited span over 60 lines as file-level: header plus snapping only", () => {
    const file = [...filler(1, 5), "function f() {", ...filler(7, 100), "}"].join("\n");
    const result = plan({ "src/a.ts": file }, [finding({ id: "F1", startLine: 6, endLine: 70 })]);
    expect(spans(result, "F1")).toEqual(["src/a.ts:1-5"]);
  });

  it("gives a finding with no line only the header and its snapped units", () => {
    const file = ["// header", "function f() {", "}", "function g() {", "}"].join("\n");
    const result = plan({ "src/a.ts": file }, [finding({ id: "F1", description: "`g` leaks" })]);
    expect(spans(result, "F1")).toEqual(["src/a.ts:1-1", "src/a.ts:4-5"]);
  });
});

describe("planExcerpts — E3 callers and E4 cross-file", () => {
  // D13's shape: the claim cites the callee, and the guard that refutes it
  // lives in the caller. An excerpt of the callee alone confirms a false claim.
  it("includes the caller's call site of a cited callee (D13)", () => {
    const callee = ["def build_photo(path):", "    return open(path)"];
    const caller = [
      "def main():",
      ...Array.from({ length: 30 }, (_, index) => `    step_${String(index)}()`),
      "    if not exists(p):",
      "        return",
      "    build_photo(p)",
    ];
    const file = ["import os", "", ...callee, "", ...caller, ""].join("\n");
    const result = plan({ "scripts/d.py": file }, [finding({ id: "F1", file: "scripts/d.py", startLine: 4 })]);
    // Header 1-2, the callee 3-4, then main's first line (6) and its call site
    // at 39 with ±20 clipped to main (19-39).
    expect(spans(result, "F1")).toEqual(["scripts/d.py:1-4", "scripts/d.py:6-6", "scripts/d.py:19-39"]);
  });

  it("takes at most two call sites, first by line", () => {
    const file = [
      "function target() {",
      "}",
      "function a() {",
      "  target();",
      "}",
      "function b() {",
      "  target();",
      "}",
      "function c() {",
      "  target();",
      "}",
    ].join("\n");
    const result = plan({ "src/a.ts": file }, [finding({ id: "F1", startLine: 1 })]);
    expect(spans(result, "F1")).toEqual(["src/a.ts:1-8"]);
  });

  it("adds the first 40 lines of a unit another diff file defines, for a backticked identifier", () => {
    const helper = ["export function parse(x) {", ...filler(2, 60).map((line) => `  ${line}`), "}"].join("\n");
    const user = ["// header", "export function run() {", "  parse(1);", "}"].join("\n");
    const result = plan({ "src/user.ts": user, "src/helper.ts": helper }, [
      finding({ id: "F1", file: "src/user.ts", startLine: 3, description: "`parse` throws on 1" }),
    ]);
    expect(spans(result, "F1")).toEqual(["src/user.ts:1-4", "src/helper.ts:1-40"]);
  });

  it("takes at most the first two cross-file identifiers (E4)", () => {
    const unit = (name: string) => [`export function ${name}() {`, "  return 1;", "}"].join("\n");
    const user = ["// header", "export function run() {", "  one(); two(); three();", "}"].join("\n");
    const result = plan(
      { "src/user.ts": user, "src/one.ts": unit("one"), "src/two.ts": unit("two"), "src/three.ts": unit("three") },
      [finding({ id: "F1", file: "src/user.ts", startLine: 3, description: "`three` then `one` then `two` fail" })],
    );
    // Order of appearance in the description, capped at two: `three`, `one`.
    expect(spans(result, "F1")).toEqual(["src/user.ts:1-4", "src/three.ts:1-3", "src/one.ts:1-3"]);
  });

  // Owner interpretation 2 (2026-10-04): a unit snapped by name is included
  // whole — even over 80 lines — and its same-file callers (E3) come with it.
  it("includes a unit snapped by name whole, over 80 lines, with its E3 callers", () => {
    const body = filler(3, 100).map((line) => `  ${line}`);
    const file = ['import x from "x";', "function big() {", ...body, "}", "function caller() {", "  big();", "}"].join(
      "\n",
    );
    const result = plan({ "src/a.ts": file }, [finding({ id: "F1", description: "`big` never returns" })]);
    // Header 1, `big` 2-103 whole, `caller` 104-106 (first line plus its call site).
    expect(spans(result, "F1")).toEqual(["src/a.ts:1-106"]);
  });
});

describe("planExcerpts — limits, merging and refusals", () => {
  it("marks a finding over the per-finding line limit excerpt-over-limit, never truncated", () => {
    const file = Array.from({ length: 300 }, (_, index) => `// ${String(index + 1)}`).join("\n");
    const result = plan({ "src/a.ts": file }, [finding({ id: "F1", startLine: 100 })], {
      ...EXCERPT_LIMITS,
      perFindingLines: 50,
    });
    expect(result.perFinding.F1).toMatchObject({ unverifiable: "excerpt-over-limit" });
    expect(result.blocks).toEqual([]);
  });

  it("marks a finding over the sealed 16,000-character limit excerpt-over-limit, though under the line limit", () => {
    const wide = "x".repeat(400);
    const file = ["// h", "function f() {", ...Array.from({ length: 50 }, () => `  ${wide}`), "}"].join("\n");
    const result = plan({ "src/a.ts": file }, [finding({ id: "F1", startLine: 3 })]);
    expect(result.perFinding.F1).toMatchObject({ unverifiable: "excerpt-over-limit" });
    expect((result.perFinding.F1 as { detail: string }).detail).toMatch(
      /^53 lines \/ \d+ chars .* 220 lines \/ 16000 chars$/,
    );
    expect(result.blocks).toEqual([]);
  });

  // impl-review phase 1 F4: past the cap, the reason is `review-budget`
  // whatever the finding's own size.
  it("marks a finding past the 25-finding cap review-budget even when it is also over its own limit", () => {
    const small = "// h\nfunction f() {\n}";
    const big = Array.from({ length: 300 }, (_, index) => `// ${String(index + 1)}`).join("\n");
    const findings = [finding({ id: "F1", startLine: 2 }), finding({ id: "F2", file: "src/b.ts", startLine: 150 })];
    const limits = { ...EXCERPT_LIMITS, perFindingLines: 60 };
    const files = { "src/a.ts": small, "src/b.ts": big };
    // Under the cap F2 is over its own limit …
    expect(plan(files, findings, limits).perFinding.F2).toMatchObject({ unverifiable: "excerpt-over-limit" });
    // … past it, the cap decides.
    const capped = plan(files, findings, { ...limits, maxFindings: 1 });
    expect(capped.perFinding.F1).toHaveProperty("blockIds");
    expect(capped.perFinding.F2).toMatchObject({ unverifiable: "review-budget" });
  });

  it("merges overlapping findings in one file into one block that both list (D2)", () => {
    const file = ["// header", "async function main() {", ...filler(3, 20).map((line) => `  ${line}`), "}"].join("\n");
    const result = plan({ "src/a.ts": file }, [
      finding({ id: "F1", startLine: 5 }),
      finding({ id: "F2", startLine: 9, category: "performance" }),
    ]);
    expect(result.blocks.map((block) => block.blockId)).toEqual(["B1"]);
    expect(result.perFinding).toEqual({ F1: { blockIds: ["B1"] }, F2: { blockIds: ["B1"] } });
  });

  it("verifies at most 25 findings; the 26th is review-budget", () => {
    const file = Array.from({ length: 30 }, (_, index) => `function f${String(index)}() {\n}`).join("\n");
    const findings = Array.from({ length: 26 }, (_, index) =>
      finding({ id: `F${String(index + 1)}`, startLine: index * 2 + 1 }),
    );
    const result = plan({ "src/a.ts": file }, findings);
    expect(result.perFinding.F25).toHaveProperty("blockIds");
    expect(result.perFinding.F26).toMatchObject({ unverifiable: "review-budget" });
  });

  it("refuses a finding whose new lines would cross the review's character budget", () => {
    const wide = "x".repeat(100);
    const file = Array.from({ length: 4 }, (_, index) => `function f${String(index)}() {\n  ${wide}\n}`).join("\n");
    const one = plan({ "src/a.ts": file }, [finding({ id: "F1", startLine: 1 })]);
    const result = plan(
      { "src/a.ts": file },
      [finding({ id: "F1", startLine: 1 }), finding({ id: "F2", startLine: 4 })],
      {
        ...EXCERPT_LIMITS,
        perReviewChars: one.telemetry.chars + 10,
      },
    );
    expect(result.perFinding.F1).toHaveProperty("blockIds");
    expect(result.perFinding.F2).toMatchObject({ unverifiable: "review-budget" });
  });

  it("marks a refused read source-refused, keeping the reader's reason", () => {
    const result = plan({ "src/a.ts": "x" }, [finding({ id: "F1", file: "src/other.ts", startLine: 1 })]);
    expect(result.perFinding.F1).toMatchObject({ unverifiable: "source-refused" });
    expect((result.perFinding.F1 as { detail: string }).detail).toContain("not part of the reviewed diff");
  });

  it("marks a directory-level testing claim with no line no-locator — no file-list block exists", () => {
    const result = plan({ "scripts/s17/a.ts": "function a() {\n}" }, [
      finding({ id: "F1", file: "scripts/s17", category: "testing" }),
    ]);
    expect(result.perFinding.F1).toMatchObject({ unverifiable: "no-locator" });
  });

  it("marks a finding with no line, no header and no snapped unit no-locator", () => {
    const result = plan({ "src/a.ts": "function a() {\n}" }, [finding({ id: "F1", category: "testing" })]);
    expect(result.perFinding.F1).toMatchObject({ unverifiable: "no-locator" });
  });
});

describe("planExcerpts — rendering and determinism", () => {
  it("renders `NNNN| text`, marks cited lines `NNNN>| text`, and pads to the file's line-count width", () => {
    const file = ["// h", ...filler(2, 8), "function f() {", "  return 1;", "}"].join("\n");
    const result = plan({ "src/a.ts": file }, [finding({ id: "F1", startLine: 11 })]);
    const lines = result.blocks[0].text.split("\n");
    expect(lines[0]).toBe(" 1| // h");
    expect(lines.slice(-3)).toEqual(["10| function f() {", "11>|   return 1;", "12| }"]);
  });

  it("does not count a trailing newline as a line", () => {
    const result = plan({ "src/a.ts": "// h\nfunction f() {\n}\n" }, [finding({ id: "F1", startLine: 2 })]);
    expect(result.blocks[0].endLine).toBe(3);
  });

  it("is deterministic: the same input yields byte-identical blocks", () => {
    const files = { "src/a.ts": ["// h", "function f() {", "  g();", "}", "function g() {", "}"].join("\n") };
    const findings = [finding({ id: "F1", startLine: 3 }), finding({ id: "F2", startLine: 5 })];
    expect(JSON.stringify(plan(files, findings))).toBe(JSON.stringify(plan(files, findings)));
  });

  it("reports telemetry over the delivered blocks", () => {
    const result = plan({ "src/a.ts": "// h\nfunction f() {\n}" }, [finding({ id: "F1", startLine: 2 })]);
    expect(result.telemetry).toEqual({ blocks: 1, lines: 3, chars: result.blocks[0].text.length });
  });
});
