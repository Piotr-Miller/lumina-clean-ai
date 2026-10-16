// Hermetic tests for the D2 decision per #269 run of change
// `finder-glm-5-3-high` (its plan.md Phase 2 §2; owner decision 2026-10-16
// (a)–(d)): the candidate predicate, the `d2` command, the pause after every
// #269 run, and the gate's early stop. A throwaway repository, a fake CLI and
// counter — no network, no key. The sheet and resolver side is in
// glm-gate-sheet.test.mjs.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  computeOutcome,
  EXPECTED_CONFIGURATION_LINE,
  isD2Candidate,
  renderOutcome,
  scheduleState,
} from "./glm-gate-core.mjs";
import { describeManifest, main, readSeries } from "./glm-gate.mjs";

const CHANGE = "context/changes/finder-glm-5-3-high";
const SEALED = [
  "packages/code-reviewer/package.json",
  "packages/code-reviewer/package-lock.json",
  "packages/code-reviewer/scripts/glm-gate.mjs",
  "packages/code-reviewer/scripts/glm-gate-core.mjs",
  "packages/code-reviewer/scripts/glm-gate-sheet.mjs",
  "packages/code-reviewer/scripts/glm-gate-dry-run-stub.mjs",
  "packages/code-reviewer/scripts/promptfoo-gate-rows.mjs",
  "packages/code-reviewer/scripts/promptfoo-regrade-config.mjs",
  "packages/code-reviewer/evals/finder-provider.ts",
  "packages/code-reviewer/evals/assertions.mjs",
  "packages/code-reviewer/evals/promptfooconfig.yaml",
  "packages/code-reviewer/evals/review-result.schema.json",
  ".github/ai-review-rules.md",
  ".github/actions/ai-review/action.yml",
  "packages/code-reviewer/src/config.ts",
  "packages/code-reviewer/evals/fixtures/clean-change.diff",
];

const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

function setup() {
  const root = mkdtempSync(join(tmpdir(), "glm-gate-d2-"));
  const repoRoot = join(root, "repo");
  const inputsDir = join(root, "inputs");
  for (const path of SEALED) write(join(repoRoot, path), `content of ${path}\n`);
  for (const pr of ["247", "269"]) {
    write(join(inputsDir, pr, "pr.diff"), `diff ${pr}\n`);
    write(join(inputsDir, pr, "rules.md"), "rules\n");
    write(join(inputsDir, pr, "meta.json"), JSON.stringify({ title: `PR ${pr}`, body: "body" }));
    mkdirSync(join(inputsDir, `wt-${pr}`), { recursive: true });
  }
  const git = (args) => (args[0] === "rev-parse" ? "abc123" : "");
  write(join(repoRoot, CHANGE, "gate-manifest.json"), JSON.stringify(describeManifest({ repoRoot, inputsDir, git })));
  return { root, repoRoot, inputsDir, git, cache: join(root, "cache") };
}

const reported = (value) => ({ value, source: "reported" });
const finding = (id, over = {}) => ({
  id,
  file: "src/other.ts",
  startLine: 4,
  severity: "major",
  category: "bug",
  description: `Finding ${id}.`,
  suggestion: "Fix it.",
  ...over,
});
const FINDINGS = [
  finding("F1", { file: "scripts/spikes/bread-spike.ts", startLine: 40, endLine: 52 }),
  finding("F2", { description: "The upload in bread-spike.ts is never deleted on the missing-URL exit." }),
  finding("F3"),
];
const reviewJson = (findings = FINDINGS) => ({
  summary: "s",
  findings,
  scores: {},
  verdict: "passed",
  models: { finder: "z-ai/glm-5.3", judge: "anthropic/claude-sonnet-5" },
  finderTelemetry: {
    cost: 0.05,
    requests: [
      {
        kind: "finalization",
        attempt: 1,
        provider: reported("Z.AI"),
        model: reported("z-ai/glm-5.3"),
        finishReason: "stop",
        reasoningTokens: reported(900),
        cost: 0.05,
      },
    ],
  },
  judgeTelemetry: { attempts: 1, cost: 0.05 },
});
const STDERR = `${EXPECTED_CONFIGURATION_LINE}\nfinder step 1: no getFileContext call (tokens in=1 out=1 total=2) kind=finalization provider=Z.AI finish=stop model=z-ai/glm-5.3 reasoning=900\n`;

const fakeCli = ({ review = reviewJson(), exitCode = 0, stderr = STDERR } = {}) =>
  vi.fn(async (args) => {
    if (review !== undefined) write(join(args[args.indexOf("--out-dir") + 1], "review.json"), JSON.stringify(review));
    return { exitCode, signal: null, stdout: "", stderr, interrupted: false };
  });

function depsFor(world, over = {}) {
  const lines = [];
  const deps = {
    repoRoot: world.repoRoot,
    packageDir: join(world.repoRoot, "packages/code-reviewer"),
    envFile: join(world.repoRoot, "packages/code-reviewer/.env"),
    env: { OPENROUTER_API_KEY: "test-key", GLM_GATE_CACHE: world.cache, GLM_GATE_INPUTS: world.inputsDir },
    git: world.git,
    readCounter: vi.fn(async () => 100),
    readEndpoints: vi.fn(async () => []),
    runCli: fakeCli(),
    runCommand: vi.fn(),
    now: () => new Date("2026-10-16T00:00:00Z"),
    sleep: vi.fn(async () => undefined),
    log: (line) => lines.push(line),
    ...over,
  };
  return { deps, lines };
}

const gateLedger = (world) => join(world.repoRoot, CHANGE, "gate/series.jsonl");
const appendLines = (path, lines) =>
  write(
    path,
    `${readSeries(path)
      .map((line) => `${JSON.stringify(line)}\n`)
      .join("")}${lines.map((line) => `${JSON.stringify(line)}\n`).join("")}`,
  );

/** A gate ledger that has passed G2, G3 and #247 and stands at G1, every step settled. */
async function atG1() {
  const world = setup();
  const ctx = depsFor(world);
  expect(await main(["preflight"], ctx.deps)).toBe(0);
  const lines = [];
  const step = (stepId, kind, cost, extra = {}) =>
    lines.push(
      { type: "started", stepId, kind },
      { type: "record", stepId, kind, valid: true, findings: [], reasons: [], ...extra },
      { type: "settled", stepId, cost },
    );
  for (let i = 1; i <= 5; i += 1) {
    step(`clean-0${String(i)}`, "clean", 0.02);
    if (i === 1) lines.push({ type: "continue", for: "probe" });
  }
  lines.push(
    { type: "started", stepId: "g3", kind: "g3" },
    { type: "g3", stepId: "g3", kind: "g3", summary: { failedRun: false, pass: true } },
    { type: "settled", stepId: "g3", cost: 0.3 },
  );
  step("pr247-01", "pr247", 0.08);
  step("pr247-02", "pr247", 0.08);
  appendLines(gateLedger(world), lines);
  return { world, ...ctx };
}

describe("D2 candidates — the term set of § Definitions", () => {
  it.each([
    ["the file", { file: "scripts/spikes/bread-spike.ts" }],
    ["bread-spike.ts in the description only", { description: "bread-spike.ts leaks its upload" }],
    ["localInput in the description", { description: "localInput never cleans up" }],
    ["deleteUpload in the suggestion", { suggestion: "call deleteUpload before returning" }],
    ["urls.get in the description", { description: "when urls.get returns undefined" }],
    ["uploadedFileId in the suggestion", { suggestion: "delete uploadedFileId in main" }],
  ])("lists a finding naming %s", (_label, over) => {
    expect(isD2Candidate(finding("F9", over))).toBe(true);
  });

  it("does not list a finding that names none of the terms", () => {
    expect(isD2Candidate(finding("F9", { description: "an unrelated defect in the uploader" }))).toBe(false);
    expect(isD2Candidate(undefined)).toBe(false);
  });
});

describe("d2 --list", () => {
  it("prints every candidate of the run's stored review.json, names the rest, and writes nothing", async () => {
    const { world, deps, lines } = await atG1();
    expect(await main(["run", "--case", "pr269", "--run-id", "pr269-01"], deps)).toBe(0);
    const before = readFileSync(gateLedger(world), "utf8");
    expect(await main(["d2", "--run", "pr269-01", "--list"], deps)).toBe(0);
    const out = lines.join("\n");
    expect(out).toMatch(
      /D2 CANDIDATES: pr269-01 \(pr269, valid, review\.json sha256 [0-9a-f]{64}\) — 2 of 3 finding\(s\)/u,
    );
    expect(out).toContain("- F1 · scripts/spikes/bread-spike.ts:40-52 · major · Finding F1.");
    expect(out).toContain("- F2 · src/other.ts:4 · major · The upload in bread-spike.ts is never deleted");
    expect(out).toContain("Not listed (no D2 term): F3.");
    expect(readFileSync(gateLedger(world), "utf8")).toBe(before);
  });

  it("refuses a stored review.json whose bytes differ from the recorded sha256", async () => {
    const { world, deps, lines } = await atG1();
    await main(["run", "--case", "pr269", "--run-id", "pr269-01"], deps);
    write(join(world.repoRoot, CHANGE, "gate/results/pr269-01.review.json"), JSON.stringify(reviewJson([])));
    expect(await main(["d2", "--run", "pr269-01", "--list"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/REFUSED \(stored review\.json differs from its recorded sha256\)/u);
  });
});

describe("d2 — recording the owner's decision", () => {
  const afterRun = async ({ valid = true } = {}) => {
    const ctx = await atG1();
    ctx.deps.runCli = valid
      ? fakeCli()
      : fakeCli({
          review: undefined,
          exitCode: 1,
          stderr: `${STDERR}retrying judge after AI_NoObjectGeneratedError in 4000ms\n`,
        });
    await main(["run", "--case", "pr269", "--run-id", "pr269-01"], ctx.deps);
    return ctx;
  };
  const d2Lines = (world) => readSeries(gateLedger(world)).filter((line) => line.type === "d2");

  it("--match records the matches, the candidates and an approved finding outside the list as unlisted", async () => {
    const { world, deps, lines } = await afterRun();
    expect(
      await main(["d2", "--run", "pr269-01", "--match", "F2,F3", "--note", "F2 names the missing-URL exit"], deps),
    ).toBe(0);
    expect(d2Lines(world)).toEqual([
      {
        type: "d2",
        stepId: "pr269-01",
        decision: "match",
        matches: ["F2", "F3"],
        candidates: ["F1", "F2"],
        unlisted: ["F3"],
        note: "F2 names the missing-URL exit",
        by: "owner",
        at: "2026-10-16T00:00:00.000Z",
      },
    ]);
    expect(lines.at(-1)).toMatch(
      /D2 RECORDED: pr269-01 — match \(F2, F3\) \(approved outside the candidate list: F3\)/u,
    );
  });

  it.each([
    [
      "a second decision",
      async (deps) => main(["d2", "--run", "pr269-01", "--none", "--note", "n"], deps),
      /already decided/u,
    ],
    [
      "an unknown finding id",
      async (deps) => main(["d2", "--run", "pr269-01", "--match", "F9", "--note", "n"], deps),
      /not a published finding\): F9 in pr269-01/u,
    ],
    ["no note", async (deps) => main(["d2", "--run", "pr269-01", "--none"], deps), /no note/u],
    [
      "two forms at once",
      async (deps) => main(["d2", "--run", "pr269-01", "--none", "--list"], deps),
      /exactly one of/u,
    ],
  ])("refuses %s", async (label, act, pattern) => {
    const { world, deps, lines } = await afterRun();
    if (label === "a second decision") await main(["d2", "--run", "pr269-01", "--match", "F1", "--note", "n"], deps);
    const before = d2Lines(world).length;
    expect(await act(deps)).toBe(2);
    expect(lines.at(-1)).toMatch(pattern);
    expect(d2Lines(world)).toHaveLength(before);
  });

  it("refuses --match and --none for an invalid run, and --not-applicable for a valid one", async () => {
    const invalid = await afterRun({ valid: false });
    expect(await main(["d2", "--run", "pr269-01", "--none", "--note", "n"], invalid.deps)).toBe(2);
    expect(invalid.lines.at(-1)).toMatch(/REFUSED \(an invalid run\): pr269-01 — D2 counts only for valid runs/u);
    expect(await main(["d2", "--run", "pr269-01", "--not-applicable", "--note", "judge failed"], invalid.deps)).toBe(0);
    expect(await main(["d2", "--run", "pr269-01", "--not-applicable", "--note", "again"], invalid.deps)).toBe(2);
    expect(invalid.lines.at(-1)).toMatch(/already decided/u);

    const valid = await afterRun();
    expect(await main(["d2", "--run", "pr269-01", "--not-applicable", "--note", "n"], valid.deps)).toBe(2);
    expect(valid.lines.at(-1)).toMatch(/REFUSED \(a valid run\)/u);
  });

  it("refuses a run that is not a #269 run of this ledger", async () => {
    const { deps, lines } = await afterRun();
    expect(await main(["d2", "--run", "pr247-01", "--list"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/REFUSED \(not a #269 run\): pr247-01/u);
  });
});

// Owner decision 2026-10-16 (d): the runner pauses after every #269 run.
describe("the D2 pause", () => {
  it("after a valid #269 run, every paid step is refused until its d2 line", async () => {
    const { deps, lines } = await atG1();
    await main(["run", "--case", "pr269", "--run-id", "pr269-01"], deps);
    expect(lines.at(-1)).toMatch(/D2 PAUSE: no paid step until the owner's d2 line for pr269-01/u);
    expect(await main(["run", "--case", "pr269", "--run-id", "pr269-02"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(
      /REFUSED \(out of the sealed order\): pr269-02 \(pr269\) — the owner's d2 line for pr269-01/u,
    );
    expect(deps.runCli).toHaveBeenCalledTimes(1);
    await main(["d2", "--run", "pr269-01", "--match", "F1", "--note", "n"], deps);
    expect(await main(["run", "--case", "pr269", "--run-id", "pr269-02"], deps)).toBe(0);
  });

  it("after an invalid #269 run, every paid step is refused until the owner's --not-applicable", async () => {
    const { deps, lines } = await atG1();
    deps.runCli = fakeCli({ review: undefined, exitCode: 1 });
    await main(["run", "--case", "pr269", "--run-id", "pr269-01"], deps);
    expect(await main(["run", "--case", "pr269", "--run-id", "pr269-02"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/an invalid run: `d2 --run pr269-01 --not-applicable --note <text>`/u);
    await main(["d2", "--run", "pr269-01", "--not-applicable", "--note", "no artifact"], deps);
    // The invalid run is still unsettled; once settled, the series goes on.
    expect(scheduleState(readSeries(join(deps.repoRoot, CHANGE, "gate/series.jsonl"))).next).toBe("pr269");
  });
});

// Owner decision 2026-10-16 (c): the gates the stop leaves open are not measured, never passed.
describe("the D2 early stop", () => {
  const seriesWith = (decisions) => {
    const series = [{ type: "preflight", counter: 100 }];
    const ran = (stepId, kind, cost, extra = {}) =>
      series.push(
        { type: "started", stepId, kind },
        { type: "record", stepId, kind, valid: true, findings: [], reasons: [], ...extra },
        { type: "settled", stepId, cost },
      );
    for (let i = 1; i <= 5; i += 1) {
      ran(`clean-0${String(i)}`, "clean", 0.02);
      if (i === 1) series.push({ type: "continue", for: "probe" });
    }
    series.push(
      { type: "started", stepId: "g3", kind: "g3" },
      { type: "g3", stepId: "g3", kind: "g3", summary: { failedRun: false, pass: true } },
      { type: "settled", stepId: "g3", cost: 0.3 },
    );
    ran("pr247-01", "pr247", 0.08);
    ran("pr247-02", "pr247", 0.08);
    decisions.forEach((decision, i) => {
      const stepId = `pr269-${String(i + 1).padStart(2, "0")}`;
      ran(stepId, "pr269", 0.15, { reviewSha256: "b".repeat(64), findings: [{ id: "F1" }] });
      series.push({ type: "d2", stepId, decision, matches: decision === "match" ? ["F1"] : [] });
    });
    return series;
  };

  it("the first no-match ends the series FAIL (D2) → NOT ADMITTED (hand-read), the rest not measured", () => {
    const series = seriesWith(["match", "no-match"]);
    expect(scheduleState(series)).toMatchObject({ next: null, ended: "FAIL (D2)" });
    const outcome = computeOutcome(series, { counterNow: 101 });
    expect(outcome.verdict).toBe("NOT ADMITTED (hand-read)");
    expect(outcome.gates).toMatchObject({
      G1: "2/2 valid — stopped by D2",
      "hand-read": "FAIL (no D2 match in pr269-02)",
      cost: "not measured",
      G5: "not measured",
    });
    expect(
      Object.values(outcome.gates).filter((gate) => /PASS/u.test(gate) && /G1|hand-read|cost|G5/u.test(gate)),
    ).toEqual([]);
    const text = renderOutcome(outcome, { at: "t" });
    expect(text).toContain("| pr269-02 | pr269 | yes | no-match | — |");
    expect(text).toContain("| G1 | 2/2 valid — stopped by D2 |");
  });

  it("a no-match on the tenth run still stops: no hand-read follows", () => {
    const series = seriesWith([...Array(9).fill("match"), "no-match"]);
    expect(scheduleState(series).ended).toBe("FAIL (D2)");
    expect(computeOutcome(series, { handRead: { pass: true } }).verdict).toBe("NOT ADMITTED (hand-read)");
  });

  it("a series without an early stop shows G5 pending (Phase 7)", () => {
    expect(computeOutcome(seriesWith(["match"])).gates.G5).toBe("pending (Phase 7)");
  });

  it("a hand-read whose D2 count disagrees with the ledger is invalid evidence, never a pass", () => {
    const series = seriesWith(Array(10).fill("match"));
    const result = (stepId, kind, d2) => ({
      stepId,
      reviewSha256: kind === "pr269" ? "b".repeat(64) : undefined,
      n: kind === "pr269" ? 1 : 0,
      rejected: 0,
      unresolved: 0,
      allowed: kind === "pr269" ? 1 : 0,
      d2,
      pass: true,
    });
    const handRead = {
      problems: [],
      pass: true,
      cases: {
        pr247: [],
        pr269: Array.from({ length: 10 }, (_, i) =>
          result(`pr269-${String(i + 1).padStart(2, "0")}`, "pr269", i === 0 ? 2 : 1),
        ),
      },
    };
    const outcome = computeOutcome(series, { handRead });
    expect(outcome.gates["hand-read"]).toBe("pending (invalid evidence)");
    expect(outcome.handReadProblems).toContain("pr269-01: D2 count 2 differs from the ledger's 1 approved match(es)");
  });
});
