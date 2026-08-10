import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runReviewCli, type CliEnv, type CliIo } from "./cli.js";
import type { PipelineInput } from "./pipeline.js";
import { CRITERIA } from "./scorecard.js";
import type { PipelineResult, Scores } from "./schemas.js";

// Hermetic process-contract tests (impl-review-phase-1 F6): everything the
// composite action consumes — exit codes, artifacts, env wiring — pinned
// without spawning a subprocess.

const scores = (): Scores =>
  Object.fromEntries(
    CRITERIA.map(({ key }) => [key, { score: 8, justification: "j", findingIds: [] as string[] }]),
  ) as Scores;

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
    };
    await runReviewCli([], env, fakeIo(), pipeline);
    expect(inputOf(pipeline)).toMatchObject({
      prTitle: "feat: x",
      prBody: "body",
      timeouts: { finderTimeoutMs: 10_000, judgeTimeoutMs: 5_000 },
    });
  });

  it("forwards --project-context-file content as projectReviewContext", async () => {
    const pipeline = okPipeline();
    await runReviewCli(["--project-context-file", "rules.md"], {}, fakeIo(), pipeline);
    expect(inputOf(pipeline).projectReviewContext).toBe("content of rules.md");
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

  it("mentions --source-root in the usage message", async () => {
    const io = fakeIo();
    expect(await runReviewCli(["--bogus"], {}, io, okPipeline())).toBe(1);
    expect(io.errors.at(0)).toContain("--source-root");
  });
});
