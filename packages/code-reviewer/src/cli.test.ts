import { join } from "node:path";

import { NoObjectGeneratedError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatRejectedOutputLine,
  REJECTED_OUTPUT_CAP_CHARS,
  REJECTED_OUTPUT_TRUNCATION_MARKER,
  runReviewCli,
  type CliEnv,
  type CliIo,
} from "./cli.js";
import { openRouterStub, VALID_REVIEW_TEXT, type StubCompletion, type WireBody } from "./openrouter-stub.js";
import { FinderOutputError, parseFinderOutput } from "./output-repair.js";
import { runReviewPipeline, type PipelineInput } from "./pipeline.js";
import { CRITERIA } from "./scorecard.js";
import type { ImplGrades, PipelineResult, Scores } from "./schemas.js";

// Hermetic process-contract tests (impl-review-phase-1 F6): everything the
// composite action consumes — exit codes, artifacts, env wiring — pinned
// without spawning a subprocess.

// A pass-through spy on the finder's parser, so the end-to-end tests below can
// read exactly what was parsed. Everything else is the real module.
vi.mock("./output-repair.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./output-repair.js")>();
  return { ...actual, parseFinderOutput: vi.fn(actual.parseFinderOutput) };
});

// The finder-configuration line reads the same env the requests do, so the
// developer's shell must not leak into it.
beforeEach(() => {
  vi.stubEnv("OPENROUTER_REVIEW_MODEL", undefined);
  vi.stubEnv("OPENROUTER_MODEL", undefined);
  vi.stubEnv("OPENROUTER_FINDER_PROVIDERS", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.mocked(parseFinderOutput).mockClear();
});

/** The line every run that reaches the pipeline prints first-hand, before any request. */
const CONFIG_LINE = "finder configuration: model=z-ai/glm-5.3 reasoning=low providers=z-ai,fireworks,together";

const scores = (): Scores =>
  Object.fromEntries(
    CRITERIA.map(({ key }) => [key, { score: 8, justification: "j", findingIds: [] as string[] }]),
  ) as unknown as Scores;

const pipelineResult = (overrides: Partial<PipelineResult> = {}): PipelineResult => ({
  summary: "overall assessment",
  findings: [],
  preDedupFindingCount: 0,
  scores: scores(),
  verdict: "passed",
  verdictReason: "looks solid",
  diffStats: { files: 1, additions: 2, deletions: 1 },
  diffTruncated: false,
  offDiffFindingPaths: [],
  bodyTruncated: false,
  droppedFindingIdRefs: 0,
  models: { finder: "cheap/finder", judge: "big/judge" },
  ...overrides,
});

interface FakeIo extends CliIo {
  files: Map<string, string>;
  appended: Map<string, string>;
  logs: string[];
  errors: string[];
}

const fakeIo = (overrides: Partial<CliIo> = {}): FakeIo => {
  const files = new Map<string, string>();
  const appended = new Map<string, string>();
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    files,
    appended,
    logs,
    errors,
    readStdin: () => "stdin diff",
    readFile: (path) => `content of ${path}`,
    writeFile: (path, content) => files.set(path, content),
    mkdir: () => undefined,
    appendFile: (path, content) => appended.set(path, (appended.get(path) ?? "") + content),
    log: (message) => {
      logs.push(message);
    },
    logError: (message) => {
      errors.push(message);
    },
    realpath: (path) => path,
    isRegularFile: () => true,
    ...overrides,
  };
};

const okPipeline = (result = pipelineResult()) => vi.fn().mockResolvedValue(result);

describe("runReviewCli exit codes", () => {
  it("returns 0 on success and writes review.json + comment.md to the default out dir", async () => {
    const io = fakeIo();
    const code = await runReviewCli([], {}, io, okPipeline());
    expect(code).toBe(0);
    const reviewJson = io.files.get(join(".review-out", "review.json"));
    expect(reviewJson).toBeDefined();
    expect(JSON.parse(reviewJson ?? "")).toMatchObject({ verdict: "passed" });
    expect(io.files.get(join(".review-out", "comment.md"))).toContain("✅ PASSED");
    expect(io.logs.at(0)).toContain("verdict=passed");
  });

  it("returns 0 for a produced 'failed' verdict — the verdict is advisory data", async () => {
    const io = fakeIo();
    const code = await runReviewCli([], {}, io, okPipeline(pipelineResult({ verdict: "failed" })));
    expect(code).toBe(0);
    expect(io.logs.at(0)).toContain("verdict=failed");
  });

  it("returns 1 when the pipeline fails and appends to $GITHUB_STEP_SUMMARY when set", async () => {
    const io = fakeIo();
    const failing = vi.fn().mockRejectedValue(new Error("provider exploded"));
    const code = await runReviewCli([], { GITHUB_STEP_SUMMARY: "summary.md" }, io, failing);
    expect(code).toBe(1);
    expect(io.errors).toEqual([CONFIG_LINE, "provider exploded"]);
    expect(io.appended.get("summary.md")).toContain("## AI review failed");
    expect(io.appended.get("summary.md")).toContain("provider exploded");
  });

  it("returns 1 with a usage message for a malformed argument", async () => {
    const io = fakeIo();
    const pipeline = okPipeline();
    expect(await runReviewCli(["--bogus"], {}, io, pipeline)).toBe(1);
    expect(io.errors.at(0)).toContain("Usage:");
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("returns 1 for a valueless --plan-file and advertises the flag in the usage line", async () => {
    const io = fakeIo();
    const pipeline = okPipeline();
    expect(await runReviewCli(["--plan-file"], {}, io, pipeline)).toBe(1);
    expect(io.errors.at(0)).toContain("--plan-file <path>");
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("returns 1 for an empty diff without invoking the pipeline", async () => {
    const io = fakeIo({ readStdin: () => "  \n" });
    const pipeline = okPipeline();
    expect(await runReviewCli([], {}, io, pipeline)).toBe(1);
    expect(io.errors.at(0)).toContain("Empty diff");
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("returns 1 when writing an artifact fails", async () => {
    const io = fakeIo({
      writeFile: () => {
        throw new Error("disk full");
      },
    });
    expect(await runReviewCli([], {}, io, okPipeline())).toBe(1);
    expect(io.errors).toEqual([CONFIG_LINE, "disk full"]);
  });

  it("returns 1 for an invalid timeout env value before invoking the pipeline", async () => {
    const io = fakeIo();
    const pipeline = okPipeline();
    const code = await runReviewCli([], { REVIEW_FINDER_TIMEOUT_MS: "abc" }, io, pipeline);
    expect(code).toBe(1);
    expect(io.errors.at(0)).toContain("REVIEW_FINDER_TIMEOUT_MS");
    expect(pipeline).not.toHaveBeenCalled();
  });
});

describe("runReviewCli input routing and pipeline wiring", () => {
  const inputOf = (pipeline: ReturnType<typeof vi.fn>): PipelineInput => pipeline.mock.calls[0]?.[0] as PipelineInput;

  it("reads the diff from --diff-file when given, stdin otherwise", async () => {
    const fromFile = fakeIo();
    const filePipeline = okPipeline();
    await runReviewCli(["--diff-file", "pr.diff"], {}, fromFile, filePipeline);
    expect(inputOf(filePipeline).diff).toBe("content of pr.diff");

    const fromStdin = fakeIo();
    const stdinPipeline = okPipeline();
    await runReviewCli([], {}, fromStdin, stdinPipeline);
    expect(inputOf(stdinPipeline).diff).toBe("stdin diff");
  });

  it("writes artifacts into a custom --out-dir", async () => {
    const io = fakeIo();
    await runReviewCli(["--out-dir", "artifacts"], {}, io, okPipeline());
    expect(io.files.has(join("artifacts", "review.json"))).toBe(true);
    expect(io.files.has(join("artifacts", "comment.md"))).toBe(true);
  });

  it("forwards PR metadata and valid timeout env overrides into the pipeline input", async () => {
    const pipeline = okPipeline();
    const env: CliEnv = {
      PR_TITLE: "feat: x",
      PR_BODY: "body",
      REVIEW_FINDER_TIMEOUT_MS: "10000",
      REVIEW_JUDGE_TIMEOUT_MS: "5000",
      REVIEW_IMPL_REVIEW_TIMEOUT_MS: "7000",
    };
    await runReviewCli([], env, fakeIo(), pipeline);
    expect(inputOf(pipeline)).toMatchObject({
      prTitle: "feat: x",
      prBody: "body",
      timeouts: { finderTimeoutMs: 10_000, judgeTimeoutMs: 5_000, implReviewTimeoutMs: 7_000 },
    });
  });

  // All three passes must be tunable without a release — the impl-review budget
  // was miscalibrated on its first live run (PR #127, run 31703938953) and
  // having no override meant the only remedy was a code change.
  it("rejects an invalid impl-review timeout like the other two budgets", async () => {
    const io = fakeIo();
    const pipeline = okPipeline();
    const code = await runReviewCli([], { REVIEW_IMPL_REVIEW_TIMEOUT_MS: "-1" }, io, pipeline);
    expect(code).toBe(1);
    expect(io.errors.at(0)).toContain("REVIEW_IMPL_REVIEW_TIMEOUT_MS");
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("forwards --project-context-file content as projectReviewContext", async () => {
    const pipeline = okPipeline();
    await runReviewCli(["--project-context-file", "rules.md"], {}, fakeIo(), pipeline);
    expect(inputOf(pipeline).projectReviewContext).toBe("content of rules.md");
  });

  it("forwards --plan-file content plus PLAN_PATH as the untrusted plan input", async () => {
    const pipeline = okPipeline();
    const io = fakeIo();
    await runReviewCli(["--plan-file", "plan.md"], { PLAN_PATH: "context/changes/x/plan.md" }, io, pipeline);
    expect(inputOf(pipeline).plan).toEqual({
      text: "content of plan.md",
      path: "context/changes/x/plan.md",
    });
    expect(io.errors).toEqual(["plan supplied: context/changes/x/plan.md (18 chars)", CONFIG_LINE]);
  });

  it("omits the plan path when PLAN_PATH is unset — content alone is still a usable plan", async () => {
    const pipeline = okPipeline();
    await runReviewCli(["--plan-file", "plan.md"], {}, fakeIo(), pipeline);
    expect(inputOf(pipeline).plan).toEqual({ text: "content of plan.md" });
  });

  // An empty staged plan is the workflow's "no plan" signal, mirroring how an
  // absent base-branch rules file is staged as an empty project-context file.
  // It must never reach the pipeline as a zero-length plan.
  it("treats an empty --plan-file as no plan and says so on stderr", async () => {
    const pipeline = okPipeline();
    const io = fakeIo({ readFile: () => "   \n" });
    expect(await runReviewCli(["--plan-file", "plan.md"], {}, io, pipeline)).toBe(0);
    expect(inputOf(pipeline).plan).toBeUndefined();
    expect(io.errors).toEqual(["plan file is empty — treated as no plan", CONFIG_LINE]);
  });

  // PLAN_PATH is attacker-reachable (the PR body can name the plan), so a
  // control character must not be able to forge or restyle a telemetry line.
  it("defuses control characters in PLAN_PATH before logging it", async () => {
    const pipeline = okPipeline();
    const io = fakeIo();
    await runReviewCli(["--plan-file", "plan.md"], { PLAN_PATH: "a\nplan supplied: forged" }, io, pipeline);
    expect(io.errors.at(0)).toBe("plan supplied: a?plan supplied: forged (18 chars)");
  });

  // The whole feature must be inert until a plan is passed: no flag, no plan
  // key, no extra stderr (the finder-configuration line is every run's), and a
  // review.json byte-identical to the pre-feature shape (no planTruncated).
  it("stays byte-identical to the legacy invocation when --plan-file is absent", async () => {
    const pipeline = okPipeline();
    const io = fakeIo();
    await runReviewCli([], {}, io, pipeline);
    expect(inputOf(pipeline).plan).toBeUndefined();
    expect(io.errors).toEqual([CONFIG_LINE]);
    expect(io.files.get(join(".review-out", "review.json"))).not.toContain("planTruncated");
  });

  it("wires onRetry to a stderr line naming the pass, error, and delay", async () => {
    const io = fakeIo();
    const pipeline = vi.fn().mockImplementation((input: PipelineInput) => {
      input.onRetry?.("finder", new DOMException("timed out", "TimeoutError"), 2_000.4);
      input.onRetry?.("judge", "boom", 10_500);
      return Promise.resolve(pipelineResult());
    });
    expect(await runReviewCli([], {}, io, pipeline)).toBe(0);
    // Rounded ms; a non-Error throw falls back to its string form.
    expect(io.errors).toEqual([
      CONFIG_LINE,
      "retrying finder after TimeoutError in 2000ms",
      "retrying judge after boom in 10500ms",
    ]);
  });

  it("links the Actions run in comment.md when the env triple is present", async () => {
    const io = fakeIo();
    const env: CliEnv = {
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "acme/repo",
      GITHUB_RUN_ID: "42",
    };
    await runReviewCli([], env, io, okPipeline());
    expect(io.files.get(join(".review-out", "comment.md"))).toContain("https://github.com/acme/repo/actions/runs/42");
  });
});

describe("runReviewCli --source-root (diff-scoped file context)", () => {
  const inputOf = (pipeline: ReturnType<typeof vi.fn>): PipelineInput => pipeline.mock.calls[0]?.[0] as PipelineInput;

  const DIFF = ["diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1 +1 @@", "+x"].join("\n");

  it("stays byte-identical to today without the flag: no source, no maxSteps, no step callback", async () => {
    const pipeline = okPipeline();
    await runReviewCli([], {}, fakeIo({ readStdin: () => DIFF }), pipeline);
    const input = inputOf(pipeline);
    expect("source" in input).toBe(false);
    expect("finderMaxSteps" in input).toBe(false);
    expect("onFinderStep" in input).toBe(false);
  });

  it("wires a diff-scoped source over io with the 5-step default budget", async () => {
    const io = fakeIo({
      readFile: (path) => (path === "pr.diff" ? DIFF : `content of ${path}`),
    });
    const pipeline = okPipeline();
    await runReviewCli(["--diff-file", "pr.diff", "--source-root", "root"], {}, io, pipeline);
    const input = inputOf(pipeline);
    expect(input.finderMaxSteps).toBe(5);
    expect(input.onFinderStep).toBeDefined();
    // The provider serves allowlisted reads through io.readFile...
    await expect(Promise.resolve(input.source?.({ path: "src/a.ts" }))).resolves.toBe(
      `content of ${join("root", "src/a.ts")}`,
    );
    // ...and refuses paths outside the diff.
    await expect(Promise.resolve(input.source?.({ path: "../secrets.env" }))).resolves.toContain(
      "not part of the reviewed diff",
    );
  });

  it("skips the source entirely when the diff yields no reviewable paths", async () => {
    const io = fakeIo({ readStdin: () => "--- a/x.ts\n+++ /dev/null\n-x" });
    const pipeline = okPipeline();
    await runReviewCli(["--source-root", "root"], {}, io, pipeline);
    const input = inputOf(pipeline);
    expect("source" in input).toBe(false);
    expect("finderMaxSteps" in input).toBe(false);
    expect("onFinderStep" in input).toBe(false);
  });

  it("honors a valid REVIEW_FINDER_MAX_STEPS override", async () => {
    const pipeline = okPipeline();
    await runReviewCli(
      ["--source-root", "root"],
      { REVIEW_FINDER_MAX_STEPS: "7" },
      fakeIo({ readStdin: () => DIFF }),
      pipeline,
    );
    expect(inputOf(pipeline).finderMaxSteps).toBe(7);
  });

  it.each(["abc", "0", "-3", "2.5"])(
    "returns 1 for REVIEW_FINDER_MAX_STEPS=%s before invoking the pipeline",
    async (bad) => {
      const io = fakeIo({ readStdin: () => DIFF });
      const pipeline = okPipeline();
      const code = await runReviewCli(["--source-root", "root"], { REVIEW_FINDER_MAX_STEPS: bad }, io, pipeline);
      expect(code).toBe(1);
      expect(io.errors.at(0)).toContain("REVIEW_FINDER_MAX_STEPS");
      expect(pipeline).not.toHaveBeenCalled();
    },
  );

  it("ignores an invalid REVIEW_FINDER_MAX_STEPS when the diff yields no reviewable paths", async () => {
    const pipeline = okPipeline();
    const code = await runReviewCli(
      ["--source-root", "root"],
      { REVIEW_FINDER_MAX_STEPS: "abc" },
      fakeIo({ readStdin: () => "--- a/x.ts\n+++ /dev/null\n-x" }),
      pipeline,
    );
    expect(code).toBe(0);
    expect("finderMaxSteps" in inputOf(pipeline)).toBe(false);
  });

  it("ignores an invalid REVIEW_FINDER_MAX_STEPS without the flag (legacy runs unchanged)", async () => {
    const code = await runReviewCli(
      [],
      { REVIEW_FINDER_MAX_STEPS: "abc" },
      fakeIo({ readStdin: () => DIFF }),
      okPipeline(),
    );
    expect(code).toBe(0);
  });

  // Reported request fields as the reviewer hands them on (A3): a value only
  // when the raw response carried one.
  const reported = <T>(value: T) => ({ value, source: "reported" as const });
  const missing = { value: null, source: "missing" as const };
  const served = { kind: "step" as const, model: reported("z-ai/glm-5.3"), reasoningTokens: reported(212) };

  it("writes one monotonic stderr line per finder step with targets, tokens, model and reasoning volume", async () => {
    const io = fakeIo({ readStdin: () => DIFF });
    const pipeline = vi.fn().mockImplementation((input: PipelineInput) => {
      input.onFinderStep?.({
        fileContextCalls: [{ path: "src/a.ts", startLine: 10, endLine: 80 }],
        toolCalls: 1,
        usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
        provider: "Fireworks",
        finishReason: "tool-calls",
        ...served,
      });
      input.onFinderStep?.({
        fileContextCalls: [],
        toolCalls: 0,
        usage: {},
        finishReason: "stop",
        kind: "finalization",
        model: missing,
        reasoningTokens: missing,
      });
      input.onFinderStep?.({
        fileContextCalls: [
          { path: "src/a.ts", startLine: 5 },
          { path: "src/a.ts", endLine: 8 },
        ],
        toolCalls: 2,
        usage: { totalTokens: 50 },
        provider: "Z.AI",
        finishReason: "length",
        kind: "step",
        model: reported("z-ai/glm-5.3-20261001"),
        reasoningTokens: reported(0),
      });
      return Promise.resolve(pipelineResult());
    });
    expect(await runReviewCli(["--source-root", "root"], {}, io, pipeline)).toBe(0);
    expect(io.errors).toEqual([
      CONFIG_LINE,
      "finder step 1: getFileContext src/a.ts:10-80 (tokens in=100 out=10 total=110) provider=Fireworks finish=tool-calls model=z-ai/glm-5.3 reasoning=212",
      // Nothing reported → "?" / "missing", never a guessed slug, the requested id or a 0.
      "finder step 2: no getFileContext call (tokens in=? out=? total=?) provider=? finish=stop model=missing reasoning=missing",
      // A REPORTED zero stays a zero.
      "finder step 3: getFileContext src/a.ts:5-end, getFileContext src/a.ts:1-8 (tokens in=? out=? total=50) provider=Z.AI finish=length model=z-ai/glm-5.3-20261001 reasoning=0",
    ]);
  });

  it("strips control characters from the model-chosen path and the reported fields in the step line (impl-review F4)", async () => {
    // An injection-steered model could otherwise embed a newline or an ANSI
    // escape to forge or restyle telemetry lines in the Actions log.
    const io = fakeIo({ readStdin: () => DIFF });
    const pipeline = vi.fn().mockImplementation((input: PipelineInput) => {
      input.onFinderStep?.({
        fileContextCalls: [{ path: "src/a.ts\n\u001b[31mfinder step 99: forged\u007f" }],
        toolCalls: 1,
        usage: { totalTokens: 10 },
        provider: "evil\nfinder step 98: forged",
        finishReason: "stop",
        ...served,
        model: reported("z-ai/glm-5.3\nfinder step 97: forged"),
      });
      return Promise.resolve(pipelineResult());
    });
    expect(await runReviewCli(["--source-root", "root"], {}, io, pipeline)).toBe(0);
    expect(io.errors).toEqual([
      CONFIG_LINE,
      "finder step 1: getFileContext src/a.ts??[31mfinder step 99: forged? (tokens in=? out=? total=10) provider=evil?finder step 98: forged finish=stop model=z-ai/glm-5.3?finder step 97: forged reasoning=212",
    ]);
  });

  // Printed once, before any request, from the same resolvers the request
  // uses — so an override that reaches the finder shows up here too.
  it("prints the finder configuration once per run, following the env the requests read", async () => {
    vi.stubEnv("OPENROUTER_REVIEW_MODEL", "acme/other\nforged");
    vi.stubEnv("OPENROUTER_FINDER_PROVIDERS", "together");
    const io = fakeIo();
    expect(await runReviewCli([], {}, io, okPipeline())).toBe(0);
    expect(io.errors).toEqual(["finder configuration: model=acme/other?forged reasoning=low providers=together"]);
  });

  it("mentions --source-root in the usage message", async () => {
    const io = fakeIo();
    expect(await runReviewCli(["--bogus"], {}, io, okPipeline())).toBe(1);
    expect(io.errors.at(0)).toContain("--source-root");
  });
});

describe("runReviewCli implementation-review telemetry line", () => {
  const implGrades = (): ImplGrades => ({
    plan_adherence: "PASS",
    scope_discipline: "PASS",
    safety_quality: "PASS",
    architecture: "PASS",
    pattern_consistency: "PASS",
    test_coverage: "PASS",
    success_criteria: "PASS",
  });

  const reviewedResult = (implReview: Partial<PipelineResult> = {}) =>
    pipelineResult({
      implReview: {
        status: "reviewed",
        planPath: "context/changes/x/plan.md",
        grades: implGrades(),
        verdict: "NEEDS_ATTENTION",
        verdictReason: "one gap",
        findings: [],
      },
      ...implReview,
    });

  // In an Actions log this line is the only live evidence the pass ran and
  // what it cost (criterion 3.9).
  it("emits one stderr line with the outcome, tokens, and cost", async () => {
    const io = fakeIo();
    await runReviewCli(
      [],
      {},
      io,
      okPipeline(
        reviewedResult({
          implReviewTelemetry: {
            attempts: 1,
            inputTokens: 51_407,
            outputTokens: 13_327,
            totalTokens: 64_734,
            cost: 0.236084,
          },
        }),
      ),
    );
    const line = io.errors.find((error) => error.startsWith("impl review:"));
    expect(line).toBe(
      "impl review: NEEDS_ATTENTION with 0 finding(s) (attempts=1 tokens in=51407 out=13327 total=64734 cost=$0.236084)",
    );
  });

  // A fabricated "$0.000000" would read as free — the absent case must stay
  // visibly different from a genuine zero.
  it("prints no cost field when the provider reported none", async () => {
    const io = fakeIo();
    await runReviewCli(
      [],
      {},
      io,
      okPipeline(reviewedResult({ implReviewTelemetry: { attempts: 1, inputTokens: 10 } })),
    );
    const line = io.errors.find((error) => error.startsWith("impl review:"));
    expect(line).toContain("attempts=1");
    expect(line).not.toContain("cost=");
  });

  // A failed advisory pass must not become a technical failure: exit stays 0,
  // the artifacts are still written, and the code-review verdict is intact.
  it("names a failed pass, still exits 0, and still writes both artifacts", async () => {
    const io = fakeIo();
    const code = await runReviewCli(
      [],
      {},
      io,
      okPipeline(pipelineResult({ implReview: { status: "failed", error: "provider exploded" } })),
    );
    expect(code).toBe(0);
    expect(io.errors.find((error) => error.startsWith("impl review:"))).toBe(
      "impl review: FAILED (provider exploded) (no usage reported)",
    );
    expect(io.files.get(join(".review-out", "comment.md"))).toContain("could not complete");
    const written: unknown = JSON.parse(io.files.get(join(".review-out", "review.json")) ?? "{}");
    expect(written).toMatchObject({ verdict: "passed", implReview: { status: "failed" } });
  });

  // review.json is what the Phase 4 probe reads its cost and verdict out of.
  it("carries the reviewed block and its telemetry into review.json", async () => {
    const io = fakeIo();
    await runReviewCli(
      [],
      {},
      io,
      okPipeline(reviewedResult({ implReviewTelemetry: { attempts: 1, totalTokens: 100, cost: 0.5 } })),
    );
    const written: unknown = JSON.parse(io.files.get(join(".review-out", "review.json")) ?? "{}");
    expect(written).toMatchObject({
      implReview: { status: "reviewed", verdict: "NEEDS_ATTENTION", planPath: "context/changes/x/plan.md" },
      implReviewTelemetry: { attempts: 1, cost: 0.5 },
    });
  });

  // A run with no plan stays byte-identical on stderr to the legacy shape.
  it("emits nothing when the pass did not run", async () => {
    const io = fakeIo();
    await runReviewCli([], {}, io, okPipeline(pipelineResult()));
    expect(io.errors.some((error) => error.startsWith("impl review:"))).toBe(false);
  });
});

describe("runReviewCli cost summary line (criterion 4.8)", () => {
  const withCosts = (over: Partial<PipelineResult>) =>
    pipelineResult({
      finderTelemetry: { steps: 1, toolCalls: 0, inputTokens: 100, cost: 0.01, requests: [] },
      judgeTelemetry: { attempts: 1, inputTokens: 50, cost: 0.03 },
      ...over,
    });

  const costLine = (io: { errors: string[] }) => io.errors.find((e) => e.startsWith("review cost:"));

  // The ratio is the decision-relevant number: an absolute nobody can calibrate
  // is how a 57.6x finder premium nearly got adopted once.
  it("states the impl-review spend as a ratio of the code review", async () => {
    const io = fakeIo();
    await runReviewCli([], {}, io, okPipeline(withCosts({ implReviewTelemetry: { attempts: 1, cost: 0.08 } })));
    expect(costLine(io)).toBe("review cost: finder=$0.010000 judge=$0.030000 impl=$0.080000 impl/(finder+judge)=2.00x");
  });

  it("marks the impl pass as not run rather than implying it was free", async () => {
    const io = fakeIo();
    await runReviewCli([], {}, io, okPipeline(withCosts({})));
    expect(costLine(io)).toContain("impl=(not run)");
    expect(costLine(io)).not.toContain("x");
  });

  // An unreported baseline must not become a confident Infinity.
  it("omits the ratio when a baseline cost is missing", async () => {
    const io = fakeIo();
    const result = pipelineResult({
      finderTelemetry: { steps: 1, toolCalls: 0, requests: [] },
      implReviewTelemetry: { attempts: 1, cost: 0.08 },
    });
    await runReviewCli([], {}, io, okPipeline(result));
    expect(costLine(io)).toContain("finder=?");
    expect(costLine(io)).not.toContain("x=");
    expect(costLine(io)).not.toContain("Infinity");
  });

  it("emits nothing when no pass reported a cost", async () => {
    const io = fakeIo();
    await runReviewCli([], {}, io, okPipeline(pipelineResult()));
    expect(costLine(io)).toBeUndefined();
  });
});

// The SDK's own error class, built the way generateText/ToolLoopAgent build it
// when a structured output fails to parse — the shape every post-2026-09-20
// finder failure took.
const noObject = (text: string | undefined, finishReason: "stop" | "length" = "stop"): NoObjectGeneratedError =>
  new NoObjectGeneratedError({
    message: "No object generated: could not parse the response.",
    text,
    response: { id: "r", timestamp: new Date(0), modelId: "z-ai/glm-4.6" },
    usage: {
      inputTokens: undefined,
      inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
      outputTokens: undefined,
      outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
      totalTokens: undefined,
    },
    finishReason,
  });

describe("formatRejectedOutputLine", () => {
  it("names the error class, the finish reason and the length, and shows the text", () => {
    expect(formatRejectedOutputLine(noObject('Here is my review: {"summary": "x"}'))).toBe(
      'rejected output (AI_NoObjectGeneratedError, provider=?, finish=stop, 35 chars): Here is my review: {"summary": "x"}',
    );
  });

  it("reads provider and finishReason off any error that carries them (the Phase 2 finder error)", () => {
    const error = Object.assign(new Error("format"), {
      name: "FinderOutputError",
      text: "prose",
      provider: "Novita",
      finishReason: "length",
    });
    expect(formatRejectedOutputLine(error)).toBe(
      "rejected output (FinderOutputError, provider=Novita, finish=length, 5 chars): prose",
    );
  });

  it("caps the text at REJECTED_OUTPUT_CAP_CHARS with a visible marker, reporting the full length", () => {
    const line = formatRejectedOutputLine(noObject("a".repeat(REJECTED_OUTPUT_CAP_CHARS + 500))) ?? "";
    expect(line).toContain(`${String(REJECTED_OUTPUT_CAP_CHARS + 500)} chars): `);
    expect(line.endsWith(`${"a".repeat(REJECTED_OUTPUT_CAP_CHARS)}${REJECTED_OUTPUT_TRUNCATION_MARKER}`)).toBe(true);
    expect(line).not.toContain("a".repeat(REJECTED_OUTPUT_CAP_CHARS + 1));
  });

  it("leaves a text of exactly the cap uncut and unmarked", () => {
    const line = formatRejectedOutputLine(noObject("b".repeat(REJECTED_OUTPUT_CAP_CHARS))) ?? "";
    expect(line).not.toContain(REJECTED_OUTPUT_TRUNCATION_MARKER);
    expect(line.endsWith("b".repeat(REJECTED_OUTPUT_CAP_CHARS))).toBe(true);
  });

  it("never ends the cut on half a surrogate pair", () => {
    const text = `${"c".repeat(REJECTED_OUTPUT_CAP_CHARS - 1)}😀tail`;
    const line = formatRejectedOutputLine(noObject(text)) ?? "";
    expect(line.endsWith(`${"c".repeat(REJECTED_OUTPUT_CAP_CHARS - 1)}${REJECTED_OUTPUT_TRUNCATION_MARKER}`)).toBe(
      true,
    );
  });

  it("escapes newlines and ANSI/control characters so the untrusted text cannot forge log lines", () => {
    const line =
      formatRejectedOutputLine(noObject('{\n  "a": 1\r\n}\t\u001b[31mfinder step 9: forged\u007f\u0085')) ?? "";
    expect(line).not.toMatch(/\p{Cc}/u);
    expect(line).toContain('{\\n  "a": 1\\r\\n}\\t\\u001b[31mfinder step 9: forged\\u007f\\u0085');
  });

  it("escapes control characters in the provider and finish fields too", () => {
    const error = Object.assign(new Error("x"), { text: "t", provider: "a\nb", finishReason: "s\u001b" });
    expect(formatRejectedOutputLine(error)).toBe(
      "rejected output (Error, provider=a\\nb, finish=s\\u001b, 1 chars): t",
    );
  });

  it("still reports an empty text — 'the model sent nothing' is a finding", () => {
    expect(formatRejectedOutputLine(noObject("", "length"))).toBe(
      "rejected output (AI_NoObjectGeneratedError, provider=?, finish=length, 0 chars): ",
    );
  });

  // T1 (follow-ups/review-fixes.md): the SDK's error carries no provider, so
  // the upstream of the last observed request fills in — and only then.
  it("fills the provider from the last observed request when the error carries none", () => {
    expect(formatRejectedOutputLine(noObject("x"), "Venice")).toBe(
      "rejected output (AI_NoObjectGeneratedError, provider=Venice, finish=stop, 1 chars): x",
    );
  });

  it("prefers the error's own provider over the fallback", () => {
    const error = Object.assign(new Error("f"), { name: "FinderOutputError", text: "p", provider: "Novita" });
    expect(formatRejectedOutputLine(error, "Venice")).toContain("provider=Novita,");
  });

  it("escapes control characters in the fallback provider too", () => {
    expect(formatRejectedOutputLine(noObject("x"), "a\u001bb")).toContain("provider=a\\u001bb,");
  });

  it.each([
    ["an error without text (abort, auth)", new Error("401 Unauthorized")],
    ["a NoObjectGeneratedError whose text is undefined", noObject(undefined)],
    ["a DOMException timeout", new DOMException("timed out", "TimeoutError")],
    ["a non-object throw", "boom"],
    ["null", null],
    ["a non-string text field", Object.assign(new Error("x"), { text: 42 })],
  ])("returns undefined for %s", (_label, error) => {
    expect(formatRejectedOutputLine(error)).toBeUndefined();
  });
});

describe("runReviewCli rejected-output line", () => {
  it("prints the rejected text on stderr after the message, and keeps it out of the step summary", async () => {
    const io = fakeIo();
    const failing = vi.fn().mockRejectedValue(noObject('I found no issues.\n{"findings": []}'));
    const code = await runReviewCli([], { GITHUB_STEP_SUMMARY: "summary.md" }, io, failing);
    expect(code).toBe(1);
    expect(io.errors).toEqual([
      CONFIG_LINE,
      "No object generated: could not parse the response.",
      'rejected output (AI_NoObjectGeneratedError, provider=?, finish=stop, 35 chars): I found no issues.\\n{"findings": []}',
    ]);
    expect(io.appended.get("summary.md")).not.toContain("I found no issues");
    expect(io.files.size).toBe(0);
  });

  it("attributes a judge parse failure to the judge step's provider, reported via onJudgeStep", async () => {
    const io = fakeIo();
    const failing = vi.fn((input: PipelineInput) => {
      input.onJudgeStep?.({ provider: "Venice", finishReason: "stop" });
      return Promise.reject(noObject("{bad"));
    });
    expect(await runReviewCli([], {}, io, failing as never)).toBe(1);
    expect(io.errors.at(-1)).toBe(
      "rejected output (AI_NoObjectGeneratedError, provider=Venice, finish=stop, 4 chars): {bad",
    );
  });

  it("keeps provider=? when the last observed request reported none, never an older request's slug", async () => {
    const io = fakeIo();
    const failing = vi.fn((input: PipelineInput) => {
      input.onJudgeStep?.({ provider: "Venice", finishReason: "stop" });
      input.onJudgeStep?.({ finishReason: "stop" }); // malformed or absent metadata
      return Promise.reject(noObject("{bad"));
    });
    await runReviewCli([], {}, io, failing);
    expect(io.errors.at(-1)).toContain("provider=?,");
  });

  it("adds no line for a failure that carried no model output", async () => {
    const io = fakeIo();
    expect(await runReviewCli([], {}, io, vi.fn().mockRejectedValue(new Error("provider exploded")))).toBe(1);
    expect(io.errors).toEqual([CONFIG_LINE, "provider exploded"]);
  });
});

// --- Through the real CLI, pipeline, reviewer and judge, on a stubbed wire ---
//
// The global fetch is stubbed, so every pass makes real SDK requests: the
// finder through its response observer, the judge through the provider's
// default fetch. A body carrying `response_format` is the judge's.

const E2E_DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1 +1 @@",
  "+export const a = 1;",
].join("\n");

const wireJudgeAnswer = (): StubCompletion => ({
  content: JSON.stringify({
    scores: Object.fromEntries(CRITERIA.map(({ key }) => [key, { score: "8", justification: "j", findingIds: [] }])),
    verdict: "passed",
    verdictReason: "fine",
    summary: "judged",
  }),
  finish: "stop",
  provider: "Anthropic",
  cost: 0.01,
});

/** Finder answers in order; the judge answer for any body with `response_format`. */
const e2eWire = (finder: StubCompletion[], judge: StubCompletion = wireJudgeAnswer()) => {
  let next = 0;
  const stub = openRouterStub((body: WireBody) => {
    if ("response_format" in body) return judge;
    const answer = finder[Math.min(next, finder.length - 1)];
    next += 1;
    return answer;
  });
  vi.stubGlobal("fetch", stub.fetch);
  return stub;
};

const realPipeline = (input: PipelineInput) =>
  runReviewPipeline({ ...input, overrides: { apiKey: "test-key" }, deps: { retrySleep: () => Promise.resolve() } });

const e2eIo = () =>
  fakeIo({
    readFile: (path) => (path === "pr.diff" ? E2E_DIFF : "export const a = 1; // file context"),
  });

const isFinalization = (body: WireBody): boolean => !("response_format" in body) && !("tools" in body);

describe("decision 2 end to end: reasoning never leaves the wire", () => {
  // § 4 of the plan. Every response — loop steps, finalization, judge — carries
  // reasoning in both provider fields; none of it may reach the transcript,
  // the parser, the log, review.json or comment.md.
  it("REASONING-SENTINEL-7f3a never leaves the wire: absent from transcript, parser input, stderr, review.json, comment.md", async () => {
    const sentinel = "REASONING-SENTINEL-7f3a";
    const thinking = { reasoning: sentinel, reasoningDetailsText: sentinel, reasoningTokens: 41 } as const;
    const stub = e2eWire(
      [
        {
          toolCalls: [{ id: "c1", name: "getFileContext", arguments: { path: "src/a.ts" } }],
          finish: "tool_calls",
          provider: "Z.AI",
          cost: 0.001,
          ...thinking,
        },
        { content: "draft: nothing serious", finish: "stop", provider: "Fireworks", cost: 0.001, ...thinking },
        { content: VALID_REVIEW_TEXT, finish: "stop", provider: "Together", cost: 0.001, ...thinking },
      ],
      { ...wireJudgeAnswer(), ...thinking },
    );
    const io = e2eIo();
    const code = await runReviewCli(
      ["--diff-file", "pr.diff", "--source-root", "root"],
      { GITHUB_STEP_SUMMARY: "summary.md" },
      io,
      realPipeline,
    );
    expect(code).toBe(0);

    // The run really carried reasoning on the wire.
    expect(stub.bodies).toHaveLength(4);
    const finalization = stub.bodies.filter(isFinalization);
    expect(finalization).toHaveLength(1);
    // 1. The transcript — the finalization request is built from it.
    expect(JSON.stringify(finalization)).not.toContain(sentinel);
    expect(JSON.stringify(finalization)).toContain("draft: nothing serious");
    // 2. The parser input.
    const parsed = vi.mocked(parseFinderOutput).mock.calls.map(([text]) => text);
    expect(parsed).toEqual([VALID_REVIEW_TEXT]);
    // 3. stderr, and the step summary.
    expect(io.errors.join("\n")).not.toContain(sentinel);
    expect(io.appended.get("summary.md") ?? "").not.toContain(sentinel);
    // 4. review.json and 5. comment.md.
    const reviewJson = io.files.get(join(".review-out", "review.json")) ?? "";
    const commentMd = io.files.get(join(".review-out", "comment.md")) ?? "";
    expect(reviewJson).not.toBe("");
    expect(commentMd).not.toBe("");
    expect(reviewJson).not.toContain(sentinel);
    expect(commentMd).not.toContain(sentinel);

    // What review.json DOES carry: the volume of reasoning per request, its provider and model.
    const result = JSON.parse(reviewJson) as PipelineResult;
    expect(result.finderTelemetry?.requests.map((request) => [request.kind, request.provider.value])).toEqual([
      ["step", "Z.AI"],
      ["step", "Fireworks"],
      ["finalization", "Together"],
    ]);
    for (const request of result.finderTelemetry?.requests ?? []) {
      expect(request).toMatchObject({
        attempt: 1,
        model: { value: "z-ai/glm-5.3", source: "reported" },
        reasoningTokens: { value: 41, source: "reported" },
        cost: 0.001,
      });
      expect(Object.keys(request).sort()).toEqual([
        "attempt",
        "cost",
        "finishReason",
        "kind",
        "model",
        "provider",
        "reasoningTokens",
      ]);
    }
    expect(io.errors).toContain(
      "finder step 1: getFileContext src/a.ts (tokens in=10 out=5 total=15) provider=Z.AI finish=tool-calls model=z-ai/glm-5.3 reasoning=41",
    );
  });

  // § 1: the judge's request carries no reasoning, while every finder request does.
  it("the judge's wire body carries no reasoning; every finder body carries effort low", async () => {
    const stub = e2eWire([{ content: VALID_REVIEW_TEXT, finish: "stop", provider: "Z.AI" }]);
    expect(await runReviewCli(["--diff-file", "pr.diff"], {}, e2eIo(), realPipeline)).toBe(0);
    const judge = stub.bodies.filter((body) => "response_format" in body);
    const finder = stub.bodies.filter((body) => !("response_format" in body));
    expect(judge).toHaveLength(1);
    expect(finder).toHaveLength(1);
    for (const body of judge) {
      expect("reasoning" in body).toBe(false);
      expect("include_reasoning" in body).toBe(false);
    }
    for (const body of finder) expect(body.reasoning).toStrictEqual({ enabled: true, effort: "low" });
  });
});

// Review F5 of `/rune-plan-review`: a response that is BOTH truncated and
// carries inline reasoning fails the attempt without a retry, at each request
// kind, and its text reaches neither stderr nor the step summary — whichever
// guard classifies it first.
describe("inline reasoning together with finish=length fails without retry and stays out of the log", () => {
  const MIXED = "<think>REASONING-SENTINEL</think>";
  const mixed: StubCompletion = { content: MIXED, finish: "length", provider: "Z.AI" };

  it.each([
    ["a stage-1 step (REASONING-SENTINEL)", [mixed], true, 1],
    ["the finalization (REASONING-SENTINEL)", [mixed], false, 1],
    ["the repair (REASONING-SENTINEL)", [{ content: '{"summary": 1}', finish: "stop" as const }, mixed], false, 2],
  ] as const)("%s", async (_label, finder, withSource, requests) => {
    const stub = e2eWire([...finder]);
    const io = e2eIo();
    const argv = ["--diff-file", "pr.diff", ...(withSource ? ["--source-root", "root"] : [])];
    expect(await runReviewCli(argv, { GITHUB_STEP_SUMMARY: "summary.md" }, io, realPipeline)).toBe(1);
    // Exactly one attempt's requests: no retry, no judge.
    expect(stub.bodies).toHaveLength(requests);
    const stderr = io.errors.join("\n");
    expect(stderr).not.toContain("REASONING-SENTINEL");
    expect(stderr).toContain("reason=inline-reasoning chars=33");
    expect(stderr).toContain("FinderOutputError");
    expect(io.appended.get("summary.md") ?? "").not.toContain("REASONING-SENTINEL");
    expect(io.files.size).toBe(0);
  });

  it("the rejected-output line redacts a REASONING-SENTINEL text even when the error was classified as truncation", () => {
    const error = new FinderOutputError({
      text: MIXED,
      finishReason: "length",
      reason: "length",
      request: { kind: "finalization" },
      validationError: "v",
      repaired: false,
    });
    expect(formatRejectedOutputLine(error)).toBe(
      "rejected output (FinderOutputError, provider=?, finish=length): reason=inline-reasoning chars=33",
    );
    // Any error class, not just the finder's.
    expect(formatRejectedOutputLine(noObject(`x <THINK>REASONING-SENTINEL`))).toBe(
      "rejected output (AI_NoObjectGeneratedError, provider=?, finish=stop): reason=inline-reasoning chars=27",
    );
  });
});
