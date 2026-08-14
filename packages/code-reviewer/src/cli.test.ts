import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runReviewCli, type CliEnv, type CliIo } from "./cli.js";
import type { PipelineInput } from "./pipeline.js";
import { CRITERIA } from "./scorecard.js";
import type { ImplGrades, PipelineResult, Scores } from "./schemas.js";

// Hermetic process-contract tests (impl-review-phase-1 F6): everything the
// composite action consumes — exit codes, artifacts, env wiring — pinned
// without spawning a subprocess.

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
    expect(io.errors).toEqual(["provider exploded"]);
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
    expect(io.errors.at(0)).toBe("disk full");
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
  const inputOf = (pipeline: ReturnType<typeof vi.fn>): PipelineInput =>
    pipeline.mock.calls[0]?.[0] as PipelineInput;

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
    expect(io.errors).toEqual(["plan supplied: context/changes/x/plan.md (18 chars)"]);
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
    expect(io.errors).toEqual(["plan file is empty — treated as no plan"]);
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
  // key, no extra stderr, and a review.json byte-identical to the pre-feature
  // shape (no planTruncated).
  it("stays byte-identical to the legacy invocation when --plan-file is absent", async () => {
    const pipeline = okPipeline();
    const io = fakeIo();
    await runReviewCli([], {}, io, pipeline);
    expect(inputOf(pipeline).plan).toBeUndefined();
    expect(io.errors).toEqual([]);
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
    expect(io.files.get(join(".review-out", "comment.md"))).toContain(
      "https://github.com/acme/repo/actions/runs/42",
    );
  });
});

describe("runReviewCli --source-root (diff-scoped file context)", () => {
  const inputOf = (pipeline: ReturnType<typeof vi.fn>): PipelineInput =>
    pipeline.mock.calls[0]?.[0] as PipelineInput;

  const DIFF = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1 +1 @@",
    "+x",
  ].join("\n");

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
    await expect(
      Promise.resolve(input.source?.({ path: "src/a.ts" })),
    ).resolves.toBe(`content of ${join("root", "src/a.ts")}`);
    // ...and refuses paths outside the diff.
    await expect(
      Promise.resolve(input.source?.({ path: "../secrets.env" })),
    ).resolves.toContain("not part of the reviewed diff");
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
      const code = await runReviewCli(
        ["--source-root", "root"],
        { REVIEW_FINDER_MAX_STEPS: bad },
        io,
        pipeline,
      );
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

  it("writes one monotonic stderr line per finder step with targets and tokens", async () => {
    const io = fakeIo({ readStdin: () => DIFF });
    const pipeline = vi.fn().mockImplementation((input: PipelineInput) => {
      input.onFinderStep?.({
        fileContextCalls: [{ path: "src/a.ts", startLine: 10, endLine: 80 }],
        toolCalls: 1,
        usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
      });
      input.onFinderStep?.({ fileContextCalls: [], toolCalls: 0, usage: {} });
      input.onFinderStep?.({
        fileContextCalls: [
          { path: "src/a.ts", startLine: 5 },
          { path: "src/a.ts", endLine: 8 },
        ],
        toolCalls: 2,
        usage: { totalTokens: 50 },
      });
      return Promise.resolve(pipelineResult());
    });
    expect(await runReviewCli(["--source-root", "root"], {}, io, pipeline)).toBe(0);
    expect(io.errors).toEqual([
      "finder step 1: getFileContext src/a.ts:10-80 (tokens in=100 out=10 total=110)",
      "finder step 2: no getFileContext call (tokens in=? out=? total=?)",
      "finder step 3: getFileContext src/a.ts:5-end, getFileContext src/a.ts:1-8 (tokens in=? out=? total=50)",
    ]);
  });

  it("strips control characters from the model-chosen path in the step line (impl-review F4)", async () => {
    // An injection-steered model could otherwise embed a newline or an ANSI
    // escape to forge or restyle telemetry lines in the Actions log.
    const io = fakeIo({ readStdin: () => DIFF });
    const pipeline = vi.fn().mockImplementation((input: PipelineInput) => {
      input.onFinderStep?.({
        fileContextCalls: [{ path: "src/a.ts\n\u001b[31mfinder step 99: forged\u007f" }],
        toolCalls: 1,
        usage: { totalTokens: 10 },
      });
      return Promise.resolve(pipelineResult());
    });
    expect(await runReviewCli(["--source-root", "root"], {}, io, pipeline)).toBe(0);
    expect(io.errors).toEqual([
      "finder step 1: getFileContext src/a.ts??[31mfinder step 99: forged? (tokens in=? out=? total=10)",
    ]);
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
          implReviewTelemetry: { attempts: 1, inputTokens: 51_407, outputTokens: 13_327, totalTokens: 64_734, cost: 0.236084 },
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
      finderTelemetry: { steps: 1, toolCalls: 0, inputTokens: 100, cost: 0.01 },
      judgeTelemetry: { attempts: 1, inputTokens: 50, cost: 0.03 },
      ...over,
    });

  const costLine = (io: { errors: string[] }) => io.errors.find((e) => e.startsWith("review cost:"));

  // The ratio is the decision-relevant number: an absolute nobody can calibrate
  // is how a 57.6x finder premium nearly got adopted once.
  it("states the impl-review spend as a ratio of the code review", async () => {
    const io = fakeIo();
    await runReviewCli([], {}, io, okPipeline(withCosts({ implReviewTelemetry: { attempts: 1, cost: 0.08 } })));
    expect(costLine(io)).toBe(
      "review cost: finder=$0.010000 judge=$0.030000 impl=$0.080000 impl/(finder+judge)=2.00x",
    );
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
      finderTelemetry: { steps: 1, toolCalls: 0 },
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
