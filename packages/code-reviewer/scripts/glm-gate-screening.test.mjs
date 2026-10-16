// Hermetic tests for the screening of change `finder-glm-5-3-high` (its
// plan.md Phase 2 §1, Testing Strategy "Screening"; owner decisions
// 2026-10-16): the pure screening state — order, stop rules (a)–(d), pauses,
// budget, outcome — and the runner's `--screening` I/O against a throwaway
// repository, a fake CLI, a fake promptfoo and counter. No network, no key.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  admitScreening,
  computeScreeningOutcome,
  DECIDED_REASONING,
  EXPECTED_CONFIGURATION_LINE,
  renderScreeningOutcome,
  SCREENING_COST_BOUND,
  screeningState,
  seriesSpend,
} from "./glm-gate-core.mjs";
import { describeManifest, main, manifestSha256, readSeries } from "./glm-gate.mjs";
import { CASES } from "./promptfoo-gate-rows.mjs";

// --- Pure state: series builders ---------------------------------------------------

const TREE = "t".repeat(64);
const pre = (counter = 100) => ({ type: "preflight", screening: true, counter, treeSha256: TREE, tree: {} });
const started = (stepId, kind) => ({ type: "started", stepId, kind, treeSha256: TREE });
const settled = (stepId, cost) => ({ type: "settled", stepId, cost });
const summary = (over = {}) => ({
  failedRun: false,
  pass: true,
  repeats: 1,
  rowCount: 4,
  invalidatedRows: [],
  modelRows: [],
  shapeRows: [],
  inlineReasoningRows: [],
  authCreditRows: [],
  finderErrorRows: [],
  graderErrorRows: [],
  regradedRows: [],
  lengthRows: [],
  timeoutRows: [],
  recoveredTimeoutRows: [],
  cost: { total: 0.04 },
  ...over,
});
/** The fixtures step: started, recorded and (unless `cost` is null) settled. */
const fix = (over = {}, { stepId = "sfix", cost = 0.06 } = {}) => [
  started(stepId, "fixtures"),
  { type: "fixtures", stepId, kind: "fixtures", summary: summary(over) },
  ...(cost === null ? [] : [settled(stepId, cost)]),
];
const record = (stepId, kind, over = {}) => ({
  type: "record",
  stepId,
  kind,
  valid: true,
  artifact: true,
  reasons: [],
  authCredit: null,
  requests: [],
  steps: [],
  retries: [],
  terminalTimeout: false,
  findings: [{ id: "F1" }],
  ...over,
});
/** A CLI run: started, recorded and (unless `cost` is null) settled. */
const run = (stepId, kind, cost, over = {}) => [
  started(stepId, kind),
  record(stepId, kind, over),
  ...(cost === null ? [] : [settled(stepId, cost)]),
];
const d2 = (stepId, decision = "match") =>
  decision === "not-applicable"
    ? { type: "d2", stepId, decision, note: "n", by: "owner" }
    : { type: "d2", stepId, decision, matches: decision === "match" ? ["F1"] : [], note: "n", by: "owner" };
const go = (stepId, reason) => ({ type: "continue", screening: true, for: reason, stepId, note: "n", by: "owner" });
const INVALID = { valid: false, artifact: null };
const finderRetry = (error = "TimeoutError") => ({ pass: "finder", error, delayMs: 2000 });
const judgeRetry = { pass: "judge", error: "AI_NoObjectGeneratedError", delayMs: 4000 };

/** A screening that ran every step and settled, D2 matched in both #269 runs. */
const throughGo = ({ m247 = 0.06, c1 = 0.15, c2 = 0.15 } = {}) => [
  pre(),
  ...fix(),
  ...run("s247-01", "pr247", m247),
  ...run("s269-01", "pr269", c1),
  d2("s269-01"),
  ...run("s269-02", "pr269", c2),
  d2("s269-02"),
];

describe("order (H2): fixtures → #247 → #269 → D2 → #269 → D2", () => {
  it("names each next step and its id, pausing for D2 after each #269 run", () => {
    const steps = [];
    const series = [pre()];
    const look = () => {
      const state = screeningState(series);
      steps.push(state.ended ?? state.nextStepId ?? state.waitingFor.split(" (")[0]);
    };
    look();
    series.push(...fix());
    look();
    series.push(...run("s247-01", "pr247", 0.06));
    look();
    series.push(...run("s269-01", "pr269", 0.15));
    look();
    series.push(d2("s269-01"));
    look();
    series.push(...run("s269-02", "pr269", 0.15));
    look();
    series.push(d2("s269-02"));
    look();
    expect(steps).toEqual([
      "sfix",
      "s247-01",
      "s269-01",
      "the owner's d2 line for s269-01",
      "s269-02",
      "the owner's d2 line for s269-02",
      "GO",
    ]);
  });

  it("the D2 pause names the command that ends it", () => {
    expect(
      screeningState([pre(), ...fix(), ...run("s247-01", "pr247", 0.06), ...run("s269-01", "pr269", 0.15)]).waitingFor,
    ).toMatch(
      /`d2 --screening --run s269-01 --list`, then `d2 --screening --run s269-01 --match <F-id>\[,…\] --note <text>`/u,
    );
  });

  it("waits for settlement before it ends, and never ends GO with a step unsettled", () => {
    const series = throughGo().filter((line) => !(line.type === "settled" && line.stepId === "s269-02"));
    expect(screeningState(series)).toMatchObject({
      ended: null,
      waitingFor: expect.stringMatching(/settlement of step\(s\) s269-02/u),
    });
  });
});

describe("stop rule (a): a finder request ends `length`", () => {
  it.each([
    [
      "in a run's telemetry",
      run("s269-01", "pr269", 0.2, { valid: false, reasons: ["length"], requests: [{ finishReason: "length" }] }),
    ],
    [
      "in a stderr-only run",
      run("s269-01", "pr269", null, {
        ...INVALID,
        reasons: ["finder-output:length"],
        steps: [{ finishReason: "length" }],
      }),
    ],
  ])("stops %s", (_label, steps) => {
    const state = screeningState([pre(), ...fix(), ...run("s247-01", "pr247", 0.06), ...steps]);
    expect(state.ended).toBe("STOP (a: length)");
    expect(state.fired).toEqual([{ rule: "a", label: "STOP (a: length)", steps: ["s269-01"] }]);
  });

  it("stops on a fixture row (H6)", () => {
    expect(screeningState([pre(), ...fix({ lengthRows: [{ testIdx: 2, case: "react" }] })]).ended).toBe(
      "STOP (a: length)",
    );
  });
});

describe("stop rule (b): the finder timed out after its retry", () => {
  const base = [pre(), ...fix(), ...run("s247-01", "pr247", 0.06)];

  it.each([
    ["a timeout on both attempts", [finderRetry()]],
    ["a 5xx on the first attempt, then a timeout on the retry", [finderRetry("AI_APICallError")]],
  ])("stops on %s (artifact-less run)", (_label, retries) => {
    const steps = run("s269-01", "pr269", null, { ...INVALID, reasons: ["timeout"], retries, terminalTimeout: true });
    expect(screeningState([...base, ...steps]).ended).toBe("STOP (b: finder timeout after retry)");
  });

  it("stops on a fixture row whose finder timed out after the adapter's retry (H6)", () => {
    expect(screeningState([pre(), ...fix({ timeoutRows: [{ testIdx: 3, case: "cross-hunk" }] })]).ended).toBe(
      "STOP (b: finder timeout after retry)",
    );
  });

  it("a timeout the retry recovers, with a valid artifact, is only a warning; its cost counts", () => {
    const series = [...base, ...run("s269-01", "pr269", 0.31, { retries: [finderRetry()] })];
    const state = screeningState(series);
    expect(state.ended).toBeNull();
    expect(state.warnings).toEqual(["s269-01: a finder timeout recovered by the retry (its cost counts)"]);
    expect(seriesSpend(series).settledTotal).toBeCloseTo(0.06 + 0.06 + 0.31, 10);
  });

  it("a recovered finder timeout followed by a technical judge failure is that failure's pause, with the warning", () => {
    const steps = run("s269-01", "pr269", null, {
      ...INVALID,
      reasons: ["judge-error"],
      retries: [finderRetry(), judgeRetry],
      terminalTimeout: true,
    });
    const state = screeningState([...base, ...steps, d2("s269-01", "not-applicable")]);
    expect(state.ended).toBeNull();
    expect(state.pause).toMatchObject({ stepId: "s269-01", reason: "invalid-run" });
    expect(state.warnings).toHaveLength(1);
  });

  it("a terminal timeout with no finder retry is not (b)", () => {
    const steps = run("s247-01", "pr247", null, {
      ...INVALID,
      reasons: ["timeout"],
      retries: [],
      terminalTimeout: true,
    });
    expect(screeningState([pre(), ...fix(), ...steps]).pause).toMatchObject({ reason: "invalid-run" });
  });
});

describe("stop rule (c): 53·m247 + 8·m269 > $7.404940 from settled costs", () => {
  it("is $10.00 − 13·$0.199620", () => {
    expect(SCREENING_COST_BOUND).toBeCloseTo(7.40494, 9);
  });

  it("does not stop at exactly the bound; stops above it", () => {
    const at = (7.40494 - 53 * 0.1) / 8;
    expect(screeningState(throughGo({ m247: 0.1, c1: at, c2: at })).ended).toBe("GO");
    const above = screeningState(throughGo({ m247: 0.1, c1: at + 0.0001, c2: at + 0.0001 }));
    expect(above.ended).toBe("STOP (c: cost)");
    expect(above.fired[0].steps).toEqual(["53·m247 + 8·m269"]);
  });

  it("stops after #247 alone when 53·m247 = $7.41 (H4), once it settles", () => {
    const unsettled = [pre(), ...fix(), ...run("s247-01", "pr247", null)];
    expect(screeningState(unsettled).ended).toBeNull();
    const state = screeningState([...unsettled, settled("s247-01", 7.41 / 53)]);
    expect(state.ended).toBe("STOP (c: cost)");
    expect(state.fired[0].steps).toEqual(["53·m247 (H4)"]);
  });

  it("is decided on the mean of the two #269 runs, never on the first alone", () => {
    const first = [pre(), ...fix(), ...run("s247-01", "pr247", 0.1), ...run("s269-01", "pr269", 0.5), d2("s269-01")];
    // 53·0.1 + 8·0.5 = $9.30 on the first run alone: not decided yet.
    expect(screeningState(first)).toMatchObject({ ended: null, nextStepId: "s269-02" });
    // The mean of $0.50 and $0.01 gives 5.30 + 2.04 = $7.34: no stop.
    expect(screeningState([...first, ...run("s269-02", "pr269", 0.01), d2("s269-02")]).ended).toBe("GO");
  });
});

describe("stop rule (d): a valid #269 run without an owner-approved D2 match", () => {
  it("a no-match stops", () => {
    const series = [
      pre(),
      ...fix(),
      ...run("s247-01", "pr247", 0.06),
      ...run("s269-01", "pr269", 0.15),
      d2("s269-01", "no-match"),
    ];
    expect(screeningState(series).ended).toBe("STOP (d: no D2 in s269-01)");
  });

  it("an undecided D2 pauses the screening, and at `outcome` counts as no match", () => {
    const series = throughGo().filter((line) => !(line.type === "d2" && line.stepId === "s269-02"));
    expect(screeningState(series)).toMatchObject({
      ended: null,
      waitingFor: expect.stringMatching(/d2 line for s269-02/u),
    });
    const outcome = computeScreeningOutcome(series);
    expect(outcome.verdict).toBe("STOP (d: no D2 in s269-02)");
    expect(outcome.fired).toEqual([expect.objectContaining({ rule: "d", steps: ["s269-02"], undecided: true })]);
    expect(renderScreeningOutcome(outcome, { at: "t" })).toContain("(D2 undecided: counted as no match)");
  });
});

describe("pauses (owner decisions 2026-10-16)", () => {
  const head = [pre(), ...fix()];
  it.each([
    [
      "a confirmed 402 on s247-01",
      run("s247-01", "pr247", 0.001, {
        ...INVALID,
        authCredit: "confirmed",
        reasons: ["api-error:402", "auth-or-credit-confirmed"],
      }),
      "auth-credit",
      "s247-02",
    ],
    [
      "a provider mismatch",
      run("s247-01", "pr247", 0.05, { valid: false, reasons: ["provider-mismatch"] }),
      "mismatch",
      "s269-01",
    ],
    [
      "a model mismatch",
      run("s247-01", "pr247", 0.05, { valid: false, reasons: ["model-mismatch"] }),
      "mismatch",
      "s269-01",
    ],
    [
      "a technical judge failure (H5)",
      run("s247-01", "pr247", 0.05, { ...INVALID, reasons: ["judge-error"], retries: [judgeRetry] }),
      "invalid-run",
      "s269-01",
    ],
  ])("%s pauses until the owner's continue for %s", (_label, steps, reason, next) => {
    const series = [...head, ...steps];
    const state = screeningState(series);
    expect(state).toMatchObject({ next: null, ended: null, pause: { stepId: "s247-01", reason } });
    expect(state.waitingFor).toContain(`\`continue --screening --for ${reason} --note <text>\``);
    expect(screeningState([...series, go("s247-01", reason)]).nextStepId).toBe(next);
  });

  it("a confirmed 402 on the fixtures step is not a sample: after continue, sfix-02 runs", () => {
    const stopped = fix({
      failedRun: true,
      authCredit: true,
      authCreditRows: [{ testIdx: 1, case: "js-loop", status: 402 }],
      problems: ["confirmed 402"],
    });
    const series = [pre(), ...stopped];
    expect(screeningState(series).pause).toMatchObject({
      reason: "auth-credit",
      causes: ["testIdx 1 (js-loop): confirmed OpenRouter 402"],
    });
    expect(screeningState([...series, go("sfix", "auth-credit")])).toMatchObject({
      next: "fixtures",
      nextStepId: "sfix-02",
    });
  });

  it.each([
    [
      "a grader error",
      {
        failedRun: true,
        graderError: true,
        graderErrorRows: [{ testIdx: 2, case: "react", id: "r", errors: [{ metric: "m", reason: "HTTP 503" }] }],
        problems: ["1 grader-error row(s)"],
      },
      "grader-error",
      "testIdx 2 (react): grader error (HTTP 503)",
    ],
    [
      "a finder error on a row",
      {
        pass: false,
        finderErrorRows: [
          { testIdx: 4, case: "clean", error: "Finder output rejected (reason=parse, request=finalization)" },
        ],
      },
      "invalid-run",
      "testIdx 4 (clean): finder error: Finder output rejected (reason=parse, request=finalization)",
    ],
    [
      "a wrong reasoning shape",
      {
        pass: false,
        shapeRows: [{ testIdx: 1, case: "js-loop", requestReasoning: [{ enabled: true, effort: "low" }] }],
      },
      "invalid-run",
      "testIdx 1 (js-loop): reasoning shape not the decided one",
    ],
    [
      "a failed export",
      { failedRun: true, problems: ["3 rows, expected 4"] },
      "invalid-run",
      "failed export: 3 rows, expected 4",
    ],
  ])(
    "a fixtures step with %s pauses, naming the row and its cause; it stays a sample",
    (_label, over, reason, cause) => {
      const series = [pre(), ...fix(over)];
      expect(screeningState(series).pause).toMatchObject({ stepId: "sfix", reason, causes: [cause] });
      expect(screeningState([...series, go("sfix", reason)])).toMatchObject({ next: "pr247", nextStepId: "s247-01" });
    },
  );

  it("a fixtures step whose metrics miss is informational: no pause", () => {
    const state = screeningState([pre(), ...fix({ pass: false, g3: { pass: false, cases: {} } })]);
    expect(state).toMatchObject({ pause: null, next: "pr247" });
  });

  it("an unsettled paused step names `reconcile --screening` first", () => {
    expect(
      screeningState([pre(), ...fix({ failedRun: true, problems: ["3 rows, expected 4"] }, { cost: null })]).waitingFor,
    ).toMatch(/— `reconcile --screening`, then `continue --screening --for invalid-run/u);
  });

  it("after an invalid #269 run the d2 line comes first, then the pause", () => {
    const series = [
      pre(),
      ...fix(),
      ...run("s247-01", "pr247", 0.06),
      ...run("s269-01", "pr269", 0.05, { ...INVALID, reasons: ["judge-error"] }),
    ];
    expect(screeningState(series)).toMatchObject({
      pause: null,
      waitingFor: expect.stringMatching(/s269-01 \(an invalid run: `d2 --screening --run s269-01 --not-applicable/u),
    });
    const withD2 = [...series, d2("s269-01", "not-applicable")];
    expect(screeningState(withD2).pause).toMatchObject({ stepId: "s269-01", reason: "invalid-run" });
    expect(screeningState([...withD2, go("s269-01", "invalid-run")]).nextStepId).toBe("s269-02");
  });
});

describe("budget (H3): T_s + P ≤ $0.75", () => {
  it("P starts at the first-step estimates", () => {
    expect(["fixtures", "pr247", "pr269"].map((kind) => admitScreening([pre()], kind, 100).p)).toEqual([
      0.1, 0.15, 0.3,
    ]);
  });

  it("P is the largest settled cost of the kind, once: the second #269 run is refused when T_s + P > $0.75", () => {
    const series = [pre(), ...fix(), ...run("s247-01", "pr247", 0.15), ...run("s269-01", "pr269", 0.35), d2("s269-01")];
    // T_s = $0.56, P = $0.35.
    expect(admitScreening(series, "pr269", 100.56)).toMatchObject({ admit: false, budgetStop: true, p: 0.35 });
    // Equality admits: T_s $0.40 + P $0.35 = $0.75.
    const cheaper = [
      pre(),
      ...fix({}, { cost: 0.05 }),
      ...run("s247-01", "pr247", 0.0),
      ...run("s269-01", "pr269", 0.35),
      d2("s269-01"),
    ];
    expect(admitScreening(cheaper, "pr269", 100.4)).toMatchObject({ admit: true });
  });

  it("refuses any step while one is unsettled", () => {
    expect(admitScreening([pre(), ...fix({}, { cost: null })], "pr247", 100)).toMatchObject({
      admit: false,
      refusal: "unsettled step(s) sfix",
    });
  });

  it("a budget stop, or a step that ends above $0.75, ends the screening INCOMPLETE (budget) with its overshoot", () => {
    expect(screeningState([pre(), ...fix(), { type: "budget_stop", kind: "pr247" }]).ended).toBe("INCOMPLETE (budget)");
    const outcome = computeScreeningOutcome(throughGo(), { counterNow: 100.8 });
    expect(outcome.verdict).toBe("INCOMPLETE (budget)");
    expect(outcome.spend.overshoot).toBeCloseTo(0.05, 10);
  });
});

describe("outcome edges and precedence", () => {
  it("two invalid #269 runs, neither (a) nor (b), give INCONCLUSIVE (no valid #269 run), never GO", () => {
    const bad = (stepId) => [
      ...run(stepId, "pr269", 0.05, { ...INVALID, reasons: ["judge-error"] }),
      d2(stepId, "not-applicable"),
      go(stepId, "invalid-run"),
    ];
    const series = [pre(), ...fix(), ...run("s247-01", "pr247", 0.06), ...bad("s269-01"), ...bad("s269-02")];
    expect(screeningState(series).ended).toBe("INCONCLUSIVE (no valid #269 run)");
  });

  it("a confirmed-402 #269 run stays out of m269 and is not replaced", () => {
    const series = [
      pre(),
      ...fix(),
      ...run("s247-01", "pr247", 0.06),
      ...run("s269-01", "pr269", 0.001, { ...INVALID, authCredit: "confirmed", reasons: ["auth-or-credit-confirmed"] }),
      d2("s269-01", "not-applicable"),
      go("s269-01", "auth-credit"),
      ...run("s269-02", "pr269", 0.2),
      d2("s269-02"),
    ];
    expect(screeningState(series).ended).toBe("GO");
    expect(computeScreeningOutcome(series).m269).toBeCloseTo(0.2, 10);
  });

  it("a no-match with (c) exceeded lists both, the first to fire leading", () => {
    // (c) fires when s269-02 settles: 5.30 + 8 × 0.27 = $7.46; the no-match comes after it.
    const series = [
      ...throughGo({ m247: 0.1, c1: 0.27, c2: 0.27 }).filter(
        (line) => !(line.type === "d2" && line.stepId === "s269-02"),
      ),
      d2("s269-02", "no-match"),
    ];
    const state = screeningState(series);
    expect(state.ended).toBe("STOP (c: cost)");
    expect(state.fired.map((stop) => stop.label)).toEqual(["STOP (c: cost)", "STOP (d: no D2 in s269-02)"]);
  });

  it("a `length` on s269-01 that leaves no valid #269 run is STOP (a), never INCONCLUSIVE", () => {
    const series = [
      pre(),
      ...fix(),
      ...run("s247-01", "pr247", 0.06),
      ...run("s269-01", "pr269", 0.2, { valid: false, reasons: ["length"], requests: [{ finishReason: "length" }] }),
    ];
    expect(screeningState(series).ended).toBe("STOP (a: length)");
    expect(computeScreeningOutcome(series).verdict).toBe("STOP (a: length)");
  });

  it("a valid no-match that also takes T_s above $0.75 is STOP (d), its overshoot recorded, never INCOMPLETE (budget)", () => {
    const series = [
      ...throughGo({ c1: 0.2, c2: 0.45 }).filter((line) => !(line.type === "d2" && line.stepId === "s269-02")),
      d2("s269-02", "no-match"),
    ];
    const outcome = computeScreeningOutcome(series);
    expect(outcome.verdict).toBe("STOP (d: no D2 in s269-02)");
    expect(outcome.spend.overshoot).toBeCloseTo(0.02, 10);
    expect(renderScreeningOutcome(outcome, { at: "t" })).toMatch(/overshoot \$0\.020000/u);
  });

  it("renders GO with every step, the cost bound and T_s, and no absolute path", () => {
    const text = renderScreeningOutcome(computeScreeningOutcome(throughGo()), { at: "2026-10-16T00:00:00Z" });
    expect(text).toContain("**Outcome:** GO");
    expect(text).toContain("| s269-02 | pr269 | yes | match (F1) |");
    expect(text).toMatch(/53·m247 \+ 8·m269 = \$4\.380000 against \$7\.404940/u);
    expect(text).not.toMatch(/\/home\/|\/tmp\//u);
  });
});

// --- The runner's --screening I/O --------------------------------------------------

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

const realGit = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
/** A git repository with everything in it committed: a frozen worktree, or the repository itself. */
const commitAll = (dir) => {
  realGit(["init", "-q"], dir);
  realGit(["add", "."], dir);
  realGit(
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "frozen",
    ],
    dir,
  );
};

/** A throwaway repository without a manifest (the screening needs none) and frozen inputs. */
function setup({ git = "fake" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "glm-screen-"));
  const repoRoot = join(root, "repo");
  const inputsDir = join(root, "inputs");
  for (const path of SEALED) write(join(repoRoot, path), `content of ${path}\n`);
  for (const pr of ["247", "269"]) {
    write(join(inputsDir, pr, "pr.diff"), `diff ${pr}\n`);
    write(join(inputsDir, pr, "rules.md"), "rules\n");
    write(join(inputsDir, pr, "meta.json"), JSON.stringify({ title: `PR ${pr}`, body: "body" }));
    write(join(inputsDir, `wt-${pr}`, "scripts/spikes/bread-spike.ts"), "export {};\n");
  }
  if (git === "real") {
    for (const dir of [repoRoot, join(inputsDir, "wt-247"), join(inputsDir, "wt-269")]) commitAll(dir);
  }
  return {
    root,
    repoRoot,
    inputsDir,
    git: git === "real" ? realGit : (args) => (args[0] === "rev-parse" ? "abc123" : ""),
    cache: join(root, "cache"),
  };
}

const reported = (value) => ({ value, source: "reported" });
const reviewJson = (
  findings = [
    {
      id: "F1",
      file: "scripts/spikes/bread-spike.ts",
      severity: "major",
      category: "bug",
      description: "d",
      suggestion: "s",
    },
  ],
) => ({
  summary: "s",
  findings,
  scores: {},
  verdict: "passed",
  models: { finder: "z-ai/glm-5.3", judge: "anthropic/claude-sonnet-5" },
  finderTelemetry: {
    cost: 0.02,
    requests: [
      {
        kind: "finalization",
        attempt: 1,
        provider: reported("Z.AI"),
        model: reported("z-ai/glm-5.3"),
        finishReason: "stop",
        reasoningTokens: reported(900),
        cost: 0.02,
      },
    ],
  },
  judgeTelemetry: { attempts: 1, cost: 0.03 },
});
const STDERR = `${EXPECTED_CONFIGURATION_LINE}\nfinder step 1: no getFileContext call (tokens in=1 out=950 total=951) kind=finalization provider=Z.AI finish=stop model=z-ai/glm-5.3 reasoning=900\n`;
const fakeCli = ({ review = reviewJson(), exitCode = 0, stderr = STDERR } = {}) =>
  vi.fn(async (args) => {
    if (review !== undefined) write(join(args[args.indexOf("--out-dir") + 1], "review.json"), JSON.stringify(review));
    return { exitCode, signal: null, stdout: "", stderr, interrupted: false };
  });

/** G3's four cases once, as promptfoo's -o export shapes them: every row clean, $0.01 each. */
const fixturesExport = () => ({
  results: {
    results: CASES.map((c, i) => ({
      id: `row-${String(i + 1)}`,
      testIdx: i + 1,
      provider: { id: "file://./finder-provider.ts", label: "candidate-glm-5.3" },
      testCase: { description: `${c.prefix} (fixture)` },
      gradingResult: {
        componentResults: [...c.required, ...(c.diagnostic ?? [])].map((metric) => ({
          pass: true,
          assertion: { metric },
        })),
      },
      response: {
        output: '{"summary":"s","findings":[]}',
        metadata: {
          requests: [
            {
              kind: "finalization",
              attempt: 1,
              provider: reported("Z.AI"),
              model: reported("z-ai/glm-5.3"),
              finishReason: "stop",
              reasoningTokens: reported(800),
              cost: 0.01,
            },
          ],
          requestReasoning: [DECIDED_REASONING],
          retries: [],
          cost: 0.01,
        },
      },
    })),
  },
});
const fakePromptfoo = (exportJson = fixturesExport()) =>
  vi.fn(async (_command, args) => {
    write(args[args.indexOf("--output") + 1], JSON.stringify(exportJson));
    return { exitCode: 0, signal: null, stdout: "", stderr: "", interrupted: false };
  });

function depsFor(world, over = {}) {
  const lines = [];
  let counter = 100;
  const deps = {
    repoRoot: world.repoRoot,
    packageDir: join(world.repoRoot, "packages/code-reviewer"),
    envFile: join(world.repoRoot, "packages/code-reviewer/.env"),
    env: { OPENROUTER_API_KEY: "test-key", GLM_GATE_CACHE: world.cache, GLM_GATE_INPUTS: world.inputsDir },
    git: world.git,
    readCounter: vi.fn(async () => counter),
    readEndpoints: vi.fn(async () => [{ provider: "Z.AI", tag: "z-ai/fp8", status: 0, uptime30m: 100 }]),
    runCli: fakeCli(),
    runCommand: fakePromptfoo(),
    now: () => new Date("2026-10-16T00:00:00Z"),
    sleep: vi.fn(async () => undefined),
    log: (line) => lines.push(line),
    ...over,
  };
  return {
    deps,
    lines,
    setCounter: (value) => {
      counter = value;
    },
  };
}

const screeningLedger = (world) => join(world.repoRoot, CHANGE, "screening/series.jsonl");
const ledgerOf = (world) => readSeries(screeningLedger(world));
const S = "--screening";

/** Preflight, the fixtures step and its settlement: the screening stands at s247-01. */
async function afterFixtures() {
  const world = setup();
  const ctx = depsFor(world);
  expect(await main(["preflight", S], ctx.deps)).toBe(0);
  expect(await main(["fixtures", S], ctx.deps)).toBe(0);
  ctx.setCounter(100.05);
  expect(await main(["reconcile", S], ctx.deps)).toBe(0);
  return { world, ...ctx };
}

describe("preflight --screening", () => {
  it("records T0_s, the endpoints, HEAD and the screened tree's manifest and sha256; no manifest is required", async () => {
    const world = setup();
    const { deps, lines } = depsFor(world);
    expect(await main(["preflight", S], deps)).toBe(0);
    const [line] = ledgerOf(world);
    const tree = describeManifest({ repoRoot: world.repoRoot, inputsDir: world.inputsDir, git: world.git });
    expect(line).toMatchObject({
      type: "preflight",
      screening: true,
      counter: 100,
      head: "abc123",
      treeSha256: manifestSha256(tree),
      tree,
    });
    expect(lines[0]).toMatch(
      /^SCREENING PREFLIGHT RECORDED: key counter \$100\.000000 \(T0_s\), tree sha256 [0-9a-f]{64} at HEAD abc123 \(the baseline until the first paid step\), pr247 diff [0-9a-f]{8}… worktree abc123 clean, pr269 diff/u,
    );
    expect(lines[0]).toMatch(/→ context\/changes\/finder-glm-5-3-high\/screening\/series\.jsonl\.$/u);
    expect(existsSync(join(world.repoRoot, CHANGE, "gate/series.jsonl"))).toBe(false);
  });

  it("refuses the forbidden environment, present at all", async () => {
    const world = setup();
    write(join(world.repoRoot, "packages/code-reviewer/.env"), "OPENROUTER_FINDER_PROVIDERS=\n");
    const { deps, lines } = depsFor(world);
    expect(await main(["preflight", S], deps)).toBe(2);
    expect(lines[0]).toMatch(/REFUSED \(environment overrides production defaults\): OPENROUTER_FINDER_PROVIDERS/u);
    expect(deps.readCounter).not.toHaveBeenCalled();
  });
});

describe("fixtures --screening", () => {
  it("runs G3's command with --repeat 1, checks four rows, records them and their sha256, and stays unsettled", async () => {
    const world = setup();
    const { deps, lines } = depsFor(world);
    await main(["preflight", S], deps);
    expect(await main(["fixtures", S], deps)).toBe(0);
    const [command, args] = deps.runCommand.mock.calls[0];
    expect(command).toBe("npm");
    expect(args[args.indexOf("--repeat") + 1]).toBe("1");
    expect(args[args.indexOf("--output") + 1]).toBe(join(world.cache, "screening", "sfix.export.json"));
    const line = ledgerOf(world).find((entry) => entry.type === "fixtures");
    expect(line).toMatchObject({ stepId: "sfix", summary: { failedRun: false, pass: true, rowCount: 4, repeats: 1 } });
    const rows = readFileSync(join(world.repoRoot, CHANGE, "screening/results/sfix.fixture-rows.json"));
    expect(line.rowsSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(lines.join("\n")).toMatch(/G3 js-loop: issue_recall 1\/1/u);
    expect(lines.join("\n")).toMatch(/SCREENING: the next step is s247-01/u);
    expect(rows.length).toBeGreaterThan(0);
    expect(await main(["run", S, "--case", "pr247", "--run-id", "s247-01"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/REFUSED \(not admitted\): pr247 — unsettled step\(s\) sfix/u);
  });

  it.each([
    ["without --screening", ["fixtures"], /REFUSED \(not a gate step\): fixtures/u],
    ["in a dry run", ["fixtures", S, "--dry-run"], /REFUSED \(no dry run for the fixtures step\)/u],
  ])("refuses %s", async (_label, argv, pattern) => {
    const world = setup();
    const { deps, lines } = depsFor(world);
    await main(["preflight", S], deps);
    expect(await main(argv, deps)).toBe(2);
    expect(lines.at(-1)).toMatch(pattern);
    expect(deps.runCommand).not.toHaveBeenCalled();
  });

  it("refuses while its export file exists (Amendment 1 as code)", async () => {
    const world = setup();
    const { deps, lines } = depsFor(world);
    await main(["preflight", S], deps);
    write(join(world.cache, "screening", "sfix.export.json"), "{}");
    expect(await main(["fixtures", S], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(
      /REFUSED \(export already exists\): <cache>\/screening\/sfix\.export\.json — .*move it away/u,
    );
    expect(deps.runCommand).not.toHaveBeenCalled();
  });
});

describe("run --screening", () => {
  it("refuses out of the screening's order, and a run id it does not name next", async () => {
    const world = setup();
    const { deps, lines } = depsFor(world);
    expect(await main(["run", S, "--case", "pr247", "--run-id", "s247-01"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/REFUSED \(no screening preflight\)/u);
    await main(["preflight", S], deps);
    expect(await main(["run", S, "--case", "pr269", "--run-id", "s269-01"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/REFUSED \(out of the screening's order\): pr269 — the next step is sfix/u);
    expect(await main(["run", S, "--case", "clean", "--run-id", "x"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/unknown screening case/u);
    expect(deps.runCli).not.toHaveBeenCalled();
  });

  it("refuses a run id the screening does not name next", async () => {
    const { deps, lines } = await afterFixtures();
    expect(await main(["run", S, "--case", "pr247", "--run-id", "pr247-01"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(
      /REFUSED \(run-id out of the screening's order\): pr247-01 — the next pr247 run is s247-01/u,
    );
  });

  it("records a valid run with its tree sha256, settles it from telemetry, and names the next step", async () => {
    const { world, deps, lines } = await afterFixtures();
    expect(await main(["run", S, "--case", "pr247", "--run-id", "s247-01"], deps)).toBe(0);
    const ledger = ledgerOf(world);
    const baseline = ledger.find((line) => line.type === "preflight").treeSha256;
    expect(ledger.find((line) => line.type === "started" && line.stepId === "s247-01").treeSha256).toBe(baseline);
    expect(ledger.find((line) => line.type === "record")).toMatchObject({
      stepId: "s247-01",
      valid: true,
      consoleLog: "<cache>/screening/runs/s247-01",
      steps: [expect.objectContaining({ outputTokens: 950 })],
    });
    expect(existsSync(join(world.repoRoot, CHANGE, "screening/results/s247-01.review.json"))).toBe(true);
    expect(lines.at(-1)).toMatch(/SCREENING: the next step is s269-01 \(pr269\)/u);
  });

  it("a budget stop exits 4, writes `budget_stop`, and spends nothing", async () => {
    const { world, deps, lines, setCounter } = await afterFixtures();
    setCounter(100.65); // T_s $0.65 + P $0.15 > $0.75.
    expect(await main(["run", S, "--case", "pr247", "--run-id", "s247-01"], deps)).toBe(4);
    expect(lines.at(-1)).toMatch(
      /BUDGET STOP: pr247 .* the screening ends INCOMPLETE \(budget\)\. Nothing was spent\./u,
    );
    expect(ledgerOf(world).some((line) => line.type === "budget_stop")).toBe(true);
    expect(deps.runCli).not.toHaveBeenCalled();
  });
});

// Owner decision 2026-10-16: the screened tree's baseline and its check.
describe("the screened tree", () => {
  it("refuses a paid step on a changed tree, naming the file; a later preflight does not move the frozen baseline", async () => {
    const { world, deps, lines } = await afterFixtures();
    write(join(world.repoRoot, "packages/code-reviewer/scripts/glm-gate-core.mjs"), "changed mid-screening\n");
    expect(await main(["run", S, "--case", "pr247", "--run-id", "s247-01"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(
      /REFUSED \(screened tree changed\): .*packages\/code-reviewer\/scripts\/glm-gate-core\.mjs: content differs from the seal/u,
    );
    expect(await main(["preflight", S], deps)).toBe(0);
    expect(lines.at(-1)).toMatch(/the baseline stays [0-9a-f]{64}: frozen at the first paid step/u);
    expect(await main(["run", S, "--case", "pr247", "--run-id", "s247-01"], deps)).toBe(2);
    expect(deps.runCli).not.toHaveBeenCalled();
  });

  it("refuses a changed frozen input too", async () => {
    const { world, deps, lines } = await afterFixtures();
    write(join(world.inputsDir, "269", "pr.diff"), "tampered\n");
    expect(await main(["run", S, "--case", "pr247", "--run-id", "s247-01"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/screened tree changed\): .*pr269\.diff: sealed/u);
  });

  it("before any spending, a fix needs only a new preflight", async () => {
    const world = setup();
    const { deps } = depsFor(world);
    await main(["preflight", S], deps);
    write(join(world.repoRoot, "packages/code-reviewer/scripts/glm-gate.mjs"), "fixed before spending\n");
    expect(await main(["fixtures", S], deps)).toBe(2);
    expect(await main(["preflight", S], deps)).toBe(0);
    expect(await main(["fixtures", S], deps)).toBe(0);
  });

  it("the screening does not move the hash itself: the same sha256 at every step of the whole sequence, worktrees clean", async () => {
    const world = setup({ git: "real" });
    const { deps, setCounter } = depsFor(world);
    expect(await main(["preflight", S], deps)).toBe(0);
    expect(await main(["fixtures", S], deps)).toBe(0);
    setCounter(100.05);
    expect(await main(["reconcile", S], deps)).toBe(0);
    expect(await main(["run", S, "--case", "pr247", "--run-id", "s247-01"], deps)).toBe(0);
    expect(await main(["run", S, "--case", "pr269", "--run-id", "s269-01"], deps)).toBe(0);
    expect(await main(["d2", S, "--run", "s269-01", "--match", "F1", "--note", "owner: F1 names the leak"], deps)).toBe(
      0,
    );
    expect(await main(["run", S, "--case", "pr269", "--run-id", "s269-02"], deps)).toBe(0);
    expect(await main(["d2", S, "--run", "s269-02", "--match", "F1", "--note", "owner: F1 again"], deps)).toBe(0);
    const ledger = ledgerOf(world);
    const baseline = ledger.find((line) => line.type === "preflight");
    const stepShas = ledger.filter((line) => line.type === "started").map((line) => [line.stepId, line.treeSha256]);
    expect(stepShas).toEqual(["sfix", "s247-01", "s269-01", "s269-02"].map((id) => [id, baseline.treeSha256]));
    const after = describeManifest({ repoRoot: world.repoRoot, inputsDir: world.inputsDir, git: world.git });
    expect(after.inputs.pr247.clean).toBe(true);
    expect(after.inputs.pr269.clean).toBe(true);
    expect(manifestSha256(after)).toBe(baseline.treeSha256);
    expect(screeningState(ledger).ended).toBe("GO");
  }, 30_000);
});

describe("continue --screening", () => {
  const pausedAtS247 = async (review) => {
    const ctx = await afterFixtures();
    ctx.deps.runCli = fakeCli(review);
    await main(["run", S, "--case", "pr247", "--run-id", "s247-01"], ctx.deps);
    return ctx;
  };

  it("takes only the reason the pause names, records it once, and the screening goes on", async () => {
    const mismatch = {
      ...reviewJson(),
      finderTelemetry: {
        ...reviewJson().finderTelemetry,
        requests: [{ ...reviewJson().finderTelemetry.requests[0], provider: reported("Novita") }],
      },
    };
    const { world, deps, lines } = await pausedAtS247({ review: mismatch });
    expect(lines.join("\n")).toMatch(
      /SCREENING PAUSED: waiting for owner decision at s247-01 \(mismatch: provider-mismatch\)/u,
    );
    expect(await main(["continue", S, "--for", "invalid-run", "--note", "go"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(
      /REFUSED \(wrong reason\): continue --screening --for invalid-run — s247-01 pauses for mismatch/u,
    );
    expect(await main(["continue", S, "--for", "mismatch", "--note", "owner: Novita was a one-off"], deps)).toBe(0);
    expect(ledgerOf(world).filter((line) => line.type === "continue")).toEqual([
      expect.objectContaining({ screening: true, for: "mismatch", stepId: "s247-01", by: "owner" }),
    ]);
    expect(lines.at(-1)).toMatch(/SCREENING: the next step is s269-01/u);
    expect(await main(["continue", S, "--for", "mismatch", "--note", "again"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/REFUSED \(no screening pause\)/u);
  });

  it("refuses while the paused step is unsettled", async () => {
    const { deps, lines } = await pausedAtS247({ review: undefined, exitCode: 1 });
    expect(await main(["continue", S, "--for", "invalid-run", "--note", "go"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/REFUSED \(unsettled\): s247-01 — `reconcile --screening` first/u);
  });

  it("after an invalid #269 run, refuses until its d2 --not-applicable line", async () => {
    const { deps, lines } = await afterFixtures();
    await main(["run", S, "--case", "pr247", "--run-id", "s247-01"], deps);
    deps.runCli = fakeCli({
      review: undefined,
      exitCode: 1,
      stderr: `${STDERR}retrying judge after AI_NoObjectGeneratedError in 4000ms\n`,
    });
    expect(await main(["run", S, "--case", "pr269", "--run-id", "s269-01"], deps)).toBe(1);
    expect(await main(["continue", S, "--for", "invalid-run", "--note", "go"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(
      /REFUSED \(no screening pause\): .* waiting for the owner's d2 line for s269-01 \(an invalid run/u,
    );
    expect(await main(["d2", S, "--run", "s269-01", "--not-applicable", "--note", "judge failed"], deps)).toBe(0);
    expect(lines.at(-1)).toMatch(
      /SCREENING PAUSED: waiting for owner decision at s269-01 \(invalid-run: judge-error\)/u,
    );
  });
});

describe("outcome --screening", () => {
  it("writes the outcome between the screening.md markers", async () => {
    const { world, deps } = await afterFixtures();
    write(
      join(world.repoRoot, CHANGE, "screening.md"),
      "# Screening\n\n## Results\n\n<!-- glm-screen:outcome:start -->\nold\n<!-- glm-screen:outcome:end -->\n",
    );
    expect(await main(["outcome", S, "--write"], deps)).toBe(0);
    const text = readFileSync(join(world.repoRoot, CHANGE, "screening.md"), "utf8");
    expect(text).toContain("**Outcome:** in progress — next step: s247-01");
    expect(text).not.toContain("\nold\n");
    expect(text).toMatch(/<!-- glm-screen:outcome:end -->\n$/u);
  });

  it("refuses to write without the markers", async () => {
    const { world, deps, lines } = await afterFixtures();
    write(join(world.repoRoot, CHANGE, "screening.md"), "# Screening\n");
    expect(await main(["outcome", S, "--write"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(
      /REFUSED \(no outcome markers\): context\/changes\/finder-glm-5-3-high\/screening\.md/u,
    );
  });
});

describe("separation from the gate", () => {
  it("the screening never reads or writes the gate ledger, and a gate step ignores screening records", async () => {
    const { world, deps } = await afterFixtures();
    await main(["run", S, "--case", "pr247", "--run-id", "s247-01"], deps);
    expect(existsSync(join(world.repoRoot, CHANGE, "gate/series.jsonl"))).toBe(false);
    // The gate has its own T0 and order: its first step is still G2-01, and it refuses without a manifest.
    expect(await main(["run", "--case", "clean", "--run-id", "clean-01"], deps)).toBe(2);
    expect(existsSync(join(world.repoRoot, CHANGE, "gate/series.jsonl"))).toBe(false);
    expect(ledgerOf(world).every((line) => line.stepId === undefined || /^s(fix|247|269)/u.test(line.stepId))).toBe(
      true,
    );
  });
});
