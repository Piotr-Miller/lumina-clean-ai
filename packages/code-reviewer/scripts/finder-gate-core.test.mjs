// Hermetic tests for the gate runner's pure logic (change `finder-model-swap`,
// Phase 1): fake requests and fake review functions — no network, no API key.
// A broken check must surface here, not after a paid series.
import { APICallError } from "ai";
import { describe, expect, it, vi } from "vitest";

import { FinderOutputError } from "../src/output-repair.ts";
import { RATE_LIMIT_DELAY_MS } from "../src/retry.ts";
import {
  ENDPOINT_NAMES,
  assertSeriesWritable,
  classify,
  evaluateAttempt,
  parseGateArgs,
  readSeries,
  reasoningTokensOf,
  runAttempt,
} from "./finder-gate-core.mjs";

const request = (overrides = {}) => ({
  provider: "OpenAI",
  cost: 0.001,
  reasoningTokens: { sdk: 0, openrouter: 0 },
  reasoningTextChars: 0,
  ...overrides,
});
const evaluate = (requests, outcome = "valid") => evaluateAttempt({ requests, outcome, expectedName: "OpenAI" });

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
  it("maps the three candidate slugs to the names the endpoints API reports, and keeps the glm entries", () => {
    expect(ENDPOINT_NAMES).toMatchObject({
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
  ];
  const without = (name) => {
    const i = base.indexOf(name);
    return [...base.slice(0, i), ...base.slice(i + 2)];
  };

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
const IDENTITY = { model: "openai/gpt-6-luna", endpoint: "openai", case: "clean", n: 5 };
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
    model: IDENTITY.model,
    endpoint: IDENTITY.endpoint,
    caseName: IDENTITY.case,
    n: IDENTITY.n,
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

describe("evaluateAttempt", () => {
  it("passes a valid attempt whose requests all match, with an empty findings list", () => {
    expect(evaluate([request(), request()])).toMatchObject({
      invalidated: false,
      reasoningLeak: false,
      costComplete: true,
      g1Pass: true,
    });
  });

  it.each([
    ["a different provider", "Azure"],
    ["a missing provider", null],
  ])("invalidates the attempt on %s", (_label, provider) => {
    const result = evaluate([request(), request({ provider })]);
    expect(result.invalidated).toBe(true);
    expect(result.providerMismatch).toEqual([provider]);
    expect(result.g1Pass).toBe(false);
  });

  it.each([
    ["SDK reasoning tokens", { reasoningTokens: { sdk: 3, openrouter: 0 } }],
    ["OpenRouter reasoning tokens", { reasoningTokens: { sdk: null, openrouter: 3 } }],
    ["reasoning text", { reasoningTextChars: 12 }],
  ])("treats %s alone as an A3 leak", (_label, overrides) => {
    const result = evaluate([request(overrides)]);
    expect(result.reasoningLeak).toBe(true);
    expect(result.g1Pass).toBe(false);
  });

  it("marks the cost incomplete when one request reported none, never treating it as free", () => {
    const result = evaluate([request({ cost: 0.002 }), request({ cost: null })]);
    expect(result.costComplete).toBe(false);
    expect(result.cost).toBe(0.002);
  });

  it("marks an attempt with no requests at all as cost-incomplete", () => {
    expect(evaluate([], "APICallError-429").costComplete).toBe(false);
  });

  it.each(["FinderOutputError", "APICallError-429", "timeout"])(
    "fails (never skips) an attempt ending %s",
    (outcome) => {
      expect(evaluate([request()], outcome).g1Pass).toBe(false);
    },
  );
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

describe("runAttempt — retries as in production (gate.md §4)", () => {
  it("429 → one retry → success is a passing attempt with exactly one recorded retry", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValueOnce(http(429)).mockResolvedValueOnce({ findings: [] });
    const { result, error, retries } = await runAttempt(fn, { sleep, random: noJitter });
    expect(error).toBeUndefined();
    expect(result).toEqual({ findings: [] });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(retries).toEqual([{ class: "APICallError-429", delayMs: RATE_LIMIT_DELAY_MS }]);
    // The production delay is passed to the injected sleep — no real wait.
    expect(sleep).toHaveBeenCalledWith(RATE_LIMIT_DELAY_MS);
  });

  it("429 twice fails the attempt after two calls — the failure persisted past the one retry", async () => {
    const fn = vi.fn().mockRejectedValue(http(429));
    const { result, error, retries } = await runAttempt(fn, { sleep: async () => {}, random: noJitter });
    expect(result).toBeUndefined();
    expect(classify(error)).toBe("APICallError-429");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(retries).toHaveLength(1);
  });

  it("uses the header-aware delay: a usable Retry-After wins over the class default", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(http(429, { "retry-after": "3" }))
      .mockResolvedValueOnce({});
    const { retries } = await runAttempt(fn, { sleep, random: noJitter });
    expect(retries).toEqual([{ class: "APICallError-429", delayMs: 3000 }]);
  });

  it.each([
    ["a 5xx", http(503), "APICallError-503"],
    ["a timeout", new DOMException("timed out", "TimeoutError"), "timeout"],
  ])("retries %s once", async (_label, failure, expectedClass) => {
    const fn = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce({});
    const { error, retries } = await runAttempt(fn, { sleep: async () => {}, random: noJitter });
    expect(error).toBeUndefined();
    expect(retries.map((r) => r.class)).toEqual([expectedClass]);
  });

  it("never retries a FinderOutputError, as in production", async () => {
    const sleep = vi.fn();
    const fn = vi.fn().mockRejectedValue(finderOutputError());
    const { error, retries } = await runAttempt(fn, { sleep });
    expect(classify(error)).toBe("FinderOutputError");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(retries).toEqual([]);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("never retries a non-transient API error (e.g. 400 under require_parameters)", async () => {
    const fn = vi.fn().mockRejectedValue(http(400));
    const { retries } = await runAttempt(fn, { sleep: async () => {} });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(retries).toEqual([]);
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
