/**
 * finder-effort.test.ts — the finder's reasoning effort and reasoning-token
 * evidence through the PRODUCTION path: runReviewCli → runReviewPipeline →
 * createReviewer/createJudge → the installed OpenRouter provider → fetch.
 * Only `fetch` is faked, so every assertion reads what would go on the wire
 * or what the real provider + AI SDK hand back (change `finder-sonnet-effort`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runReviewCli, type CliEnv, type CliIo } from "./cli.js";
import { MAX_OUTPUT_TOKENS } from "./config.js";
import type { ResolvedPipelineConfiguration } from "./pipeline.js";
import { CRITERIA } from "./scorecard.js";

const FINDER_PIN = { only: ["anthropic"], order: ["anthropic"], allow_fallbacks: false, require_parameters: true };

const DIFF = ["diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1 +1 @@", "+x"].join("\n");

type Body = Record<string, unknown>;
type Pass = "finder" | "judge";

const passOf = (body: Body): Pass => {
  const format = body.response_format as { json_schema?: { name?: string } } | undefined;
  const name = format?.json_schema?.name;
  if (name === "review_result") return "finder";
  if (name === "judge_scorecard") return "judge";
  throw new Error(`unexpected structured-output name ${String(name)}`);
};

const FINDER_OUTPUT = JSON.stringify({ summary: "fine", findings: [] });
const JUDGE_OUTPUT = JSON.stringify({
  scores: Object.fromEntries(CRITERIA.map(({ key }) => [key, { score: "8", justification: "j", findingIds: [] }])),
  verdict: "passed",
  verdictReason: "looks solid",
  summary: "overall fine",
});

interface Completion {
  content: string;
  finish?: string;
  /** `undefined` → the response carries no completion_tokens_details at all. */
  reasoningTokens?: number;
  completionTokens?: number;
}

const completion = ({ content, finish = "stop", reasoningTokens, completionTokens = 20 }: Completion) =>
  new Response(
    JSON.stringify({
      id: "gen-1",
      model: "anthropic/claude-sonnet-5",
      provider: "Anthropic",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finish }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: completionTokens,
        total_tokens: 100 + completionTokens,
        cost: 0.001,
        ...(reasoningTokens === undefined ? {} : { completion_tokens_details: { reasoning_tokens: reasoningTokens } }),
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

/** Records every request body per pass and answers from per-pass scripts. */
function installFetch(script: Partial<Record<Pass, (call: number) => Response>> = {}) {
  const bodies: Record<Pass, Body[]> = { finder: [], judge: [] };
  const fake = vi.fn((_input: unknown, init?: RequestInit) => {
    if (typeof init?.body !== "string") throw new Error("expected a JSON string request body");
    const body = JSON.parse(init.body) as Body;
    const pass = passOf(body);
    bodies[pass].push(body);
    const answer = script[pass];
    if (answer !== undefined) return Promise.resolve(answer(bodies[pass].length));
    return Promise.resolve(completion({ content: pass === "finder" ? FINDER_OUTPUT : JUDGE_OUTPUT }));
  });
  vi.stubGlobal("fetch", fake);
  return { bodies, fake };
}

const fakeIo = (): CliIo & { errors: string[]; files: Map<string, string> } => {
  const errors: string[] = [];
  const files = new Map<string, string>();
  return {
    errors,
    files,
    readStdin: () => DIFF,
    readFile: (path) => (path.endsWith("a.ts") ? "export const x = 1;\n" : `content of ${path}`),
    writeFile: (path, content) => files.set(path, content),
    mkdir: () => undefined,
    appendFile: () => undefined,
    log: () => undefined,
    logError: (message) => {
      errors.push(message);
    },
    realpath: (path) => path,
    isRegularFile: () => true,
  };
};

const ENV: CliEnv = {};

const lineJson = (errors: string[], prefix: string): unknown[] =>
  errors.filter((line) => line.startsWith(prefix)).map((line) => JSON.parse(line.slice(prefix.length)) as unknown);

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  for (const name of [
    "OPENROUTER_MODEL",
    "OPENROUTER_REVIEW_MODEL",
    "OPENROUTER_JUDGE_MODEL",
    "OPENROUTER_IMPL_REVIEW_MODEL",
    "OPENROUTER_REQUIRE_PARAMETERS",
  ]) {
    vi.stubEnv(name, undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("--finder-reasoning-effort through the production path", () => {
  const cases = [
    ["low", ["--finder-reasoning-effort", "low"], { effort: "low" }],
    ["medium", ["--finder-reasoning-effort", "medium"], { effort: "medium" }],
    ["omitted", [], undefined],
  ] as const;
  const modes = [
    ["tool-less", []],
    ["with a source", ["--source-root", "root"]],
  ] as const;

  for (const [label, flag, reasoning] of cases) {
    for (const [mode, sourceArgs] of modes) {
      it(`${label}, ${mode}: finder body ${reasoning === undefined ? "has no reasoning key" : `carries ${JSON.stringify(reasoning)}`}; judge never does`, async () => {
        const { bodies } = installFetch();
        const io = fakeIo();
        expect(await runReviewCli([...flag, ...sourceArgs], ENV, io)).toBe(0);

        expect(bodies.finder).toHaveLength(1);
        const finder = bodies.finder[0];
        if (reasoning === undefined) expect("reasoning" in finder).toBe(false);
        else expect(finder.reasoning).toEqual(reasoning);
        // The pin and the cap are untouched by the effort setting.
        expect(finder.provider).toEqual(FINDER_PIN);
        expect(finder.max_tokens).toBe(MAX_OUTPUT_TOKENS);

        expect(bodies.judge).toHaveLength(1);
        expect("reasoning" in bodies.judge[0]).toBe(false);

        // The request evidence is the projection of exactly that body.
        expect(lineJson(io.errors, "finder request: ")).toEqual([
          {
            model: finder.model,
            provider: FINDER_PIN,
            ...(reasoning === undefined ? {} : { reasoning }),
            max_tokens: MAX_OUTPUT_TOKENS,
          },
        ]);
      });
    }
  }

  it("rejects any other value with the allowed values, before any request", async () => {
    const { fake } = installFetch();
    const io = fakeIo();
    expect(await runReviewCli(["--finder-reasoning-effort", "max"], ENV, io)).toBe(1);
    expect(io.errors.at(0)).toContain("Invalid --finder-reasoning-effort: max. Allowed values: low, medium, high");
    expect(fake).not.toHaveBeenCalled();
  });

  it("is not read from the environment", async () => {
    const { bodies } = installFetch();
    expect(
      await runReviewCli([], { FINDER_REASONING_EFFORT: "low", REVIEW_FINDER_REASONING_EFFORT: "low" }, fakeIo()),
    ).toBe(0);
    expect("reasoning" in bodies.finder[0]).toBe(false);
  });
});

describe("resolved configuration snapshot", () => {
  it("matches what the finder actually sent, and the CLI's own resolved settings", async () => {
    const { bodies } = installFetch();
    const io = fakeIo();
    const env = { REVIEW_FINDER_MAX_STEPS: "4", REVIEW_FINDER_TIMEOUT_MS: "123000", REVIEW_JUDGE_TIMEOUT_MS: "45000" };
    expect(await runReviewCli(["--finder-reasoning-effort", "medium", "--source-root", "root"], env, io)).toBe(0);

    const snapshots = lineJson(io.errors, "resolved configuration: ") as ResolvedPipelineConfiguration[];
    expect(snapshots).toHaveLength(1);
    const snapshot = snapshots[0];
    const finder = bodies.finder[0];
    expect(snapshot.finder).toEqual({
      model: finder.model,
      routing: finder.provider,
      reasoningEffort: "medium",
      toolLoop: true,
      maxSteps: 4,
      maxOutputTokens: finder.max_tokens,
      timeoutMs: 123_000,
    });
    expect(snapshot.judge).toMatchObject({ model: bodies.judge[0].model, routing: bodies.judge[0].provider });
    expect(snapshot.judge.timeoutMs).toBe(45_000);
    expect(snapshot.implReview.gate).toBe("code-review-passed");
    expect(snapshot.retry.sdkMaxRetries).toBe(0);
    // Safe to log: nothing secret, nothing from the prompt.
    const line = io.errors.find((entry) => entry.startsWith("resolved configuration: ")) ?? "";
    expect(line).not.toContain("test-key");
    expect(line).not.toContain("+x");
  });

  it("records a tool-less finder as such, with no effort", async () => {
    installFetch();
    const io = fakeIo();
    expect(await runReviewCli([], ENV, io)).toBe(0);
    const [snapshot] = lineJson(io.errors, "resolved configuration: ") as ResolvedPipelineConfiguration[];
    expect(snapshot.finder).toMatchObject({ reasoningEffort: null, toolLoop: false, maxSteps: null });
  });
});

describe("reasoning tokens in the step log (real provider metadata)", () => {
  const stepLine = (io: { errors: string[] }) => io.errors.filter((line) => line.startsWith("finder step "));

  it.each([
    ["absent from the response", undefined, "reasoning=?"],
    ["reported as zero", 0, "reasoning=0"],
    ["reported as a positive count", 1234, "reasoning=1234"],
  ])("a count %s logs %s", async (_label, reasoningTokens, expected) => {
    installFetch({ finder: () => completion({ content: FINDER_OUTPUT, reasoningTokens, completionTokens: 1300 }) });
    const io = fakeIo();
    expect(await runReviewCli(["--finder-reasoning-effort", "low", "--source-root", "root"], ENV, io)).toBe(0);
    expect(stepLine(io)).toEqual([
      `finder step 1: no getFileContext call (tokens in=100 out=1300 ${expected} total=1400) provider=Anthropic finish=stop`,
    ]);
  });

  it("logs a final finish=length step with its count before the run fails", async () => {
    const { bodies } = installFetch({
      finder: () =>
        completion({ content: "", finish: "length", reasoningTokens: 16_000, completionTokens: MAX_OUTPUT_TOKENS }),
    });
    const io = fakeIo();
    expect(await runReviewCli(["--finder-reasoning-effort", "medium", "--source-root", "root"], ENV, io)).toBe(1);
    // Exactly one step: a cap hit is NoOutputGeneratedError, which withOneRetry
    // does not retry (lessons.md) — so there is no second attempt to log.
    const steps = stepLine(io);
    expect(steps).toHaveLength(1);
    expect(io.errors.some((line) => line.startsWith("retrying finder"))).toBe(false);
    expect(steps[0]).toBe(
      `finder step 1: no getFileContext call (tokens in=100 out=${String(MAX_OUTPUT_TOKENS)} reasoning=16000 total=${String(100 + MAX_OUTPUT_TOKENS)}) provider=Anthropic finish=length`,
    );
    // The step line precedes the error that ends the run, and the judge never ran.
    const firstStep = io.errors.indexOf(steps[0]);
    const failure = io.errors.indexOf("No output generated.");
    expect(failure).toBeGreaterThan(firstStep);
    expect(bodies.judge).toHaveLength(0);
  });

  it("logs the request of a call that fails before any step exists", async () => {
    const { bodies } = installFetch({
      finder: () => new Response(JSON.stringify({ error: { message: "bad request", code: 400 } }), { status: 400 }),
    });
    const io = fakeIo();
    expect(await runReviewCli(["--finder-reasoning-effort", "low", "--source-root", "root"], ENV, io)).toBe(1);
    expect(bodies.finder).toHaveLength(1);
    expect(io.errors.some((line) => line.startsWith("finder step "))).toBe(false);
    expect(lineJson(io.errors, "finder request: ")).toEqual([
      {
        model: bodies.finder[0].model,
        provider: FINDER_PIN,
        reasoning: { effort: "low" },
        max_tokens: MAX_OUTPUT_TOKENS,
      },
    ]);
  });
});
