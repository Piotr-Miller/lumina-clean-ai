// Hermetic tests for the pure core of the finder-glm-5-3 runner (plan.md
// Phase 3 §1 and §4; Testing Strategy "Runner").
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { resolveCase } from "./glm-gate-sheet.mjs";

import {
  a6Stops,
  admit,
  classifyRun,
  computeOutcome,
  EXPECTED_CONFIGURATION_LINE,
  exceedsLimit,
  finalProjection,
  forbiddenEnvSet,
  G3_CASE_FILTER,
  G3_PROVIDER_FILTER,
  g3EvalArgs,
  parseCliStderr,
  preG5LowerBound,
  probeProblems,
  projectMonthly,
  reconcileTolerance,
  renderOutcome,
  runCost,
  scheduleState,
  meanSettledCost,
  seriesSpend,
  stepEstimate,
} from "./glm-gate-core.mjs";

// --- Fixtures ---------------------------------------------------------------------

const reported = (value) => ({ value, source: "reported" });
const missing = { value: null, source: "missing" };
const request = (over = {}) => ({
  kind: "finalization",
  attempt: 1,
  provider: reported("Z.AI"),
  model: reported("z-ai/glm-5.3"),
  finishReason: "stop",
  reasoningTokens: reported(64),
  cost: 0.01,
  ...over,
});
const review = (over = {}) => ({
  summary: "s",
  findings: [],
  scores: {},
  verdict: "passed",
  models: { finder: "z-ai/glm-5.3", judge: "anthropic/claude-sonnet-5" },
  finderTelemetry: { steps: 1, toolCalls: 0, cost: 0.01, requests: [request()] },
  judgeTelemetry: { attempts: 1, cost: 0.02 },
  ...over,
});
const STDERR_OK = [
  EXPECTED_CONFIGURATION_LINE,
  "finder step 1: no getFileContext call (tokens in=1 out=1 total=2) kind=step provider=Z.AI finish=stop model=z-ai/glm-5.3 reasoning=64",
  "review cost: finder=$0.010000 judge=$0.020000 impl=(not run)",
].join("\n");

const classify = (over = {}) =>
  classifyRun({ exitCode: 0, signal: null, stderr: STDERR_OK, review: review(), ...over });

// --- Series builders ----------------------------------------------------------------

const t0 = (counter = 100) => ({ type: "preflight", counter });
const started = (stepId, kind, counterBefore = 100) => ({ type: "started", stepId, kind, counterBefore });
const settled = (stepId, cost) => ({ type: "settled", stepId, cost });
const record = (stepId, kind, valid = true, over = {}) => ({
  type: "record",
  stepId,
  kind,
  valid,
  findings: [],
  reasons: valid ? [] : ["timeout"],
  ...over,
});
/** A run: started, recorded and settled at `cost`. */
const ran = (stepId, kind, cost, valid = true, over = {}) => [
  started(stepId, kind),
  record(stepId, kind, valid, over),
  settled(stepId, cost),
];
const g3Line = (summary, regrade = false) => ({
  type: "g3",
  stepId: regrade ? "g3-regrade" : "g3",
  kind: regrade ? "regrade" : "g3",
  regrade,
  summary,
});
const g2Passed = () => [
  ...ran("clean-01", "clean", 0.02),
  { type: "continue", for: "probe" },
  ...ran("clean-02", "clean", 0.02),
  ...ran("clean-03", "clean", 0.02),
  ...ran("clean-04", "clean", 0.02),
  ...ran("clean-05", "clean", 0.02),
];
const g3Passed = () => [started("g3", "g3"), g3Line({ failedRun: false, pass: true }), settled("g3", 0.3)];

// --- Classification -----------------------------------------------------------------

describe("classifyRun — validity per reason", () => {
  it("a complete run with every request reported, listed and accepted is valid", () => {
    expect(classify()).toMatchObject({ valid: true, artifact: true, reasons: [] });
  });

  it("a completed verdict `failed` with exit 0 and an artifact is valid when everything else holds (review F1)", () => {
    expect(classify({ review: review({ verdict: "failed" }) })).toMatchObject({ valid: true, artifact: true });
  });

  it("a dated canonical model id is accepted", () => {
    const r = review({ finderTelemetry: { requests: [request({ model: reported("z-ai/glm-5.3-20261001") })] } });
    expect(classify({ review: r }).valid).toBe(true);
  });

  it.each([
    ["an unlisted provider", { provider: reported("Novita") }, "provider-mismatch"],
    ["a missing provider", { provider: missing }, "provider-mismatch"],
    ["a -flash model", { model: reported("z-ai/glm-5.3-flash") }, "model-mismatch"],
    ["a -prime model", { model: reported("z-ai/glm-5.3-prime") }, "model-mismatch"],
    ["a :batch model", { model: reported("z-ai/glm-5.3:batch") }, "model-mismatch"],
    // The SDK would have substituted the requested id; telemetry says missing, and missing is invalid.
    ["a missing model", { model: missing }, "model-mismatch"],
    ["a length finish", { finishReason: "length" }, "length"],
  ])("%s makes the run invalid", (_label, over, reason) => {
    const result = classify({ review: review({ finderTelemetry: { requests: [request(), request(over)] } }) });
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain(reason);
  });

  it("no finder request telemetry at all is invalid, never a free pass", () => {
    expect(classify({ review: review({ finderTelemetry: undefined }) }).reasons).toContain(
      "no-finder-request-telemetry",
    );
  });

  it("a configuration line that is missing or not the decided one is invalid", () => {
    expect(classify({ stderr: STDERR_OK.replace("reasoning=low", "reasoning=high") }).reasons).toContain(
      "configuration-mismatch",
    );
    expect(classify({ stderr: "" }).reasons).toContain("configuration-mismatch");
  });

  it("another finder model in review.json is invalid", () => {
    expect(classify({ review: review({ models: { finder: "z-ai/glm-4.6", judge: "j" } }) }).reasons).toContain(
      "finder-model-mismatch",
    );
  });

  it("a technical judge failure leaves no review.json: invalid, no artifact, classified from stderr", () => {
    const stderr = `${STDERR_OK}\nretrying judge after AI_NoObjectGeneratedError in 4000ms\nNo object generated: could not parse the response.`;
    const result = classifyRun({ exitCode: 1, signal: null, stderr, review: undefined });
    expect(result).toMatchObject({ valid: false, artifact: null, requests: null });
    expect(result.reasons).toEqual(["judge-error"]);
  });

  it.each([
    ["length", "length"],
    ["inline-reasoning", "inline-reasoning"],
    ["parse", "parse"],
  ])("a FinderOutputError (reason=%s) is classified by its reason, never its text", (reason) => {
    const stderr = `${STDERR_OK}\nFinder output rejected (reason=${reason}, request=finalization, provider=Z.AI, finish=stop, no format repair attempted): v`;
    expect(classifyRun({ exitCode: 1, signal: null, stderr }).reasons).toContain(`finder-output:${reason}`);
  });

  it("a timeout after the retry is invalid", () => {
    const stderr = `${STDERR_OK}\nretrying finder after TimeoutError in 2000ms\nThe finder pass exceeded its 300000 ms budget`;
    const result = classifyRun({ exitCode: 1, signal: null, stderr });
    expect(result.reasons).toContain("timeout");
    expect(result.reasons).not.toContain("judge-error");
  });

  it("a provider or model mismatch is read off the step lines when there is no review.json", () => {
    const stderr = [
      EXPECTED_CONFIGURATION_LINE,
      "finder step 1: no getFileContext call (tokens in=1 out=1 total=2) kind=step provider=Novita finish=stop model=missing reasoning=missing",
    ].join("\n");
    expect(classifyRun({ exitCode: 1, signal: null, stderr }).reasons).toEqual(["provider-mismatch", "model-mismatch"]);
  });

  it("a missing API key is a local configuration error, not auth/credit", () => {
    const result = classifyRun({ exitCode: 1, signal: null, stderr: "OPENROUTER_API_KEY is missing" });
    expect(result.reasons).toContain("local-config:missing-api-key");
    expect(result.authCredit).toBeNull();
  });

  it("exit 0 without a review.json is invalid", () => {
    expect(classifyRun({ exitCode: 0, signal: null, stderr: STDERR_OK, review: undefined }).reasons).toContain(
      "no-review-json",
    );
  });
});

// Owner decision 2026-10-14: a 401/402 is CONFIRMED only by the CLI's status line.
describe("auth/credit — confirmed only by the CLI's status line", () => {
  const failed = (lines) =>
    classifyRun({ exitCode: 1, signal: null, stderr: [EXPECTED_CONFIGURATION_LINE, ...lines].join("\n") });

  it.each([401, 402])("a status line %i is a confirmed auth/credit failure", (status) => {
    const result = failed(["No auth credentials found", `api error: status=${String(status)}`]);
    expect(result.authCredit).toBe("confirmed");
    expect(result.reasons).toEqual(expect.arrayContaining([`api-error:${String(status)}`, "auth-or-credit-confirmed"]));
  });

  it("a status line 429 is an ordinary invalid run", () => {
    const result = failed(["Rate limit exceeded", "api error: status=429"]);
    expect(result.authCredit).toBeNull();
    expect(result.reasons).toContain("api-error:429");
    expect(result.valid).toBe(false);
  });

  it.each(["Insufficient credits", "HTTP 402 Payment Required", "Unauthorized"])(
    "text alone (%s) is only suspected: an invalid, unsettled run",
    (text) => {
      const result = failed([text]);
      expect(result.authCredit).toBe("suspected");
      expect(result.reasons).toContain("auth-or-credit-suspected");
      expect(runCost(undefined, result.log).complete).toBe(false);
    },
  );

  it("negative control: 'can only afford 401 tokens' with no status line is NOT confirmed", () => {
    const result = failed(["This request can only afford 401 tokens"]);
    expect(result.authCredit).not.toBe("confirmed");
    expect(result.reasons).not.toContain("auth-or-credit-confirmed");
  });

  it("a status line inside a rejected model output does not count, and its text raises no suspicion", () => {
    const result = failed([
      "rejected output (FinderOutputError, provider=Z.AI, finish=stop, 40 chars): Unauthorized payment",
    ]);
    expect(result.authCredit).toBeNull();
  });

  it("a suspected run's telemetry is never complete, even with a review", () => {
    const log = parseCliStderr(`${STDERR_OK}\nInsufficient credits`);
    expect(runCost(review(), log).complete).toBe(false);
  });
});

describe("parseCliStderr", () => {
  it("reads step lines, retries and the refusal reason, and keeps no free text", () => {
    const parsed = parseCliStderr(
      [
        EXPECTED_CONFIGURATION_LINE,
        "finder step 1: getFileContext src/a.ts (tokens in=1 out=1 total=2) kind=step provider=? finish=tool-calls model=missing reasoning=missing",
        "finder step 2: no getFileContext call (tokens in=1 out=1 total=2) kind=finalization provider=Z.AI finish=stop model=z-ai/glm-5.3 reasoning=7",
        "finder step 3: no getFileContext call (tokens in=1 out=1 total=2) kind=repair provider=Together finish=stop model=z-ai/glm-5.3 reasoning=0",
        "retrying finder after APICallError in 10000ms",
        "Finder output rejected (reason=inline-reasoning, request=step:2, provider=Z.AI, finish=stop, no format repair attempted): v",
        "rejected output (FinderOutputError, provider=Z.AI, finish=stop): reason=inline-reasoning chars=33",
      ].join("\n"),
    );
    // The kind is read off the line: a failed run has no review.json to say which request was which.
    expect(parsed.steps).toEqual([
      { step: 1, kind: "step", provider: null, finishReason: "tool-calls", model: null, reasoningTokens: null },
      {
        step: 2,
        kind: "finalization",
        provider: "Z.AI",
        finishReason: "stop",
        model: "z-ai/glm-5.3",
        reasoningTokens: 7,
      },
      {
        step: 3,
        kind: "repair",
        provider: "Together",
        finishReason: "stop",
        model: "z-ai/glm-5.3",
        reasoningTokens: 0,
      },
    ]);
    expect(parsed.retries).toEqual([{ pass: "finder", error: "APICallError", delayMs: 10_000 }]);
    expect(parsed.finderRefusal).toEqual({ reason: "inline-reasoning", request: "step:2" });
    expect(JSON.stringify(parsed)).not.toContain("chars=33");
  });
});

describe("runCost — complete telemetry", () => {
  const log = parseCliStderr(STDERR_OK);
  it("finder + judge when every request and the judge are priced", () => {
    expect(runCost(review(), log)).toEqual({ finder: 0.01, judge: 0.02, total: 0.03, complete: true });
  });

  it.each([
    ["an unpriced request", review({ finderTelemetry: { cost: 0.01, requests: [request({ cost: null })] } }), log],
    ["an unpriced judge", review({ judgeTelemetry: { attempts: 1 } }), log],
    ["no review.json", undefined, log],
    ["a timeout-triggered retry", review(), parseCliStderr("retrying finder after TimeoutError in 2000ms")],
  ])("is incomplete with %s", (_label, r, l) => {
    expect(runCost(r, l).complete).toBe(false);
  });
});

describe("probeProblems — the G2-01 probe", () => {
  const probe = (over = {}) => ({
    valid: true,
    reasons: [],
    configurationOk: true,
    requests: [request()],
    cost: { complete: true },
    ...over,
  });

  it("passes when every criterion holds", () => {
    expect(probeProblems(probe())).toEqual([]);
  });

  it.each([
    [
      "unreported reasoning tokens",
      { requests: [request({ reasoningTokens: missing })] },
      /reasoning tokens not reported/u,
    ],
    ["an unreported model", { requests: [request({ model: missing })] }, /model not reported/u],
    ["an unreported provider", { requests: [request({ provider: missing })] }, /provider not reported/u],
    ["no cost", { cost: { complete: false } }, /cost telemetry incomplete/u],
    ["no configuration line", { configurationOk: false }, /configuration line/u],
    [
      "inline reasoning",
      { valid: false, reasons: ["finder-output:inline-reasoning"], requests: [] },
      /inline reasoning/u,
    ],
  ])("stops on %s", (_label, over, pattern) => {
    expect(probeProblems(probe(over)).join("; ")).toMatch(pattern);
  });
});

// --- Budget -------------------------------------------------------------------------

describe("admission — T + P, the $3.00 pause, the $3.50 cap", () => {
  it("uses the first-step estimate, then 2 × the largest settled cost of that kind", () => {
    expect(stepEstimate([], "pr269")).toBe(0.45);
    expect(stepEstimate([], "g3")).toBe(0.6);
    expect(stepEstimate([], "regrade")).toBe(0.1);
    expect(stepEstimate([t0(), ...ran("a", "pr269", 0.12), ...ran("b", "pr269", 0.2)], "pr269")).toBeCloseTo(0.4, 10);
  });

  it("T is the larger of the counter delta and the settled sum", () => {
    const series = [t0(100), ...ran("a", "clean", 0.5)];
    expect(seriesSpend(series, 100.2).t).toBeCloseTo(0.5, 10);
    expect(seriesSpend(series, 100.9).t).toBeCloseTo(0.9, 10);
  });

  it.each(["clean", "pr247", "pr269", "g3", "regrade"])("refuses %s while an earlier step is unsettled", (kind) => {
    const series = [t0(), started("x", "pr269"), record("x", "pr269", false)];
    expect(admit(series, kind, 100.1)).toMatchObject({ admit: false, refusal: "unsettled step(s) x" });
  });

  // Kinds whose estimate still fits under the cap at T = $3.00 (G3's $0.60 would be a budget stop).
  it.each(["clean", "pr247", "regrade"])("refuses %s at T ≥ $3.00 until the owner's continue", (kind) => {
    const series = [t0(100), ...ran("a", "pr269", 3.0)];
    expect(admit(series, kind, 103).admit).toBe(false);
    expect(admit(series, kind, 103).refusal).toMatch(/paused at T ≥ \$3\.00/u);
    expect(admit([...series, { type: "continue", for: "pause" }], kind, 103)).toMatchObject({ admit: true });
  });

  it.each(["pr269", "g3", "regrade"])("stops the budget for %s when T + P exceeds $3.50", (kind) => {
    const series = [
      t0(100),
      ...ran("a", kind === "regrade" ? "regrade" : kind, 0.3),
      { type: "continue", for: "pause" },
    ];
    // T = 3.3; P = 0.6 / 0.6 / 0.6 → over the cap.
    expect(admit(series, kind, 103.3)).toMatchObject({ admit: false, budgetStop: true });
  });

  it("admits exactly at the cap", () => {
    expect(admit([t0(100)], "clean", 103.45)).toMatchObject({
      admit: false,
      refusal: expect.stringMatching(/paused/u),
    });
    expect(admit([t0(100), { type: "continue", for: "pause" }], "clean", 103.45)).toMatchObject({ admit: true });
  });

  it("reconcile tolerance is max($0.005, 2 %)", () => {
    expect(reconcileTolerance(0.1)).toBe(0.005);
    expect(reconcileTolerance(1)).toBeCloseTo(0.02, 10);
  });
});

// --- Schedule ---------------------------------------------------------------------

// Owner decision 2026-10-14: a confirmed 401/402 stops every paid step as
// INCOMPLETE (auth/credit); it is not a sample, and only a dated-amendment
// resumption — one per stop — lets the series go on.
describe("scheduleState — auth/credit stop", () => {
  const confirmed = (stepId, kind) =>
    ran(stepId, kind, 0.001, false, { authCredit: "confirmed", reasons: ["auth-or-credit-confirmed"] });
  const resume = { type: "continue", for: "auth-credit", amendment: "gate.md Amendment 1", note: "credit topped up" };

  it("stops the series, and does not consume a G2 sample", () => {
    const series = [t0(), ...confirmed("clean-01", "clean")];
    expect(scheduleState(series)).toMatchObject({ next: null, ended: "INCOMPLETE (auth/credit)" });
    // After the owner's resumption, the next clean run is G2-01 again.
    expect(scheduleState([...series, resume]).next).toBe("clean");
    const after = [...series, resume, ...ran("clean-02", "clean", 0.02)];
    expect(scheduleState(after).waitingFor).toMatch(/G2-01 probe/u);
  });

  it("does not consume a #247 or a G1 sample, nor enter m247", () => {
    const base = [t0(), ...g2Passed(), ...g3Passed()];
    const stopped = [...base, ...confirmed("pr247-01", "pr247"), resume, ...ran("pr247-02", "pr247", 0.08)];
    expect(scheduleState(stopped).next).toBe("pr247");
    expect(meanSettledCost([...stopped, ...ran("pr247-03", "pr247", 0.1)], "pr247")).toBeCloseTo(0.09, 10);
    const g1 = [
      ...base,
      ...ran("pr247-01", "pr247", 0.08),
      ...ran("pr247-02", "pr247", 0.08),
      ...ran("pr269-01", "pr269", 0.15, false),
      ...confirmed("pr269-02", "pr269"),
    ];
    expect(scheduleState(g1).ended).toBe("INCOMPLETE (auth/credit)");
    expect(scheduleState([...g1, resume]).next).toBe("pr269");
  });

  it("needs one resumption per stop — no automatic replacement", () => {
    const series = [t0(), ...confirmed("clean-01", "clean"), resume, ...confirmed("clean-02", "clean")];
    expect(scheduleState(series).ended).toBe("INCOMPLETE (auth/credit)");
  });

  it("a G3 step stopped by a confirmed finder 401/402 is not a G3 result; after resumption G3 runs again", () => {
    const series = [
      t0(),
      ...g2Passed(),
      started("g3", "g3"),
      g3Line({ failedRun: true, authCredit: true, problems: ["x"] }),
      settled("g3", 0.05),
    ];
    expect(scheduleState(series).ended).toBe("INCOMPLETE (auth/credit)");
    expect(scheduleState([...series, resume]).next).toBe("g3");
  });

  it("a suspected run is an ordinary invalid run: it fails G2", () => {
    const series = [t0(), ...ran("clean-01", "clean", 0.01, false, { authCredit: "suspected" })];
    expect(scheduleState(series).ended).toBe("FAIL (G2)");
  });

  it("the outcome names the stop, and the run as not a sample; its cost still counts toward T", () => {
    const series = [t0(100), ...confirmed("clean-01", "clean")];
    const outcome = computeOutcome(series, { counterNow: 100.001 });
    expect(outcome.verdict).toBe("INCOMPLETE (auth/credit)");
    expect(outcome.runs[0]).toMatchObject({ sample: false });
    expect(outcome.spend.settledTotal).toBeCloseTo(0.001, 10);
    expect(renderOutcome(outcome, { at: "t" })).toContain("no — auth/credit stop, not a sample");
  });
});

describe("scheduleState — the sealed order and its stops", () => {
  it("runs G2-01 alone, then waits for the owner's probe confirmation", () => {
    expect(scheduleState([t0()]).next).toBe("clean");
    expect(scheduleState([t0(), ...ran("clean-01", "clean", 0.02)])).toMatchObject({
      next: null,
      waitingFor: expect.stringMatching(/G2-01 probe/u),
    });
  });

  it("any G2 finding fails G2", () => {
    const series = [t0(), ...ran("clean-01", "clean", 0.02, true, { findings: [{ id: "F1" }] })];
    expect(scheduleState(series).ended).toBe("FAIL (G2)");
  });

  it("an invalid G2 run fails G2", () => {
    expect(scheduleState([t0(), ...ran("clean-01", "clean", 0.02, false)]).ended).toBe("FAIL (G2)");
  });

  it("G3 after five clean runs; a grader error allows one re-grade; a second failed run waits for the owner", () => {
    expect(scheduleState([t0(), ...g2Passed()]).next).toBe("g3");
    const graderError = [
      t0(),
      ...g2Passed(),
      started("g3", "g3"),
      g3Line({ failedRun: true, graderError: true }),
      settled("g3", 0.3),
    ];
    expect(scheduleState(graderError).next).toBe("regrade");
    const again = [
      ...graderError,
      started("g3-regrade", "regrade"),
      g3Line({ failedRun: true, problems: ["grader error again"] }, true),
      settled("g3-regrade", 0.05),
    ];
    expect(scheduleState(again)).toMatchObject({
      next: null,
      ended: null,
      waitingFor: expect.stringMatching(/owner decision/u),
    });
  });

  it("a failing G3 ends the series", () => {
    const series = [
      t0(),
      ...g2Passed(),
      started("g3", "g3"),
      g3Line({ failedRun: false, pass: false }),
      settled("g3", 0.3),
    ];
    expect(scheduleState(series).ended).toBe("FAIL (G3)");
  });

  it("an invalid #247 run fails reliability #247 (A5)", () => {
    const series = [t0(), ...g2Passed(), ...g3Passed(), ...ran("pr247-01", "pr247", 0.08, false)];
    expect(scheduleState(series).ended).toBe("FAIL (reliability #247)");
  });

  it("A6 stops only when 53 × m247 > $10.00", () => {
    const base = [t0(), ...g2Passed(), ...g3Passed()];
    const stop = [...base, ...ran("pr247-01", "pr247", 0.19), ...ran("pr247-02", "pr247", 0.19)];
    expect(scheduleState(stop).ended).toBe("FAIL (cost)");
    // m247 = $0.188: 53 × m247 + 13 × I = 9.964 + 2.595 > 10, and still it continues.
    const go = [...base, ...ran("pr247-01", "pr247", 0.188), ...ran("pr247-02", "pr247", 0.188)];
    expect(scheduleState(go).next).toBe("pr269");
  });

  it("G1 fails as soon as a second #269 run is invalid, and is measured after ten", () => {
    const base = [
      t0(),
      ...g2Passed(),
      ...g3Passed(),
      ...ran("pr247-01", "pr247", 0.08),
      ...ran("pr247-02", "pr247", 0.08),
    ];
    const two = [...base, ...ran("pr269-01", "pr269", 0.15, false), ...ran("pr269-02", "pr269", 0.15, false)];
    expect(scheduleState(two).ended).toBe("FAIL (G1)");
    const ten = [...base];
    for (let i = 1; i <= 10; i += 1) ten.push(...ran(`pr269-${String(i)}`, "pr269", 0.15, i !== 3));
    expect(scheduleState(ten).ended).toBe("measured");
  });

  it("a started step without a record blocks the series", () => {
    expect(scheduleState([t0(), started("clean-01", "clean")]).waitingFor).toMatch(
      /clean-01 started and has no record/u,
    );
  });

  it("a budget stop, or a settled total above the cap, ends the series INCOMPLETE (budget)", () => {
    expect(scheduleState([t0(), { type: "budget_stop" }]).ended).toBe("INCOMPLETE (budget)");
    expect(scheduleState([t0(), ...ran("clean-01", "clean", 3.6)]).ended).toBe("INCOMPLETE (budget)");
  });
});

// --- Cost -------------------------------------------------------------------------

describe("monthly cost projection", () => {
  it("reproduces the sonnet-effort `low` record: $6.628083", () => {
    const projection = projectMonthly({ m247: 0.056979, m269: 0.126642, I: 0.19962 });
    expect(projection.total).toBeCloseTo(6.628083, 6);
    expect(projection.terms.pr247).toBeCloseTo(3.019887, 6);
    expect(projection.terms.pr269).toBeCloseTo(1.013136, 6);
    expect(projection.terms.implReview).toBeCloseTo(2.59506, 6);
  });

  it("m247 $0.118, m269 $0.155: the initial $10.08906 is provisional, the lower bound $8.79153, and a $0.04 G5 impl-review passes at $9.05153", () => {
    expect(projectMonthly({ m247: 0.118, m269: 0.155, I: 0.19962 }).total).toBeCloseTo(10.08906, 6);
    expect(preG5LowerBound(0.118, 0.155).total).toBeCloseTo(8.79153, 6);
    const final = finalProjection({ m247: 0.118, m269: 0.155, g5ImplReviewCost: 0.04 });
    expect(final.total).toBeCloseTo(9.05153, 6);
    expect(final.pass).toBe(true);
  });

  it("a skipped G5 impl-review keeps I = $0.199620 and rejects the same example", () => {
    const final = finalProjection({ m247: 0.118, m269: 0.155, g5ImplReviewCost: null });
    expect(final).toMatchObject({ I: 0.19962, implReviewSkipped: true, pass: false });
  });

  it("exactly $10.00 does not reject; above it does", () => {
    expect(exceedsLimit(10)).toBe(false);
    expect(exceedsLimit(10.000001)).toBe(true);
    // A lower bound of exactly $10.00: 53·m247 + 8·m269 = 10 − 1.29753.
    const m269 = (10 - 1.29753 - 53 * 0.1) / 8;
    expect(exceedsLimit(preG5LowerBound(0.1, m269).total)).toBe(false);
    expect(exceedsLimit(preG5LowerBound(0.1, m269 + 0.0001).total)).toBe(true);
  });

  it("A6 is 53 × m247 alone", () => {
    expect(a6Stops(0.188)).toBe(false);
    expect(a6Stops(0.188679)).toBe(false);
    expect(a6Stops(0.18868)).toBe(true);
  });
});

// --- Outcome ----------------------------------------------------------------------

const measured = ({ m247 = 0.08, m269 = 0.15 } = {}) => {
  const series = [
    t0(),
    ...g2Passed(),
    ...g3Passed(),
    ...ran("pr247-01", "pr247", m247, true, { reviewSha256: "a".repeat(64) }),
    ...ran("pr247-02", "pr247", m247, true, { reviewSha256: "a".repeat(64) }),
  ];
  for (let i = 1; i <= 10; i += 1)
    series.push(
      ...ran(`pr269-${String(i).padStart(2, "0")}`, "pr269", m269, true, {
        reviewSha256: "b".repeat(64),
        findings: [{ id: "F1", file: "scripts/spikes/bread-spike.ts" }],
      }),
    );
  return series;
};

/** Real resolver output, with synthetic owner verdicts for this fixture's findings. */
const handReadFor = (series, { approveD2 = true } = {}) => {
  const cases = Object.fromEntries(
    ["pr247", "pr269"].map((kind) => {
      const runs = series.filter((line) => line.type === "record" && line.kind === kind && line.valid);
      const verdicts = new Map(
        runs.flatMap((run) =>
          run.findings.map((finding) => [
            `${run.stepId}#${finding.id}`,
            kind === "pr269" && approveD2 ? "D2" : "accept",
          ]),
        ),
      );
      return [kind, resolveCase(kind, runs, { verdicts, duplicates: [] }).results];
    }),
  );
  return {
    cases,
    problems: [],
    pass: Object.values(cases)
      .flat()
      .every((run) => run.pass),
  };
};

describe("computeOutcome", () => {
  it.each([true, false])("waits for the tenth G1 run's settlement when its validity is %s", (valid) => {
    const series = measured()
      .filter((line) => !(line.type === "settled" && line.stepId === "pr269-10"))
      .map((line) =>
        line.type === "record" && line.stepId === "pr269-10"
          ? { ...line, valid, reasons: valid ? [] : ["timeout"] }
          : line,
      );
    const outcome = computeOutcome(series, { handRead: { pass: true } });
    expect(outcome.state).toMatchObject({
      next: null,
      ended: null,
      waitingFor: expect.stringMatching(/settlement.*pr269-10.*reconcile/u),
    });
    expect(outcome.verdict).toMatch(/^in progress — settlement/u);
    expect(outcome.m269).toBeNull();
    expect(outcome.lowerBound).toBeNull();
    expect(computeOutcome([...series, settled("pr269-10", 0.15)], { handRead: handReadFor(series) }).verdict).toBe(
      "ADMITTED (pending G5)",
    );
  });

  it("applies the cost gate after the final settlement, and the budget stop even while settlement is pending", () => {
    const series = measured({ m247: 0.15, m269: 0.1 }).filter(
      (line) => !(line.type === "settled" && line.stepId === "pr269-10"),
    );
    expect(computeOutcome(series, { handRead: { pass: true } }).verdict).toMatch(/^in progress — settlement/u);
    const settledOutcome = computeOutcome([...series, settled("pr269-10", 0.8)], { handRead: { pass: true } });
    expect(settledOutcome.verdict).toBe("NOT ADMITTED (cost)");
    expect(settledOutcome.m269).toBeCloseTo(0.17, 10);
    expect(settledOutcome.lowerBound.total).toBeGreaterThan(10);
    expect(computeOutcome(series, { counterNow: 103.7, handRead: { pass: true } }).verdict).toBe("INCOMPLETE (budget)");
  });

  it("requires a final #269 cost mean even when terminal records have no unsettled starts", () => {
    const series = measured().filter((line) => !line.stepId?.startsWith("pr269-"));
    for (let i = 1; i <= 10; i += 1) series.push(record(`pr269-${String(i).padStart(2, "0")}`, "pr269"));
    const outcome = computeOutcome(series, { handRead: { pass: true } });
    expect(outcome.m269).toBeNull();
    expect(outcome.state.ended).toBeNull();
    expect(outcome.verdict).toMatch(/^in progress — settlement of the #269 runs/u);
  });

  it.each(["clean-05", "g3"])("requires settlement of earlier paid step %s before final admission", (stepId) => {
    const series = measured().filter((line) => !(line.type === "settled" && line.stepId === stepId));
    const outcome = computeOutcome(series, { handRead: { pass: true } });
    expect(outcome.m247).not.toBeNull();
    expect(outcome.m269).not.toBeNull();
    expect(outcome.state.ended).toBeNull();
    expect(outcome.state.waitingFor).toContain(stepId);
    expect(outcome.verdict).toMatch(/^in progress — settlement/u);
  });

  it("a fully measured series waits for the hand-read, with cost provisional", () => {
    const outcome = computeOutcome(measured(), { counterNow: 102 });
    expect(outcome.verdict).toBe("measured — hand-read pending");
    expect(outcome.gates).toMatchObject({
      G2: "PASS",
      G3: "PASS",
      "reliability #247": "PASS",
      A6: "PASS",
      cost: "provisional until G5",
    });
    expect(outcome.gates.G1).toBe("10/10 valid — PASS");
    expect(outcome.m247).toBeCloseTo(0.08, 10);
  });

  it("a passing hand-read makes it ADMITTED (pending G5) — never ADMITTED outright", () => {
    const series = measured();
    expect(computeOutcome(series, { handRead: handReadFor(series) }).verdict).toBe("ADMITTED (pending G5)");
    expect(computeOutcome(series, { handRead: handReadFor(series, { approveD2: false }) }).verdict).toBe(
      "NOT ADMITTED (hand-read)",
    );
  });

  it.each([
    ["bare pass boolean", () => ({ pass: true })],
    ["null evidence", () => null],
    ["empty case results", () => ({ cases: { pr247: [], pr269: [] }, problems: [], pass: true })],
    ["missing case", (handRead) => ({ ...handRead, cases: { pr269: handRead.cases.pr269 } })],
    [
      "missing run",
      (handRead) => ({ ...handRead, cases: { ...handRead.cases, pr269: handRead.cases.pr269.slice(1) } }),
    ],
    [
      "extra run",
      (handRead) => {
        handRead.cases.pr269.push({ ...handRead.cases.pr269[0], stepId: "dry-269" });
        return handRead;
      },
    ],
    [
      "duplicate run",
      (handRead) => {
        handRead.cases.pr269.push(handRead.cases.pr269[0]);
        return handRead;
      },
    ],
    [
      "stale artifact hash",
      (handRead) => {
        handRead.cases.pr269[0].reviewSha256 = "c".repeat(64);
        return handRead;
      },
    ],
    [
      "missing artifact hash",
      (handRead) => {
        delete handRead.cases.pr269[0].reviewSha256;
        return handRead;
      },
    ],
    [
      "resolver problem",
      (handRead) => ({ ...handRead, problems: ["stored review.json differs from its recorded sha256"] }),
    ],
    [
      "D2 absent despite a pass flag",
      (handRead) => {
        handRead.cases.pr269[0].d2 = 0;
        return handRead;
      },
    ],
    [
      "wrong finding count",
      (handRead) => {
        handRead.cases.pr269[0].n = 0;
        return handRead;
      },
    ],
    ["inconsistent overall pass", (handRead) => ({ ...handRead, pass: false })],
  ])("keeps %s pending instead of admitting or treating it as a measured candidate failure", (_label, change) => {
    const series = measured();
    const handRead = change(handReadFor(series));
    const outcome = computeOutcome(series, { handRead });
    expect(outcome.verdict).toBe("measured — hand-read evidence invalid; regenerate with `resolve`");
    expect(outcome.gates["hand-read"]).toBe("pending (invalid evidence)");
    expect(outcome.handReadProblems.length).toBeGreaterThan(0);
    expect(renderOutcome(outcome, { at: "t" })).toContain("Hand-read evidence:");
  });

  it("requires evidence for valid runs only, including zero-finding #247 runs", () => {
    const series = measured().map((line) =>
      line.type === "record" && line.stepId === "pr269-10" ? { ...line, valid: false, reasons: ["timeout"] } : line,
    );
    const handRead = handReadFor(series);
    expect(handRead.cases.pr247).toHaveLength(2);
    expect(handRead.cases.pr247.every((run) => run.n === 0)).toBe(true);
    expect(handRead.cases.pr269).toHaveLength(9);
    expect(computeOutcome(series, { handRead }).verdict).toBe("ADMITTED (pending G5)");
  });

  it("accepts complete resolver coverage even when its run order differs", () => {
    const series = measured();
    const handRead = handReadFor(series);
    handRead.cases.pr269.reverse();
    expect(computeOutcome(series, { handRead }).verdict).toBe("ADMITTED (pending G5)");
  });

  it("the initial projection above $10.00 alone never fails cost; the lower bound above it does", () => {
    // m247 0.118, m269 0.155 → provisional $10.09, lower bound $8.79.
    const series = measured({ m247: 0.118, m269: 0.155 });
    const provisional = computeOutcome(series, { handRead: handReadFor(series) });
    expect(provisional.provisional.total).toBeGreaterThan(10);
    expect(provisional.verdict).toBe("ADMITTED (pending G5)");
    // Lower bound 7.95 + 0.8 + 1.29753 = $10.04753, with A6 passed and $1.70 spent.
    const over = computeOutcome(measured({ m247: 0.15, m269: 0.1 }), { handRead: { pass: true } });
    expect(over.verdict).toBe("NOT ADMITTED (cost)");
    expect(over.gates.cost).toBe("FAIL (pre-G5 lower bound)");
  });

  it("names the first failed gate", () => {
    const series = [t0(), ...ran("clean-01", "clean", 0.02, false)];
    expect(computeOutcome(series).verdict).toBe("NOT ADMITTED (G2)");
  });

  it("records the overshoot of a step that ended above the cap", () => {
    const outcome = computeOutcome([t0(100), ...ran("clean-01", "clean", 0.02)], { counterNow: 103.7 });
    expect(outcome.verdict).toBe("INCOMPLETE (budget)");
    expect(outcome.spend.overshoot).toBeCloseTo(0.2, 10);
  });

  it("renders a Results block without absolute paths", () => {
    const text = renderOutcome(computeOutcome(measured()), { at: "2026-10-13T00:00:00Z" });
    expect(text).toContain("**Verdict:** measured — hand-read pending");
    expect(text).not.toMatch(/\/home\/|\/tmp\//u);
  });
});

// --- Environment and G3 command ---------------------------------------------------

describe("environment and the G3 command", () => {
  it("names every forbidden variable that is set, ignoring empty ones", () => {
    expect(
      forbiddenEnvSet({
        OPENROUTER_REVIEW_MODEL: "z-ai/glm-4.6",
        OPENROUTER_FINDER_PROVIDERS: " ",
        OPENROUTER_API_KEY: "k",
      }),
    ).toEqual(["OPENROUTER_REVIEW_MODEL"]);
  });

  it("the G3 command selects exactly the four registered cases of the real config, and only the candidate", () => {
    const config = load(readFileSync(resolve(import.meta.dirname, "..", "evals", "promptfooconfig.yaml"), "utf8"));
    const pattern = new RegExp(G3_CASE_FILTER, "u");
    const selected = config.tests.map((test) => test.description).filter((description) => pattern.test(description));
    expect(selected).toHaveLength(4);
    expect(selected.map((description) => description.split(" ")[0])).toEqual([
      "Finds",
      "React",
      "Cross-hunk",
      "Defect-free",
    ]);
    const providers = config.providers
      .map((provider) => provider.label)
      .filter((label) => new RegExp(G3_PROVIDER_FILTER, "u").test(label));
    expect(providers).toEqual(["candidate-glm-5.3"]);
  });

  it("is the plan's exact invocation", () => {
    expect(g3EvalArgs("x.json")).toEqual([
      "run",
      "eval",
      "--",
      "--env-file",
      ".env",
      "--no-cache",
      "-j",
      "1",
      "--repeat",
      "3",
      "--filter-providers",
      "^candidate-glm-5\\.3$",
      "--filter-pattern",
      "^(Finds the material|React 16->19|Cross-hunk contract|Defect-free mechanical rename)",
      "--output",
      "x.json",
    ]);
  });
});
