// Hermetic tests for the gate runner's pure logic (changes `finder-model-swap`
// and `finder-verification`, Phase 2 §1): fake requests, fake model factories
// behind the REAL pipeline — no network, no API key. A broken check must
// surface here, not after a paid series.
import { APICallError } from "ai";
import { describe, expect, it, vi } from "vitest";

import { FinderOutputError } from "../src/output-repair.ts";
import {
  capDiff,
  capProjectContext,
  orderDiffForCap,
  resolveTimeouts,
  runReviewPipeline,
  runVerificationPass,
} from "../src/pipeline.ts";
import { assignFindingIds } from "../src/scorecard.ts";
import { mergeFindings } from "../src/findings.ts";
import { readDiffScoped } from "../src/source-provider.ts";
import {
  ENDPOINT_NAMES,
  G4B_CEILING,
  STAGE_SETS,
  assertSeriesWritable,
  classify,
  describeRequest,
  evaluateAttempt,
  parseGateArgs,
  readSeries,
  reasoningTokensOf,
  recordedEvaluations,
  runGateAttempt,
  runSeries,
  sha256Hex,
  summarizeSeries,
} from "./finder-gate-core.mjs";

const request = (overrides = {}) => ({
  pass: "finder",
  provider: "OpenAI",
  cost: 0.001,
  reasoningTokens: { sdk: 0, openrouter: 0 },
  reasoningTextChars: 0,
  ...overrides,
});
const EXPECTED = { finder: "OpenAI", verifier: "OpenAI" };
const okCalls = (...passes) => passes.map((pass) => ({ pass, outcome: "ok", ms: 10 }));
const verified = { verification: { status: "verified", verdicts: [] }, published: [] };
const evaluate = (requests, overrides = {}) =>
  evaluateAttempt({
    attempt: {
      requests,
      calls: okCalls(...new Set(requests.map((r) => r.pass))),
      retries: [],
      repairs: { finder: 0, verifier: 0, judge: 0 },
      result: verified,
      ...overrides,
    },
    expected: EXPECTED,
  });

const http = (statusCode, headers) =>
  new APICallError({
    message: `HTTP ${String(statusCode)}`,
    url: "u",
    requestBodyValues: {},
    statusCode,
    ...(headers === undefined ? {} : { responseHeaders: headers }),
  });
const finderOutputError = () => new FinderOutputError({ text: "{", validationError: "bad", repaired: true });
const noJitter = () => 0;

describe("ENDPOINT_NAMES", () => {
  it("maps the candidate slugs to the names the endpoints API reports, including MAIN's anthropic", () => {
    expect(ENDPOINT_NAMES).toMatchObject({
      anthropic: "Anthropic",
      openai: "OpenAI",
      alibaba: "Alibaba",
      minimax: "Minimax",
      "z-ai": "Z.AI",
      novita: "Novita",
      deepinfra: "DeepInfra",
      venice: "Venice",
    });
  });
});

describe("parseGateArgs", () => {
  const base = [
    "--stages",
    "finder,verifier,judge",
    "--verifier-model",
    "openai/gpt-6-luna",
    "--verifier-endpoint",
    "openai",
    "--model",
    "openai/gpt-6-luna",
    "--endpoint",
    "openai",
    "--case",
    "clean",
    "--diff",
    "d",
    "--rules",
    "r",
    "--source-root",
    "s",
    "--n",
    "5",
    "--out",
    "o",
    "--max-spend",
    "0.2",
  ];
  const without = (name) => {
    const i = base.indexOf(name);
    return [...base.slice(0, i), ...base.slice(i + 2)];
  };

  it("requires --stages, and checks it before any other flag", () => {
    expect(() => parseGateArgs(["--model", "x", "--endpoint", "openai", "--case", "c"])).toThrow("missing --stages");
    expect(() => parseGateArgs(without("--stages"))).toThrow("missing --stages");
  });

  it.each(["finder", "finder,judge", "verifier,judge", "finder,verifier,judge,extra"])(
    "refuses the stage set %s",
    (stages) => {
      expect(() => parseGateArgs([...without("--stages"), "--stages", stages])).toThrow(/--stages must be one of/u);
    },
  );

  it("accepts both stage sets and resolves the verifier's expected provider", () => {
    for (const stages of STAGE_SETS) {
      expect(parseGateArgs([...without("--stages"), "--stages", stages])).toMatchObject({ stages });
    }
    expect(
      parseGateArgs([
        ...without("--verifier-endpoint"),
        "--verifier-endpoint",
        "anthropic",
        ...["--verifier-model", "anthropic/claude-sonnet-5"],
      ]),
    ).toMatchObject({ verifierEndpoint: "anthropic", expectedVerifierName: "Anthropic" });
  });

  it.each(["--verifier-model", "--verifier-endpoint"])("requires %s", (name) => {
    expect(() => parseGateArgs(without(name))).toThrow(`missing ${name}`);
  });

  // impl-review phase 2 F8: no unlimited default for a paid series.
  it("requires --max-spend: a paid series never starts without a cap", () => {
    expect(() => parseGateArgs(without("--max-spend"))).toThrow("missing --max-spend");
  });

  it.each(["-1", "abc", "", "Infinity"])("refuses --max-spend %j", (value) => {
    expect(() => parseGateArgs([...without("--max-spend"), "--max-spend", value])).toThrow(/--max-spend/u);
  });

  it("requires --model: there is no default model to fall back to", () => {
    expect(() => parseGateArgs(without("--model"))).toThrow("missing --model");
  });

  it("rejects an unknown endpoint slug rather than guessing its provider name", () => {
    expect(() => parseGateArgs([...without("--endpoint"), "--endpoint", "openai/flex"])).toThrow(/unknown endpoint/u);
  });

  it("defaults to the whole series, starting at 1", () => {
    expect(parseGateArgs(base)).toMatchObject({ start: 1, through: 5, append: false, expectedName: "OpenAI" });
  });

  it("--through 1 runs only the A3 probe and leaves 2..5 unrecorded", () => {
    expect(parseGateArgs([...base, "--through", "1"])).toMatchObject({ start: 1, through: 1 });
  });

  it("--start 2 --append continues the same series", () => {
    expect(parseGateArgs([...base, "--start", "2", "--append"])).toMatchObject({ start: 2, through: 5, append: true });
  });

  it.each([
    ["--through beyond n", ["--through", "6"]],
    ["--through before start", ["--start", "3", "--append", "--through", "2"]],
    ["--start without --append", ["--start", "2"]],
  ])("refuses %s", (_label, extra) => {
    expect(() => parseGateArgs([...base, ...extra])).toThrow();
  });
});

// A series file as the runner writes it: a `started` line before each paid
// call, an attempt record after it, every line carrying the series identity.
const IDENTITY = {
  stages: "finder,verifier",
  model: "openai/gpt-6-luna",
  endpoint: "openai",
  verifierModel: "openai/gpt-6-luna",
  verifierEndpoint: "openai",
  case: "clean",
  n: 5,
  diffSha256: "d".repeat(64),
  rulesSha256: "r".repeat(64),
  sourceRootTree: "t".repeat(40),
};
const INPUTS = {
  diffSha256: IDENTITY.diffSha256,
  rulesSha256: IDENTITY.rulesSha256,
  sourceRootTree: IDENTITY.sourceRootTree,
};
const startedLine = (attempt, identity = IDENTITY) => JSON.stringify({ kind: "started", ...identity, attempt });
const recordLine = (attempt, identity = IDENTITY) => JSON.stringify({ kind: "attempt", ...identity, attempt });
const file = (...lines) => lines.map((line) => `${line}\n`).join("");
const completed = (...attempts) => file(...attempts.flatMap((a) => [startedLine(a), recordLine(a)]));
const writable = (overrides) =>
  assertSeriesWritable({
    append: true,
    start: 2,
    existingText: completed(1),
    out: "o",
    stages: IDENTITY.stages,
    model: IDENTITY.model,
    endpoint: IDENTITY.endpoint,
    verifierModel: IDENTITY.verifierModel,
    verifierEndpoint: IDENTITY.verifierEndpoint,
    caseName: IDENTITY.case,
    n: IDENTITY.n,
    inputs: INPUTS,
    ...overrides,
  });

describe("readSeries", () => {
  it("pairs started lines with records, and lists the attempt that never finished", () => {
    const series = readSeries(file(startedLine(1), recordLine(1), startedLine(2)));
    expect(series.attempts).toEqual([
      { attempt: 1, started: true, completed: true },
      { attempt: 2, started: true, completed: false },
    ]);
    expect(series.maxAttempt).toBe(2);
    expect(series.interrupted).toEqual([2]);
    expect(series.identities).toEqual([IDENTITY]);
  });

  it("refuses a corrupt line rather than continuing blind", () => {
    expect(() => readSeries(file(recordLine(1), "{not json"))).toThrow(/corrupt/u);
    expect(() => readSeries(file(JSON.stringify({ kind: "attempt" })))).toThrow(/no attempt number/u);
  });
});

describe("assertSeriesWritable", () => {
  it("starts a fresh series in a missing or empty file", () => {
    expect(() => writable({ append: false, start: 1, existingText: undefined })).not.toThrow();
    expect(() => writable({ append: false, start: 1, existingText: "" })).not.toThrow();
  });

  it("refuses to overwrite a recorded series — repeating --through 1 would re-run the A3 probe", () => {
    expect(() => writable({ append: false, start: 1 })).toThrow(/never overwrite/u);
  });

  it("continues past the recorded attempts, returning the recorded state", () => {
    expect(writable({ start: 2 })).toMatchObject({ maxAttempt: 1, interrupted: [] });
    expect(() => writable({ start: 4, existingText: completed(1, 2, 3) })).not.toThrow();
  });

  it("refuses to re-run a recorded attempt", () => {
    expect(() => writable({ start: 1 })).toThrow(/already recorded.*refusing to re-run/u);
  });

  it("refuses --append onto a file that does not exist, or an empty one", () => {
    expect(() => writable({ existingText: undefined })).toThrow(/does not exist/u);
    expect(() => writable({ existingText: "" })).toThrow(/is empty/u);
  });

  // impl-review-phase-1 F1: the four ways a continuation could add, skip or
  // repeat a G2 attempt.
  it("refuses a sixth attempt: --n 6 does not match the n the series was recorded with", () => {
    expect(() => writable({ n: 6 })).toThrow(/different series.*"n":5.*refusing to mix/u);
  });

  it("refuses a gap: --start 3 after attempt 1 would leave attempt 2 unrecorded forever", () => {
    expect(() => writable({ start: 3 })).toThrow(/attempt 2 is unrecorded.*must start at 2, not 3/u);
  });

  it.each([
    ["model", { model: "qwen/qwen3.8-flash" }],
    ["endpoint", { endpoint: "alibaba" }],
    ["case", { caseName: "269" }],
    ["verifier model (a CONTROL series continued as MAIN)", { verifierModel: "anthropic/claude-sonnet-5" }],
    ["verifier endpoint", { verifierEndpoint: "anthropic" }],
    ["stage set", { stages: "finder,verifier,judge" }],
    // impl-review phase 2 F4: the inputs are part of the series.
    ["diff (input hash mismatch)", { inputs: { ...INPUTS, diffSha256: "e".repeat(64) } }],
    ["rules file", { inputs: { ...INPUTS, rulesSha256: "s".repeat(64) } }],
    ["source tree", { inputs: { ...INPUTS, sourceRootTree: "u".repeat(40) } }],
  ])("refuses to mix series: a different %s than the file records", (_label, overrides) => {
    expect(() => writable(overrides)).toThrow(/different series/u);
  });

  it("an interrupted attempt counts as failed: the continuation starts after it and never re-runs it", () => {
    const interrupted = file(startedLine(1), recordLine(1), startedLine(2));
    expect(() => writable({ start: 2, existingText: interrupted })).toThrow(
      /attempt 2 started and never finished.*never re-run.*--start 3/u,
    );
    expect(writable({ start: 3, existingText: interrupted })).toMatchObject({ interrupted: [2], maxAttempt: 2 });
  });
});

describe("evaluateAttempt — gated on finder and verifier, reported on the judge", () => {
  it("passes a valid attempt whose finder and verifier requests all match", () => {
    expect(evaluate([request(), request({ pass: "verifier" })])).toMatchObject({
      outcome: "valid",
      invalidated: false,
      reasoningLeak: false,
      costComplete: true,
      measurementError: null,
      g1Pass: true,
    });
  });

  it("passes an anthropic verifier against its own expected provider (MAIN)", () => {
    const result = evaluateAttempt({
      attempt: {
        requests: [request(), request({ pass: "verifier", provider: "Anthropic" })],
        calls: okCalls("finder", "verifier"),
        retries: [],
        repairs: { finder: 0, verifier: 0, judge: 0 },
        result: verified,
      },
      expected: { finder: "OpenAI", verifier: "Anthropic" },
    });
    expect(result.invalidated).toBe(false);
    expect(result.g1Pass).toBe(true);
  });

  it.each([
    ["a different verifier provider", "Azure"],
    ["a missing verifier provider", null],
  ])("invalidates the attempt on %s", (_label, provider) => {
    const result = evaluate([request(), request({ pass: "verifier", provider })]);
    expect(result.invalidated).toBe(true);
    expect(result.providerMismatch).toEqual([{ pass: "verifier", provider }]);
    expect(result.g1Pass).toBe(false);
  });

  it.each([
    ["SDK reasoning tokens", { reasoningTokens: { sdk: 3, openrouter: 0 } }],
    ["OpenRouter reasoning tokens", { reasoningTokens: { sdk: null, openrouter: 3 } }],
    ["reasoning text", { reasoningTextChars: 12 }],
  ])("treats %s on a VERIFIER request as an A3 leak that fails the attempt", (_label, overrides) => {
    const result = evaluate([request(), request({ pass: "verifier", ...overrides })]);
    expect(result.reasoningLeak).toBe(true);
    expect(result.g1Pass).toBe(false);
  });

  it("reports a judge reasoning leak and a foreign judge provider without failing the attempt", () => {
    const result = evaluate([
      request(),
      request({ pass: "verifier" }),
      request({ pass: "judge", provider: "Google", reasoningTokens: { sdk: 50, openrouter: 50 } }),
    ]);
    expect(result.judge).toEqual({ providers: ["Google"], reasoning: true });
    expect(result.reasoningLeak).toBe(false);
    expect(result.invalidated).toBe(false);
    expect(result.g1Pass).toBe(true);
  });

  it("one null judge cost leaves the attempt's cost incomplete — never free", () => {
    const result = evaluate([request(), request({ pass: "verifier" }), request({ pass: "judge", cost: null })]);
    expect(result.costComplete).toBe(false);
    expect(result.cost).toMatchObject({ finder: 0.001, verifier: 0.001, judge: 0, total: 0.002 });
  });

  // Owner, Phase 1 interpretation 6: "not called, nothing sent" is complete;
  // "called, cost missing" is not.
  it("a verifier that was never called leaves the cost complete", () => {
    expect(evaluate([request()]).costComplete).toBe(true);
  });

  it("a verifier that was called and left no priced request makes the cost incomplete", () => {
    const result = evaluate([request()], { calls: okCalls("finder", "verifier") });
    expect(result.costComplete).toBe(false);
  });

  it("marks an attempt with no requests at all as cost-incomplete", () => {
    expect(evaluate([], { error: http(429), result: undefined, calls: [] }).costComplete).toBe(false);
  });

  it("counts a judge timeout that was retried successfully as a timeout (R3)", () => {
    const result = evaluate([request(), request({ pass: "verifier" }), request({ pass: "judge" })], {
      calls: [
        ...okCalls("finder", "verifier"),
        { pass: "judge", outcome: "timeout", ms: 120_000 },
        { pass: "judge", outcome: "ok", ms: 900 },
      ],
    });
    expect(result.timeouts).toEqual({ verifier: 0, judge: 1 });
    expect(result.g1Pass).toBe(true);
    expect(result.latencyMs.judge).toBe(120_900);
  });

  it.each([
    ["skipped-no-source", { verification: { status: "skipped-no-source", verdicts: [] }, published: [] }],
    ["a missing verification block", { published: [] }],
  ])("treats %s as a MEASUREMENT ERROR, never a valid attempt", (_label, result) => {
    const evaluation = evaluate([request()], { result });
    expect(evaluation.outcome).toBe("measurement-error");
    expect(evaluation.measurementError).toMatch(/verification status/u);
    expect(evaluation.g1Pass).toBe(false);
  });

  it("treats the abort for an unusable source root as a MEASUREMENT ERROR (impl-review phase 1 F1)", () => {
    const evaluation = evaluate([request()], {
      result: undefined,
      error: new Error("Verification is required (--require-verification) but the source is unusable: …"),
    });
    expect(evaluation.outcome).toBe("measurement-error");
    expect(evaluation.measurementError).toBe("verification aborted: no usable source");
  });

  it.each([
    ["a finder output error", "finder", finderOutputError(), "finder:FinderOutputError"],
    ["a verifier 429 after its retry", "verifier", http(429), "verifier:APICallError-429"],
    ["a judge timeout after its retry", "judge", new DOMException("t", "TimeoutError"), "judge:timeout"],
  ])("fails (never skips) an attempt ending in %s, naming the pass", (_label, pass, error, outcome) => {
    const evaluation = evaluate([request()], {
      result: undefined,
      error,
      calls: [...okCalls("finder"), { pass, outcome: classify(error), ms: 5 }],
    });
    expect(evaluation.outcome).toBe(outcome);
    expect(evaluation.measurementError).toBeNull();
    expect(evaluation.g1Pass).toBe(false);
  });

  it("reports a repaired attempt as valid-after-repair, still passing", () => {
    expect(evaluate([request()], { repairs: { finder: 1, verifier: 1, judge: 0 } })).toMatchObject({
      outcome: "valid-after-repair",
      g1Pass: true,
    });
  });
});

describe("summarizeSeries", () => {
  const evaluation = (overrides = {}) => ({
    g1Pass: true,
    measurementError: null,
    cost: { total: 0.03 },
    costComplete: true,
    timeouts: { verifier: 0, judge: 0 },
    latencyMs: { judge: 1000 },
    ...overrides,
  });

  it("passes G4b at or under the ceiling, and reports the judge latency median and max", () => {
    const summary = summarizeSeries([evaluation(), evaluation({ latencyMs: { judge: 3000 } })]);
    expect(summary.g4b).toMatchObject({ pass: true, median: 0.03, ceiling: G4B_CEILING, incompleteCost: 0 });
    expect(summary.judgeLatencyMs).toEqual({ median: 2000, max: 3000 });
    expect(summary.timeouts.pass).toBe(true);
  });

  it("fails G4b on one incomplete cost, and the timeout clause on one retried timeout", () => {
    const summary = summarizeSeries([
      evaluation(),
      evaluation({ costComplete: false, timeouts: { verifier: 0, judge: 1 } }),
    ]);
    expect(summary.g4b.pass).toBe(false);
    expect(summary.timeouts).toEqual({ verifier: 0, judge: 1, pass: false });
  });

  it("fails G4b above the ceiling", () => {
    expect(summarizeSeries([evaluation({ cost: { total: G4B_CEILING + 0.001 } })]).g4b.pass).toBe(false);
  });
});

describe("classify", () => {
  it.each([
    [finderOutputError(), "FinderOutputError"],
    [http(429), "APICallError-429"],
    [new DOMException("timed out", "TimeoutError"), "timeout"],
    [new Error("x", { cause: new DOMException("t", "TimeoutError") }), "timeout"],
  ])("classifies %s", (error, expected) => {
    expect(classify(error)).toBe(expected);
  });
});

describe("reasoningTokensOf", () => {
  it("reads both channels, and null — never a fabricated 0 — when a channel is absent", () => {
    expect(
      reasoningTokensOf({
        usage: { outputTokenDetails: { reasoningTokens: 4 } },
        providerMetadata: { openrouter: { usage: { completionTokensDetails: { reasoningTokens: 0 } } } },
      }),
    ).toEqual({ sdk: 4, openrouter: 0 });
    expect(reasoningTokensOf({})).toEqual({ sdk: null, openrouter: null });
  });
});

describe("describeRequest", () => {
  it("records the pass, provider, cost and both reasoning channels; null where unreported", () => {
    expect(
      describeRequest("verifier", {
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 2, outputTokenDetails: { reasoningTokens: 0 } },
        providerMetadata: { openrouter: { provider: "OpenAI", usage: { cost: 0.0004 } } },
      }),
    ).toEqual({
      pass: "verifier",
      provider: "OpenAI",
      finishReason: "stop",
      cost: 0.0004,
      inputTokens: 10,
      outputTokens: 2,
      reasoningTokens: { sdk: 0, openrouter: null },
      reasoningTextChars: 0,
      timedOut: false,
    });
    expect(describeRequest("judge", { providerMetadata: { openrouter: { provider: "" } } })).toMatchObject({
      provider: null,
      cost: null,
    });
  });
});

// --- runGateAttempt: the real pipeline behind fake model factories ---

const FILES = {
  "src/a.ts": ["// header", "export function a(items) {", "  return items[items.length];", "}"].join("\n"),
};
const DIFF = ["diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1,1 +1,4 @@", "+x"].join(
  "\n",
);
const reader = () =>
  readDiffScoped({
    allowedPaths: new Set(Object.keys(FILES)),
    root: "/repo",
    realpath: (path) => path,
    isRegularFile: () => true,
    readFile: (path) => {
      const name = Object.keys(FILES).find((candidate) => path.endsWith(candidate));
      if (name === undefined) throw new Error("ENOENT");
      return FILES[name];
    },
  });
const step = (provider, cost = 0.001) => ({
  finishReason: "stop",
  toolCalls: [],
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, outputTokenDetails: {} },
  providerMetadata: { openrouter: { provider, usage: { cost } } },
});
const FINDING = {
  file: "src/a.ts",
  startLine: 3,
  severity: "major",
  category: "correctness",
  description: "reads past the end",
  suggestion: "use <",
};
const judgeResult = () => ({
  summary: "judged",
  scores: {},
  verdict: "passed",
  verdictReason: "fine",
  droppedFindingIdRefs: [],
});

/** Fake production factories: each call emits the given steps through the chained onStepEnd. */
function fakeApi({ findings = [FINDING], verdict = "confirmed", judgeFailures = [] } = {}) {
  const judgeErrors = [...judgeFailures];
  return {
    runReviewPipeline,
    runVerificationPass,
    capDiff,
    orderDiffForCap,
    capProjectContext,
    resolveTimeouts,
    assignFindingIds,
    mergeFindings,
    createReviewer: (options) => ({
      review: async () => {
        options.onStepEnd?.(step("OpenAI"));
        return { summary: "finder summary", findings };
      },
    }),
    createVerifier: (options) => ({
      verify: async (input) => {
        options.onStepEnd?.(step("OpenAI"));
        return {
          verdicts: input.findings.map((f) => ({
            id: f.id,
            verdict,
            quote: "return items[items.length];",
            reason: "shown",
          })),
        };
      },
    }),
    createJudge: (options) => ({
      judge: async () => {
        const failure = judgeErrors.shift();
        if (failure !== undefined) throw failure;
        options.onStepEnd?.(step("Anthropic", 0.02));
        return judgeResult();
      },
    }),
  };
}
const attemptWith = (api, overrides = {}) =>
  runGateAttempt({
    stages: "finder,verifier,judge",
    api,
    diff: DIFF,
    rules: "rules",
    reader: reader(),
    finderModel: "openai/gpt-6-luna",
    verifierModel: "openai/gpt-6-luna",
    sleep: async () => {},
    ...overrides,
  });

describe("runGateAttempt", () => {
  it("passes the pipeline the reader and requireVerification: true, with no outer retry", async () => {
    const runPipeline = vi.fn(async () => ({
      findings: [],
      preVerificationFindingCount: 0,
      verification: { status: "no-findings", verdicts: [], unknownVerdictIds: [] },
      verdict: "passed",
    }));
    const theReader = reader();
    await attemptWith({ ...fakeApi(), runReviewPipeline: runPipeline }, { reader: theReader });
    expect(runPipeline).toHaveBeenCalledTimes(1);
    expect(runPipeline.mock.calls[0][0]).toMatchObject({
      reader: theReader,
      requireVerification: true,
      overrides: { reviewModel: "openai/gpt-6-luna", verifierModel: "openai/gpt-6-luna" },
    });
  });

  it("records every request of the real pipeline by pass, and publishes a confirmed finding", async () => {
    const attempt = await attemptWith(fakeApi());
    expect(attempt.error).toBeUndefined();
    expect(attempt.requests.map((r) => [r.pass, r.provider])).toEqual([
      ["finder", "OpenAI"],
      ["verifier", "OpenAI"],
      ["judge", "Anthropic"],
    ]);
    expect(attempt.result.published.map((f) => f.id)).toEqual(["F1"]);
    const evaluation = evaluateAttempt({ attempt, expected: EXPECTED });
    expect(evaluation).toMatchObject({ outcome: "valid", g1Pass: true, costComplete: true });
    expect(evaluation.cost.total).toBeCloseTo(0.022, 10);
  });

  it("an attempt with zero findings sends no verifier request and can pass", async () => {
    const attempt = await attemptWith(fakeApi({ findings: [] }));
    expect(attempt.requests.some((r) => r.pass === "verifier")).toBe(false);
    expect(attempt.calls.some((c) => c.pass === "verifier")).toBe(false);
    expect(attempt.result.verification.status).toBe("no-findings");
    expect(evaluateAttempt({ attempt, expected: EXPECTED })).toMatchObject({ g1Pass: true, costComplete: true });
  });

  it("a judge timeout retried once by the pipeline counts as a timeout, and the attempt still completes", async () => {
    const attempt = await attemptWith(fakeApi({ judgeFailures: [new DOMException("t", "TimeoutError")] }));
    expect(attempt.retries).toEqual([{ pass: "judge", class: "timeout", delayMs: expect.any(Number) }]);
    const evaluation = evaluateAttempt({ attempt, expected: EXPECTED });
    expect(evaluation.timeouts).toEqual({ verifier: 0, judge: 1 });
    expect(evaluation.g1Pass).toBe(true);
  });

  it("an unusable source root aborts the attempt as a measurement error, before any verifier call", async () => {
    const broken = readDiffScoped({
      allowedPaths: new Set(["src/a.ts"]),
      root: "/nowhere",
      realpath: () => {
        throw new Error("ENOENT");
      },
      isRegularFile: () => true,
      readFile: () => {
        throw new Error("ENOENT");
      },
    });
    const attempt = await attemptWith(fakeApi(), { reader: broken });
    expect(attempt.calls.some((c) => c.pass === "verifier")).toBe(false);
    expect(evaluateAttempt({ attempt, expected: EXPECTED })).toMatchObject({
      outcome: "measurement-error",
      measurementError: "verification aborted: no usable source",
      g1Pass: false,
    });
  });

  it("G2 (finder,verifier) runs the finder and the verification pass only — no judge", async () => {
    const api = fakeApi({ verdict: "refuted" });
    const createJudge = vi.fn(api.createJudge);
    const attempt = await attemptWith({ ...api, createJudge }, { stages: "finder,verifier" });
    expect(createJudge).not.toHaveBeenCalled();
    expect(attempt.requests.map((r) => r.pass)).toEqual(["finder", "verifier"]);
    expect(attempt.result.published).toEqual([]);
    expect(attempt.result.verification.status).toBe("verified");
    expect(evaluateAttempt({ attempt, expected: EXPECTED }).g1Pass).toBe(true);
  });
});

// --- impl-review phase 2 (owner triage 2026-10-04) ---

describe("F1 — a timeout leaves the cost incomplete, and its requests say so", () => {
  it("a finder timeout followed by a priced, successful retry is cost-INCOMPLETE", () => {
    const result = evaluate([request(), request({ pass: "verifier" })], {
      calls: [
        { pass: "finder", outcome: "timeout", ms: 300_000 },
        { pass: "finder", outcome: "ok", ms: 900 },
        ...okCalls("verifier"),
      ],
    });
    expect(result.costComplete).toBe(false);
  });

  it("a retried judge timeout is cost-incomplete, and the timed-out call's requests carry timedOut: true", async () => {
    // The timed-out judge call emits one step before the abort, as a finder
    // loop or a repair would.
    let judgeCalls = 0;
    const api = fakeApi();
    const attempt = await attemptWith({
      ...api,
      createJudge: (options) => ({
        judge: async () => {
          judgeCalls += 1;
          options.onStepEnd?.(step("Anthropic", 0.02));
          if (judgeCalls === 1) throw new DOMException("t", "TimeoutError");
          return judgeResult();
        },
      }),
    });
    const judgeRequests = attempt.requests.filter((r) => r.pass === "judge");
    expect(judgeRequests.map((r) => r.timedOut)).toEqual([true, false]);
    expect(attempt.requests.filter((r) => r.pass !== "judge").every((r) => r.timedOut === false)).toBe(true);
    const evaluation = evaluateAttempt({ attempt, expected: EXPECTED });
    expect(evaluation.costComplete).toBe(false);
    expect(summarizeSeries([evaluation]).g4b.pass).toBe(false);
  });
});

describe("F3 — an OpenRouter account error is a measurement error", () => {
  it.each([401, 402])("HTTP %i is a measurement error, never a model failure", (status) => {
    const evaluation = evaluate([], {
      result: undefined,
      error: http(status),
      calls: [{ pass: "finder", outcome: `APICallError-${String(status)}`, ms: 5 }],
    });
    expect(evaluation.outcome).toBe("measurement-error");
    expect(evaluation.measurementError).toBe(`OpenRouter account error (HTTP ${String(status)})`);
    expect(evaluation.g1Pass).toBe(false);
  });

  it("HTTP 403 stays a model/provider failure", () => {
    const evaluation = evaluate([], { result: undefined, error: http(403), calls: [] });
    expect(evaluation.measurementError).toBeNull();
  });
});

// A recorded attempt line as runSeries writes it: identity + evaluation.
const completedWith = (...attempts) => file(...attempts.flatMap((a) => [startedLine(a), recordedLine(a)]));
const recordedLine = (attempt, evaluation = {}) =>
  JSON.stringify({
    kind: "attempt",
    ...IDENTITY,
    attempt,
    outcome: "valid",
    measurementError: null,
    g1Pass: true,
    cost: { finder: 0.01, verifier: 0.01, judge: 0.02, total: 0.04 },
    costComplete: true,
    timeouts: { verifier: 0, judge: 0 },
    latencyMs: { judge: 1000 },
    ...evaluation,
  });
const okAttempt = (cost = 0.03) => ({
  requests: [request({ cost }), request({ pass: "verifier", cost: 0 })],
  calls: okCalls("finder", "verifier"),
  retries: [],
  repairs: { finder: 0, verifier: 0, judge: 0 },
  result: { ...verified, preVerificationFindingCount: 0 },
});
const seriesRun = async ({ existing = "", start = 1, through = 5, maxSpend = 1, attempts }) => {
  const lines = [];
  const log = [];
  const queue = [...attempts];
  const series = readSeries(existing);
  const summary = await runSeries({
    identity: IDENTITY,
    idPrefix: "openai-openai-clean",
    start,
    through,
    maxSpend,
    series,
    expected: EXPECTED,
    hasJudge: false,
    runAttempt: async () => queue.shift(),
    appendLine: (line) => lines.push(line),
    log: (line) => log.push(line),
  });
  return { summary, lines, log };
};

describe("F2 — the SUMMARY is the series verdict, and --max-spend caps the series", () => {
  it("a continuation's gates include the attempts an earlier invocation recorded", async () => {
    const existing = file(
      startedLine(1),
      recordedLine(1, { costComplete: false, timeouts: { verifier: 0, judge: 1 } }),
    );
    const { summary } = await seriesRun({ existing, start: 2, through: 2, attempts: [okAttempt()] });
    expect(summary.recordedBefore).toBe(1);
    expect(summary.gates).toMatchObject({ scope: "series", attempts: 2, valid: 2 });
    expect(summary.gates.g4b).toMatchObject({ pass: false, incompleteCost: 1 });
    expect(summary.gates.timeouts).toMatchObject({ judge: 1, pass: false });
    expect(summary.seriesSpend).toBeCloseTo(0.07, 10);
  });

  it("the recorded spend counts against --max-spend: a continuation at the cap runs nothing", async () => {
    const existing = completedWith(1);
    const { summary, lines } = await seriesRun({ existing, start: 2, through: 3, maxSpend: 0.04, attempts: [] });
    expect(summary.notRun).toEqual({ budget: 2, measurementError: 0 });
    expect(lines).toEqual([]);
  });

  it("an interrupted attempt counts as a FAILED attempt with INCOMPLETE cost", async () => {
    const existing = file(startedLine(1), recordedLine(1), startedLine(2));
    const { summary } = await seriesRun({ existing, start: 3, through: 3, attempts: [okAttempt()] });
    expect(summary.interruptedBefore).toEqual([2]);
    expect(summary.gates).toMatchObject({ attempts: 3, valid: 2 });
    expect(summary.gates.g4b).toMatchObject({ pass: false, incompleteCost: 1 });
  });

  it("recordedEvaluations reads a record without a cost fail-closed", () => {
    const { evaluations } = recordedEvaluations(readSeries(file(recordLine(1))));
    expect(evaluations[0]).toMatchObject({ g1Pass: false, costComplete: false, cost: { total: 0 } });
  });
});

describe("F3 — the first measurement error stops the series", () => {
  it("records the failing attempt, then leaves every remaining attempt not-run (measurement error)", async () => {
    const accountError = { ...okAttempt(), result: undefined, requests: [], error: http(402) };
    const { summary, lines, log } = await seriesRun({ through: 3, attempts: [accountError, okAttempt(), okAttempt()] });
    expect(lines.filter((l) => l.kind === "attempt").map((l) => l.outcome)).toEqual(["measurement-error"]);
    expect(lines.filter((l) => l.kind === "started")).toHaveLength(1);
    expect(summary.notRun).toEqual({ budget: 0, measurementError: 2 });
    expect(summary.stoppedBy).toBe("OpenRouter account error (HTTP 402)");
    expect(log.filter((l) => l.includes("not-run (measurement error"))).toHaveLength(2);
  });

  it("a continuation of a series that already recorded a measurement error runs nothing", async () => {
    const existing = file(
      startedLine(1),
      recordedLine(1, { outcome: "measurement-error", measurementError: "verification status null", g1Pass: false }),
    );
    const { summary, lines } = await seriesRun({ existing, start: 2, through: 2, attempts: [okAttempt()] });
    expect(lines).toEqual([]);
    expect(summary.notRun.measurementError).toBe(1);
  });
});

describe("F4 — inputs are hashed as read", () => {
  it("sha256Hex is the hex sha256 of the UTF-8 text", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("F9 — the G2 path's finder request equals runReviewPipeline's", () => {
  it("same finder options and the same review request for the same input", async () => {
    const captured = { pipeline: [], g2: [] };
    const capturing = (target) => {
      const api = fakeApi({ findings: [] });
      return {
        ...api,
        createReviewer: (options) => ({
          review: async (...args) => {
            const { onStepEnd: _s, onOutputRepair: _r, ...rest } = options;
            target.push({ options: rest, args });
            options.onStepEnd?.(step("OpenAI"));
            return { summary: "s", findings: [] };
          },
        }),
      };
    };
    const source = { fake: "source" };
    const longRules = "r".repeat(12_000);
    for (const [stages, target] of [
      ["finder,verifier,judge", captured.pipeline],
      ["finder,verifier", captured.g2],
    ]) {
      await attemptWith(capturing(target), { stages, source, rules: longRules, finderMaxSteps: 5, timeouts: {} });
    }
    expect(captured.g2).toHaveLength(1);
    expect(captured.g2[0]).toEqual(captured.pipeline[0]);
    expect(captured.g2[0].options.projectContext.length).toBeLessThan(longRules.length);
    expect(captured.g2[0].args[1].timeoutMs).toBeGreaterThan(0);
  });
});
