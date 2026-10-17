// Hermetic tests for the hand-read sheet and resolver of change
// `finder-glm-5-3` (plan.md Phase 3 §3, Testing Strategy "Resolver"), with
// change `finder-glm-5-3-high`'s D2 from the ledger and its --dry-run (its
// plan.md Phase 2 §3 and §4).
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { isD2Candidate } from "./glm-gate-core.mjs";
import {
  allowedRejections,
  buildSheet,
  ledgerD2Of,
  main,
  parseVerdicts,
  resolveCase,
  sha256,
} from "./glm-gate-sheet.mjs";

const CHANGE_DIR = resolve(import.meta.dirname, "..", "..", "..", "context", "changes", "finder-glm-5-3-high");
/** The owner's d2 lines, as a ledger holds them. */
const ledger = (...lines) => ledgerD2Of(lines.map((line) => ({ type: "d2", note: "n", by: "owner", ...line })));

const finding = (id, over = {}) => ({
  id,
  file: "src/a.ts",
  startLine: 3,
  endLine: 9,
  severity: "major",
  category: "bug",
  description: "The upload is never deleted | on the missing-URL exit.",
  suggestion: "Delete it in a `finally`:\n```ts\ncleanup();\n```",
  ...over,
});
const run = (stepId, findings) => ({ stepId, reviewSha256: "a".repeat(64), findings });

/** Fills the Verdict cell of the given ids, as the owner would. */
const fill = (sheet, verdicts) =>
  sheet
    .split("\n")
    .map((line) => {
      const id = Object.keys(verdicts).find((key) => line.startsWith(`| ${key} |`));
      return id === undefined ? line : line.replace(/\| *\|$/u, `| ${verdicts[id]} |`);
    })
    .join("\n");

describe("allowedRejections — ceil(0.05 × N)", () => {
  it.each([
    [0, 0],
    [1, 1],
    [20, 1],
    [21, 2],
    [40, 2],
  ])("N = %i allows %i", (n, allowed) => {
    expect(allowedRejections(n)).toBe(allowed);
  });
});

describe("buildSheet", () => {
  const sheet = buildSheet(
    "pr269",
    [run("pr269-01", [finding("F1"), finding("F2", { file: "scripts/spikes/bread-spike.ts" })])],
    {
      at: "2026-10-13T00:00:00.000Z",
    },
  );

  it("has one row per published finding with an empty verdict cell, and pre-flags D2 candidates only", () => {
    expect(sheet).toContain("| pr269-01#F1 | major | bug | `src/a.ts:3-9` |  | |");
    expect(sheet).toContain("| pr269-01#F2 | major | bug | `scripts/spikes/bread-spike.ts:3-9` | D2? | |");
  });

  it("keeps description and suggestion verbatim, fenced longer than any backtick run they contain", () => {
    expect(sheet).toContain("The upload is never deleted | on the missing-URL exit.");
    expect(sheet).toContain("````text\nDelete it in a `finally`:\n```ts\ncleanup();\n```\n````");
  });

  it("records the sha256 of everything above its trailer, as generated", () => {
    const [body, trailer] = sheet.split("\n<!-- generated sha256 of every line above this one: ");
    expect(trailer).toBe(`${sha256(body)} -->\n`);
  });

  it("lists each run with N and its review.json sha256, zero-finding runs included", () => {
    const empty = buildSheet("pr247", [run("pr247-01", [])], { at: "t" });
    expect(empty).toContain(`| pr247-01 | 0 | 0 | \`${"a".repeat(64)}\` |`);
    expect(empty).not.toContain("D2?");
  });

  it("the D2? flag is the core's candidate predicate: the file, or a D2 term in the text", () => {
    expect(isD2Candidate({ file: "scripts/spikes/bread-spike.ts" })).toBe(true);
    expect(isD2Candidate({ file: "scripts/spikes/other.ts", description: "the urls.get miss leaks" })).toBe(true);
    expect(isD2Candidate({ file: "scripts/spikes/other.ts" })).toBe(false);
    const flagged = buildSheet(
      "pr269",
      [run("pr269-01", [finding("F1", { suggestion: "call deleteUpload() first" })])],
      { at: "t" },
    );
    expect(flagged).toContain("| pr269-01#F1 | major | bug | `src/a.ts:3-9` | D2? | |");
  });

  it("pre-fills D2 on the findings the ledger approved, and says those rows are decided", () => {
    const runs = [run("pr269-01", [finding("F1"), finding("F2", { file: "scripts/spikes/bread-spike.ts" })])];
    const sheet = buildSheet("pr269", runs, {
      at: "t",
      ledgerD2: ledger({ stepId: "pr269-01", decision: "match", matches: ["F2"] }),
    });
    expect(sheet).toContain("| pr269-01#F2 | major | bug | `scripts/spikes/bread-spike.ts:3-9` | D2? | D2 |");
    expect(sheet).toContain("| pr269-01#F1 | major | bug | `src/a.ts:3-9` |  | |");
    expect(sheet).toMatch(/Rows pre-filled `D2` are DECIDED/u);
  });
});

describe("resolveCase", () => {
  const sheetFor = (caseKey, runs, verdicts) => parseVerdicts(fill(buildSheet(caseKey, runs, { at: "t" }), verdicts));

  it("#247 with N = 0 passes", () => {
    const runs = [run("pr247-01", [])];
    const { results, problems } = resolveCase("pr247", runs, sheetFor("pr247", runs, {}));
    expect(problems).toEqual([]);
    expect(results).toEqual([
      {
        stepId: "pr247-01",
        reviewSha256: "a".repeat(64),
        n: 0,
        rejected: 0,
        unresolved: 0,
        allowed: 0,
        d2: 0,
        pass: true,
      },
    ]);
  });

  it("#269 without a D2 fails, even with every finding accepted", () => {
    const runs = [run("pr269-01", [finding("F1")])];
    const ledgerD2 = ledger({ stepId: "pr269-01", decision: "no-match", matches: [] });
    const { results, problems } = resolveCase("pr269", runs, sheetFor("pr269", runs, { "pr269-01#F1": "accept" }), {
      ledgerD2,
    });
    expect(problems).toEqual([]);
    expect(results[0]).toMatchObject({ rejected: 0, d2: 0, pass: false });
  });

  it("#269 with N = 0 fails (no D2)", () => {
    const runs = [run("pr269-01", [])];
    expect(resolveCase("pr269", runs, sheetFor("pr269", runs, {})).results[0].pass).toBe(false);
  });

  it("an unresolved finding counts as rejected", () => {
    const runs = [run("pr269-01", [finding("F1"), finding("F2")])];
    const ledgerD2 = ledger({ stepId: "pr269-01", decision: "match", matches: ["F1"] });
    const { results } = resolveCase("pr269", runs, sheetFor("pr269", runs, { "pr269-01#F1": "D2" }), { ledgerD2 });
    // N = 2 allows 1 rejection: the one unresolved finding uses it.
    expect(results[0]).toMatchObject({ n: 2, rejected: 1, unresolved: 1, allowed: 1, d2: 1, pass: true });
  });

  it("two rejections at N = 20 fail; one passes", () => {
    const findings = Array.from({ length: 20 }, (_, i) => finding(`F${String(i + 1)}`));
    const runs = [run("pr247-01", findings)];
    const accept = Object.fromEntries(findings.map((f) => [`pr247-01#${f.id}`, "accept"]));
    const one = resolveCase("pr247", runs, sheetFor("pr247", runs, { ...accept, "pr247-01#F1": "reject" }));
    const two = resolveCase(
      "pr247",
      runs,
      sheetFor("pr247", runs, { ...accept, "pr247-01#F1": "reject", "pr247-01#F2": "nope" }),
    );
    expect(one.results[0].pass).toBe(true);
    expect(two.results[0]).toMatchObject({ rejected: 2, unresolved: 1, pass: false });
  });

  it("a D2 verdict on #247 is not a verdict there: it counts as unresolved", () => {
    const runs = [run("pr247-01", [finding("F1")])];
    const { results } = resolveCase("pr247", runs, sheetFor("pr247", runs, { "pr247-01#F1": "D2" }));
    expect(results[0]).toMatchObject({ unresolved: 1, rejected: 1, allowed: 1, pass: true });
  });

  it("names a finding missing from the sheet and a row that is not a finding of a valid run", () => {
    const runs = [run("pr247-01", [finding("F1"), finding("F2")])];
    const sheet = buildSheet("pr247", [run("pr247-01", [finding("F1")]), run("pr247-02", [finding("F1")])], {
      at: "t",
    });
    const { problems } = resolveCase("pr247", runs, parseVerdicts(sheet));
    expect(problems).toEqual([
      "pr247-02#F1 is not a published finding of a valid run",
      "pr247-01#F2 is missing from the sheet",
    ]);
  });

  // Owner decision 2026-10-16 (a): the ledger's D2 is final; the sheet cannot move it.
  it("takes D2 from the ledger and flags a sheet that disagrees, either way", () => {
    const runs = [run("pr269-01", [finding("F1"), finding("F2"), finding("F3")])];
    const ledgerD2 = ledger({ stepId: "pr269-01", decision: "match", matches: ["F1"] });
    const { results, problems } = resolveCase(
      "pr269",
      runs,
      sheetFor("pr269", runs, { "pr269-01#F1": "accept", "pr269-01#F2": "D2", "pr269-01#F3": "accept" }),
      { ledgerD2 },
    );
    expect(problems).toEqual([
      "pr269-01#F1 is approved as D2 in the ledger, but the sheet says `accept`",
      "pr269-01#F2 is D2 in the sheet, but the ledger approved no such match",
    ]);
    // The ledger's count stands: F1 is D2, F2 counts as unresolved.
    expect(results[0]).toMatchObject({ d2: 1, unresolved: 1, rejected: 1 });
  });

  it("names a #269 run with no D2 decision in the ledger", () => {
    const runs = [run("pr269-01", [finding("F1")])];
    const { problems } = resolveCase("pr269", runs, sheetFor("pr269", runs, { "pr269-01#F1": "accept" }));
    expect(problems).toEqual(["pr269-01: no D2 decision in the ledger"]);
  });

  it("reads verdicts from a reformatted table (padded cells)", () => {
    const { verdicts } = parseVerdicts("| pr269-01#F1   | major | bug | `a.ts` | D2? |   D2   |\n");
    expect(verdicts.get("pr269-01#F1")).toBe("D2");
  });
});

describe("main — sheet and resolve on a recorded series", () => {
  it("writes both sheets from the valid runs, then resolves the owner's verdicts", () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-gate-sheet-"));
    const results = join(dir, "results");
    mkdirSync(results);
    const review = (findings) => `${JSON.stringify({ findings }, null, 2)}\n`;
    const files = {
      "pr247-01": review([]),
      "pr269-01": review([finding("F1", { file: "scripts/spikes/bread-spike.ts" })]),
    };
    for (const [stepId, text] of Object.entries(files)) writeFileSync(join(results, `${stepId}.review.json`), text);
    const series = join(dir, "series.jsonl");
    const record = (stepId, kind, valid) =>
      JSON.stringify({ type: "record", stepId, kind, valid, reviewSha256: valid ? sha256(files[stepId]) : null });
    writeFileSync(
      series,
      [
        record("pr247-01", "pr247", true),
        record("pr269-01", "pr269", true),
        JSON.stringify({ type: "d2", stepId: "pr269-01", decision: "match", matches: ["F1"], note: "n", by: "owner" }),
        record("pr269-02", "pr269", false),
      ].join("\n") + "\n",
    );

    const lines = [];
    const log = (line) => lines.push(line);
    const common = ["--dry-run", "--series", series, "--results", results];
    expect(main(["sheet", ...common, "--out-dir", dir], { log, now: () => new Date(0) })).toBe(0);
    const sheet269 = readFileSync(join(dir, "hand-read-269.md"), "utf8");
    // The ledger's D2 is pre-filled; the owner fills nothing for it.
    expect(sheet269).toContain("| pr269-01#F1 | major | bug | `scripts/spikes/bread-spike.ts:3-9` | D2? | D2 |");
    expect(sheet269).not.toContain("pr269-02");
    expect(readFileSync(series, "utf8")).toContain('"type":"sheet"');

    // Unfilled #247 has no findings, so the pre-filled sheets already pass.
    const out = join(dir, "result.json");
    expect(main(["resolve", ...common, "--sheets-dir", dir, "--out", out], { log })).toBe(0);
    // A sheet that drops the ledger's D2 is flagged, and fails.
    writeFileSync(join(dir, "hand-read-269.md"), sheet269.replace("| D2? | D2 |", "| D2? | accept |"));
    expect(main(["resolve", ...common, "--sheets-dir", dir], { log })).toBe(1);
    expect(lines.join("\n")).toMatch(/pr269-01#F1 is approved as D2 in the ledger, but the sheet says `accept`/u);
    writeFileSync(join(dir, "hand-read-269.md"), sheet269);
    expect(JSON.parse(readFileSync(out, "utf8"))).toMatchObject({
      pass: true,
      problems: [],
      cases: {
        pr247: [{ stepId: "pr247-01", reviewSha256: sha256(files["pr247-01"]) }],
        pr269: [{ stepId: "pr269-01", reviewSha256: sha256(files["pr269-01"]) }],
      },
    });
  });

  it("refuses a stored review.json that differs from its recorded sha256", () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-gate-sheet-"));
    writeFileSync(join(dir, "pr247-01.review.json"), '{"findings":[]}');
    const series = join(dir, "series.jsonl");
    writeFileSync(
      series,
      `${JSON.stringify({ type: "record", stepId: "pr247-01", kind: "pr247", valid: true, reviewSha256: "0".repeat(64) })}\n`,
    );
    const lines = [];
    expect(
      main(["sheet", "--dry-run", "--series", series, "--results", dir, "--out-dir", dir], {
        log: (l) => lines.push(l),
      }),
    ).toBe(1);
    expect(lines.join("\n")).toMatch(/pr247-01: stored review\.json differs from its recorded sha256/u);
  });

  it("exits 2 on a usage error", () => {
    expect(main(["bogus"], { log: () => undefined })).toBe(2);
  });

  // Amendment 1 as code (this change's plan.md H8).
  it.each([
    ["sheet", "--series"],
    ["sheet", "--results"],
    ["sheet", "--out-dir"],
    ["resolve", "--sheets-dir"],
  ])("%s refuses %s without --dry-run, writing nothing", (command, flag) => {
    const dir = mkdtempSync(join(tmpdir(), "glm-gate-sheet-"));
    const lines = [];
    expect(main([command, flag, dir], { log: (l) => lines.push(l) })).toBe(2);
    expect(lines[0]).toMatch(new RegExp(`REFUSED \\(path override without --dry-run\\): ${flag}`, "u"));
    expect(existsSync(join(dir, "hand-read-269.md"))).toBe(false);
  });

  it.each([
    ["sheet", ["--out-dir", CHANGE_DIR], "--out-dir"],
    ["sheet", ["--series", join(CHANGE_DIR, "gate", "series.jsonl")], "--series"],
    ["resolve", ["--out", join(CHANGE_DIR, "result.json")], "--out"],
  ])("a dry-run %s refuses to write into the change folder (%s)", (command, paths, flag) => {
    const dir = mkdtempSync(join(tmpdir(), "glm-gate-sheet-"));
    const lines = [];
    const args = [
      command,
      "--dry-run",
      "--series",
      join(dir, "series.jsonl"),
      "--out-dir",
      dir,
      "--sheets-dir",
      dir,
      ...paths,
    ];
    expect(main(args, { log: (l) => lines.push(l) })).toBe(2);
    expect(lines[0]).toMatch(new RegExp(`REFUSED \\(dry run writing into the change folder\\): ${flag}`, "u"));
    expect(existsSync(join(CHANGE_DIR, "hand-read-269.md"))).toBe(false);
    expect(existsSync(join(CHANGE_DIR, "result.json"))).toBe(false);
  });

  it.each([
    ["sheet directory alias", "sheet", "--out-dir", "directory"],
    ["new nested sheet directory below an alias", "sheet", "--out-dir", "nested-directory"],
    ["ledger file alias", "sheet", "--series", "file"],
    ["new ledger below a directory alias", "sheet", "--series", "nested-file"],
    ["resolver output file alias", "resolve", "--out", "file"],
    ["new resolver output below an alias", "resolve", "--out", "nested-file"],
    ["dangling output alias", "resolve", "--out", "dangling-file"],
    ["first sheet file alias", "sheet", "--out-dir", "hand-read-247.md"],
    ["second sheet file alias", "sheet", "--out-dir", "hand-read-269.md"],
  ])("a dry run preserves the protected files through %s", (_label, command, flag, kind) => {
    const dir = mkdtempSync(join(tmpdir(), "glm-sheet-symlink-"));
    try {
      const protectedDir = join(dir, "protected");
      const outDir = join(dir, "out");
      mkdirSync(protectedDir);
      mkdirSync(outDir);
      const sentinel = join(protectedDir, "evidence.jsonl");
      writeFileSync(sentinel, '{"type":"sentinel"}\n');
      const alias = join(dir, "alias");
      let target;
      if (kind === "directory" || kind === "nested-directory" || kind === "nested-file") {
        symlinkSync(protectedDir, alias, "junction");
        target = kind === "directory" ? alias : join(alias, "new", "nested", "output");
      } else if (kind.startsWith("hand-read-")) {
        symlinkSync(sentinel, join(outDir, kind), "file");
        target = outDir;
      } else {
        symlinkSync(kind === "dangling-file" ? join(protectedDir, "missing.json") : sentinel, alias, "file");
        target = alias;
      }
      const series = join(dir, "series.jsonl");
      writeFileSync(series, "");
      const lines = [];
      const args = [
        command,
        "--dry-run",
        "--series",
        series,
        "--results",
        dir,
        "--out-dir",
        outDir,
        "--sheets-dir",
        outDir,
        flag,
        target,
      ];
      expect(main(args, { log: (line) => lines.push(line), protectedDir })).toBe(2);
      expect(lines[0]).toMatch(
        /REFUSED \((?:dry run writing into the change folder|cannot resolve dry-run write path)\)/u,
      );
      expect(lines[0]).toContain(flag);
      expect(readFileSync(sentinel, "utf8")).toBe('{"type":"sentinel"}\n');
      expect(readdirSync(protectedDir)).toEqual(["evidence.jsonl"]);
      expect(readFileSync(series, "utf8")).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows a symlink to a scratch directory with a similar prefix", () => {
    const dir = mkdtempSync(join(tmpdir(), "glm-sheet-symlink-"));
    try {
      const protectedDir = join(dir, "protected");
      const outside = join(dir, "protected-scratch");
      mkdirSync(protectedDir);
      mkdirSync(outside);
      const alias = join(dir, "alias");
      symlinkSync(outside, alias, "junction");
      const series = join(dir, "series.jsonl");
      writeFileSync(series, "");
      expect(
        main(["sheet", "--dry-run", "--series", series, "--out-dir", join(alias, "new", "sheets")], {
          protectedDir,
          log: () => undefined,
        }),
      ).toBe(0);
      expect(existsSync(join(outside, "new", "sheets", "hand-read-247.md"))).toBe(true);
      expect(existsSync(join(outside, "new", "sheets", "hand-read-269.md"))).toBe(true);
      expect(readdirSync(protectedDir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
