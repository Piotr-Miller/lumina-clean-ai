// Hermetic tests for the finder-glm-5-3 runner's I/O (plan.md Phase 3 §1,
// Testing Strategy "Runner" and "Integration Tests"): a throwaway repository
// tree, a fake CLI, counter and clock — no network, no key. The last test runs
// the REAL production CLI against the dry-run stub.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { EXPECTED_CONFIGURATION_LINE, meanSettledCost, seriesSpend } from "./glm-gate-core.mjs";
import { describeManifest, main, PACKAGE_DIR, readSeries, REPO_ROOT, sealedFileList } from "./glm-gate.mjs";

const CHANGE = "context/changes/finder-glm-5-3";
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
  "packages/code-reviewer/src/config.test.ts",
  "packages/code-reviewer/evals/fixtures/clean-change.diff",
  "packages/code-reviewer/evals/fixtures/clean-change/src/a.ts",
];

const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

/** A throwaway repository, frozen inputs, and a sealed manifest of both. */
function setup({ sealed = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "glm-gate-"));
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
  if (sealed) {
    write(join(repoRoot, CHANGE, "gate-manifest.json"), JSON.stringify(describeManifest({ repoRoot, inputsDir, git })));
  }
  return { root, repoRoot, inputsDir, git, cache: join(root, "cache") };
}

const reported = (value) => ({ value, source: "reported" });
const reviewJson = (over = {}) => ({
  summary: "s",
  findings: [],
  scores: {},
  verdict: "passed",
  models: { finder: "z-ai/glm-5.3", judge: "anthropic/claude-sonnet-5" },
  finderTelemetry: {
    steps: 1,
    toolCalls: 0,
    cost: 0.01,
    requests: [
      {
        kind: "finalization",
        attempt: 1,
        provider: reported("Z.AI"),
        model: reported("z-ai/glm-5.3"),
        finishReason: "stop",
        reasoningTokens: reported(10),
        cost: 0.01,
      },
    ],
  },
  judgeTelemetry: { attempts: 1, cost: 0.02 },
  ...over,
});
const STDERR = `${EXPECTED_CONFIGURATION_LINE}\nfinder step 1: no getFileContext call (tokens in=1 out=1 total=2) provider=Z.AI finish=stop model=z-ai/glm-5.3 reasoning=10\n`;

/** A fake CLI that writes `review` (or nothing) into --out-dir and exits as told. */
const fakeCli = ({ review = reviewJson(), exitCode = 0, stderr = STDERR } = {}) =>
  vi.fn(async (args) => {
    const outDir = args[args.indexOf("--out-dir") + 1];
    if (review !== undefined) write(join(outDir, "review.json"), JSON.stringify(review));
    return { exitCode, signal: null, stdout: "", stderr, interrupted: false };
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
    runCommand: vi.fn(async () => ({ exitCode: 0, signal: null, stdout: "", stderr: "", interrupted: false })),
    now: () => new Date("2026-10-13T00:00:00Z"),
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

const seriesOf = (world) => readSeries(join(world.repoRoot, CHANGE, "gate/series.jsonl"));

describe("preflight", () => {
  it("records T0, the endpoints and a matching manifest; a later preflight never moves T0", async () => {
    const world = setup();
    const { deps, lines, setCounter } = depsFor(world);
    expect(await main(["preflight"], deps)).toBe(0);
    setCounter(101);
    expect(await main(["preflight"], deps)).toBe(0);
    const preflights = seriesOf(world).filter((line) => line.type === "preflight");
    expect(preflights.map((line) => line.counter)).toEqual([100, 101]);
    expect(lines[1]).toMatch(/T0 stays \$100\.000000/u);
    expect(preflights[0].endpoints).toEqual([{ provider: "Z.AI", tag: "z-ai/fp8", status: 0, uptime30m: 100 }]);
  });

  it.each(["OPENROUTER_REVIEW_MODEL", "OPENROUTER_FINDER_PROVIDERS"])(
    "refuses while %s is set in .env",
    async (name) => {
      const world = setup();
      write(join(world.repoRoot, "packages/code-reviewer/.env"), `${name}=x\n`);
      const { deps, lines } = depsFor(world);
      expect(await main(["preflight"], deps)).toBe(2);
      expect(lines[0]).toMatch(new RegExp(`REFUSED \\(environment overrides production defaults\\): ${name}`, "u"));
      expect(deps.readCounter).not.toHaveBeenCalled();
    },
  );

  it("refuses a changed frozen input", async () => {
    const world = setup();
    write(join(world.inputsDir, "269", "pr.diff"), "tampered\n");
    const { deps, lines } = depsFor(world);
    expect(await main(["preflight"], deps)).toBe(2);
    expect(lines[0]).toMatch(/inputs differ from the seal\): pr269\.diff/u);
  });

  it("--manifest-only checks exactly the sealed files", async () => {
    const world = setup();
    const { deps, lines } = depsFor(world);
    expect(await main(["preflight", "--manifest-only"], deps)).toBe(0);
    expect(lines[0]).toMatch(/MANIFEST MATCHES: 17 sealed file\(s\)/u);
    write(join(world.repoRoot, "packages/code-reviewer/src/new.ts"), "x");
    expect(await main(["preflight", "--manifest-only"], deps)).toBe(1);
    expect(lines[1]).toMatch(/packages\/code-reviewer\/src\/new\.ts: not in the seal/u);
    expect(deps.readCounter).not.toHaveBeenCalled();
  });

  it("the sealed file list excludes tests and includes every fixture", () => {
    const world = setup();
    const list = sealedFileList(world.repoRoot);
    expect(list).toContain("packages/code-reviewer/src/config.ts");
    expect(list).not.toContain("packages/code-reviewer/src/config.test.ts");
    expect(list).toContain("packages/code-reviewer/evals/fixtures/clean-change/src/a.ts");
  });
});

// Review F3 of the plan review: G3's schema and the project rules are sealed,
// and either one changing blocks every paid step before anything is invoked.
describe.each([
  ["review-result.schema.json", "packages/code-reviewer/evals/review-result.schema.json"],
  ["ai-review-rules.md", ".github/ai-review-rules.md"],
])("a changed %s", (_label, path) => {
  const changed = async () => {
    const world = setup();
    const { deps, lines } = depsFor(world);
    await main(["preflight"], deps);
    write(join(world.repoRoot, path), "changed after the seal\n");
    return { world, deps, lines };
  };

  it("fails preflight", async () => {
    const { deps, lines } = await changed();
    expect(await main(["preflight"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(new RegExp(`${path.replaceAll(".", "\\.")}: content differs from the seal`, "u"));
  });

  it.each([
    ["run", ["run", "--case", "clean", "--run-id", "clean-01"]],
    ["g3", ["g3"]],
    ["g3 --regrade", ["g3", "--regrade"]],
  ])("blocks %s before any model or grader call", async (_kind, argv) => {
    const { deps, lines } = await changed();
    expect(await main(argv, deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/REFUSED \(tree differs from the seal\)/u);
    expect(deps.runCli).not.toHaveBeenCalled();
    expect(deps.runCommand).not.toHaveBeenCalled();
  });
});

describe("run", () => {
  const ready = async (over = {}) => {
    const world = setup();
    const ctx = depsFor(world, over);
    await main(["preflight"], ctx.deps);
    return { world, ...ctx };
  };

  it("a valid run copies review.json, settles from telemetry and evaluates the G2-01 probe", async () => {
    const { world, deps, lines } = await ready();
    expect(await main(["run", "--case", "clean", "--run-id", "clean-01"], deps)).toBe(0);
    const series = seriesOf(world);
    const record = series.find((line) => line.type === "record");
    expect(record).toMatchObject({
      stepId: "clean-01",
      valid: true,
      artifact: true,
      reasons: [],
      consoleLog: "<cache>/runs/clean-01",
    });
    expect(existsSync(join(world.repoRoot, CHANGE, "gate/results/clean-01.review.json"))).toBe(true);
    expect(series.find((line) => line.type === "settled")).toMatchObject({
      stepId: "clean-01",
      cost: 0.03,
      source: "telemetry",
    });
    expect(series.find((line) => line.type === "probe")).toMatchObject({ problems: [] });
    expect(lines.at(-1)).toMatch(/G2-01 PROBE OK/u);
    // Exactly action.yml's arguments.
    const [args, env] = deps.runCli.mock.calls[0];
    expect(args.filter((arg) => arg.startsWith("--"))).toEqual([
      "--diff-file",
      "--out-dir",
      "--source-root",
      "--project-context-file",
    ]);
    expect(env).toMatchObject({ PR_TITLE: "", PR_BODY: "" });
    expect(JSON.stringify(series)).not.toMatch(/\/tmp\/|\/home\//u);
  });

  it("passes PR_TITLE and PR_BODY from meta.json and the frozen worktree as source root for a PR case", async () => {
    // A dry run skips the sealed order, so #247 can run first; inputs are still checked against the seal.
    const { world, deps } = await ready();
    expect(await main(["run", "--case", "pr247", "--run-id", "dry-247", "--dry-run"], deps)).toBe(0);
    const [args, env] = deps.runCli.mock.calls[0];
    expect(env).toMatchObject({
      PR_TITLE: "PR 247",
      PR_BODY: "body",
      OPENROUTER_API_KEY: "dry-run-no-key",
      GLM_GATE_DRY_RUN_FINDINGS: "1",
    });
    expect(env.NODE_OPTIONS).toMatch(/--import=file:.*glm-gate-dry-run-stub\.mjs$/u);
    expect(args[args.indexOf("--source-root") + 1]).toBe(join(world.inputsDir, "wt-247"));
    // The dry series lives under the cache, never in the change folder.
    expect(existsSync(join(world.repoRoot, CHANGE, "gate/series.jsonl"))).toBe(true);
    expect(seriesOf(world).some((line) => line.stepId === "dry-247")).toBe(false);
    expect(readSeries(join(world.cache, "dry-run", "series.jsonl")).some((line) => line.stepId === "dry-247")).toBe(
      true,
    );
  });

  it("a run with no review.json records artifact:null with its reasons, stays unsettled, and blocks the next step until reconcile", async () => {
    const stderr = `${STDERR}Finder output rejected (reason=length, request=finalization, provider=Z.AI, finish=length, no format repair attempted): v\n`;
    const { world, deps, lines, setCounter } = await ready({
      runCli: fakeCli({ review: undefined, exitCode: 1, stderr }),
    });
    expect(await main(["run", "--case", "clean", "--run-id", "clean-01"], deps)).toBe(1);
    const record = seriesOf(world).find((line) => line.type === "record");
    expect(record).toMatchObject({
      valid: false,
      artifact: null,
      reasons: ["finder-output:length"],
      cost: { complete: false },
    });
    expect(record.requests).toEqual([
      { step: 1, provider: "Z.AI", finishReason: "stop", model: "z-ai/glm-5.3", reasoningTokens: 10 },
    ]);
    expect(lines.at(-1)).toMatch(/INVALID RUN \(finder-output:length\)/u);
    expect(lines.at(-1)).toMatch(/G2-01 PROBE FAILED/u);
    expect(seriesOf(world).some((line) => line.type === "settled")).toBe(false);

    setCounter(100.012);
    expect(await main(["reconcile"], deps)).toBe(0);
    expect(deps.sleep).toHaveBeenCalledWith(180_000);
    expect(seriesOf(world).find((line) => line.type === "settled")).toMatchObject({
      stepId: "clean-01",
      source: "counter",
    });
    expect(lines.at(-1)).toMatch(/SETTLED: clean-01 at \$0\.012000/u);
  });

  it("a valid run with incomplete cost telemetry is unsettled and blocks the next paid step until reconcile", async () => {
    const unpriced = reviewJson({ judgeTelemetry: { attempts: 1 } });
    const { world, deps, lines, setCounter } = await ready({ runCli: fakeCli({ review: unpriced }) });
    expect(await main(["run", "--case", "clean", "--run-id", "clean-01"], deps)).toBe(0);
    expect(lines.at(-1)).toMatch(/UNSETTLED — run `reconcile`/u);
    expect(await main(["continue", "--for", "probe", "--note", "go"], deps)).toBe(0);
    expect(await main(["run", "--case", "clean", "--run-id", "clean-02"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/REFUSED \(not admitted\): clean — unsettled step\(s\) clean-01/u);
    expect(deps.runCli).toHaveBeenCalledTimes(1);
    setCounter(100.03);
    expect(await main(["reconcile"], deps)).toBe(0);
    expect(await main(["run", "--case", "clean", "--run-id", "clean-02"], deps)).toBe(0);
    expect(deps.runCli).toHaveBeenCalledTimes(2);
    // clean-01 settled from the counter; clean-02 is itself unsettled until its own reconcile.
    expect(
      seriesOf(world)
        .filter((line) => line.type === "settled")
        .map((line) => line.stepId),
    ).toEqual(["clean-01"]);
  });

  it("refuses out of the sealed order, and before the owner confirms the probe", async () => {
    const { deps, lines } = await ready();
    expect(await main(["run", "--case", "pr269", "--run-id", "pr269-01"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/out of the sealed order\): pr269-01 \(pr269\) — the next step is clean/u);
    await main(["run", "--case", "clean", "--run-id", "clean-01"], deps);
    expect(await main(["run", "--case", "clean", "--run-id", "clean-02"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/G2-01 probe/u);
    expect(await main(["continue", "--for", "probe", "--note", "probe read, go"], deps)).toBe(0);
    expect(await main(["run", "--case", "clean", "--run-id", "clean-02"], deps)).toBe(0);
    expect(deps.runCli).toHaveBeenCalledTimes(2);
  });

  it("never re-runs a run-id", async () => {
    const { deps, lines } = await ready();
    await main(["run", "--case", "clean", "--run-id", "clean-01"], deps);
    expect(await main(["run", "--case", "clean", "--run-id", "clean-01"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/run-id already used/u);
  });

  it("a dry run stays re-runnable as written: a reused id is recorded as <id>-r<k>", async () => {
    const { world, deps, lines } = await ready();
    for (let i = 0; i < 3; i += 1) {
      expect(await main(["run", "--case", "clean", "--run-id", "dry-1", "--dry-run"], deps)).toBe(0);
    }
    const ids = readSeries(join(world.cache, "dry-run", "series.jsonl"))
      .filter((line) => line.type === "record")
      .map((line) => line.stepId);
    expect(ids).toEqual(["dry-1", "dry-1-r2", "dry-1-r3"]);
    expect(lines.at(-1)).toMatch(/^VALID RUN: dry-1-r3 /u);
  });

  it("records a budget stop (exit 4) and spends nothing when T + P exceeds the cap", async () => {
    const { world, deps, lines, setCounter } = await ready();
    await main(["continue", "--for", "pause", "--note", "n"], deps).catch(() => undefined);
    setCounter(103.48);
    expect(await main(["run", "--case", "clean", "--run-id", "clean-01"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/paused at T ≥ \$3\.00/u);
    expect(await main(["continue", "--for", "pause", "--note", "go on"], deps)).toBe(0);
    expect(await main(["run", "--case", "clean", "--run-id", "clean-01"], deps)).toBe(4);
    expect(lines.at(-1)).toMatch(/BUDGET STOP: clean .* INCOMPLETE \(budget\)/u);
    expect(seriesOf(world).some((line) => line.type === "budget_stop")).toBe(true);
    expect(deps.runCli).not.toHaveBeenCalled();
  });

  it("refuses without a manifest outside a dry run", async () => {
    const world = setup({ sealed: false });
    const { deps, lines } = depsFor(world);
    expect(await main(["run", "--case", "clean", "--run-id", "clean-01"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/REFUSED \(no manifest\)/u);
  });
});

// Owner decision 2026-10-14: a confirmed OpenRouter 401/402 stops the series.
describe("auth/credit stop", () => {
  const stopped = async (stderrTail = "api error: status=402\n") => {
    const world = setup();
    const ctx = depsFor(world, {
      runCli: fakeCli({ review: undefined, exitCode: 1, stderr: `${STDERR}Insufficient credits\n${stderrTail}` }),
    });
    await main(["preflight"], ctx.deps);
    const code = await main(["run", "--case", "clean", "--run-id", "clean-01"], ctx.deps);
    return { world, code, ...ctx };
  };

  it("a confirmed 402 exits 5, is recorded, and blocks every further paid step", async () => {
    const { world, code, deps, lines } = await stopped();
    expect(code).toBe(5);
    expect(lines.at(-1)).toMatch(/^AUTH\/CREDIT STOP: clean-01 \(clean\) — confirmed OpenRouter 402/u);
    const record = seriesOf(world).find((line) => line.type === "record");
    expect(record).toMatchObject({ authCredit: "confirmed", valid: false });
    // No probe is evaluated on a run that is not a sample.
    expect(seriesOf(world).some((line) => line.type === "probe")).toBe(false);
    expect(await main(["run", "--case", "clean", "--run-id", "clean-02"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/the series has ended: INCOMPLETE \(auth\/credit\)/u);
    expect(deps.runCli).toHaveBeenCalledTimes(1);
  });

  it("resumes only under a dated amendment, once per stop", async () => {
    const { deps, lines, setCounter } = await stopped();
    expect(await main(["continue", "--for", "auth-credit", "--note", "topped up"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/REFUSED \(no amendment\)/u);
    expect(
      await main(
        ["continue", "--for", "auth-credit", "--amendment", "gate.md Amendment 1 (sha256 …)", "--note", "topped up"],
        deps,
      ),
    ).toBe(0);
    expect(await main(["continue", "--for", "auth-credit", "--amendment", "again", "--note", "n"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/no auth\/credit stop/u);
    // The stopped run's cost still has to settle before the next paid step.
    setCounter(100.001);
    expect(await main(["reconcile"], deps)).toBe(0);
    deps.runCli = fakeCli();
    expect(await main(["run", "--case", "clean", "--run-id", "clean-02"], deps)).toBe(0);
    expect(lines.at(-1)).toMatch(/G2-01 PROBE OK/u);
  });

  it("text without a status line is suspected: an ordinary invalid run, not a stop", async () => {
    const { world, code } = await stopped("");
    expect(code).toBe(1);
    expect(seriesOf(world).find((line) => line.type === "record")).toMatchObject({ authCredit: "suspected" });
  });
});

describe("reconcile", () => {
  const unsettledRun = async () => {
    const world = setup();
    const ctx = depsFor(world, { runCli: fakeCli({ review: undefined, exitCode: 1 }) });
    await main(["preflight"], ctx.deps);
    await main(["run", "--case", "clean", "--run-id", "clean-01"], ctx.deps);
    return { world, ...ctx };
  };

  const afterTelemetrySettlement = async () => {
    const world = setup();
    const ctx = depsFor(world);
    expect(await main(["preflight"], ctx.deps)).toBe(0);
    expect(await main(["run", "--case", "clean", "--run-id", "clean-01"], ctx.deps)).toBe(0);
    expect(await main(["continue", "--for", "probe", "--note", "go"], ctx.deps)).toBe(0);
    ctx.deps.runCli = fakeCli({ review: reviewJson({ judgeTelemetry: { attempts: 1 } }) });
    // The counter still reads T0 when clean-02 starts, although clean-01 is settled at $0.03.
    expect(await main(["run", "--case", "clean", "--run-id", "clean-02"], ctx.deps)).toBe(0);
    return { world, ...ctx };
  };

  it("does not charge a delayed telemetry-settled run again when settling the next run", async () => {
    const { world, deps, setCounter } = await afterTelemetrySettlement();
    setCounter(100.09); // Earlier $0.03 plus the incomplete run's $0.06 have now appeared.
    expect(await main(["reconcile"], deps)).toBe(0);
    const series = seriesOf(world);
    const settlement = series.find((line) => line.type === "settled" && line.stepId === "clean-02");
    expect(settlement.source).toBe("counter");
    expect(settlement.cost).toBeCloseTo(0.06, 10);
    expect(seriesSpend(series, 100.09).settledTotal).toBeCloseTo(0.09, 10);
    expect(meanSettledCost(series, "clean")).toBeCloseTo(0.045, 10);
  });

  it.each([100.02, 100.034])(
    "keeps the next run unsettled when cumulative usage %s has not caught up with attributed and known costs",
    async (counter) => {
      const { world, deps, setCounter } = await afterTelemetrySettlement();
      setCounter(counter);
      expect(await main(["reconcile"], deps)).toBe(1);
      const series = seriesOf(world);
      expect(series.findLast((line) => line.type === "reconcile").status).toBe("unsettled");
      expect(series.filter((line) => line.type === "settled").map((line) => line.stepId)).toEqual(["clean-01"]);
    },
  );

  it("refuses reads less than 180 s apart", async () => {
    const { deps, lines } = await unsettledRun();
    expect(await main(["reconcile", "--settle-seconds", "60"], deps)).toBe(2);
    expect(lines.at(-1)).toMatch(/at least 180 s apart/u);
  });

  it("an unmoved counter with nothing reported stays unsettled", async () => {
    const { deps, lines } = await unsettledRun();
    expect(await main(["reconcile"], deps)).toBe(1);
    expect(lines.at(-1)).toMatch(/UNSETTLED: clean-01 — counter unmoved/u);
  });

  it("a counter still moving between the two reads stays unsettled", async () => {
    const { deps, lines } = await unsettledRun();
    let reads = 0;
    deps.readCounter = vi.fn(async () => {
      reads += 1;
      return reads === 1 ? 100.01 : 100.02;
    });
    expect(await main(["reconcile"], deps)).toBe(1);
    expect(lines.at(-1)).toMatch(/counter still moving/u);
  });

  it("with nothing unsettled, checks the series total instead", async () => {
    const world = setup();
    const { deps, lines, setCounter } = depsFor(world);
    await main(["preflight"], deps);
    await main(["run", "--case", "clean", "--run-id", "clean-01"], deps);
    setCounter(100.03);
    expect(await main(["reconcile"], deps)).toBe(0);
    expect(lines.at(-1)).toMatch(/SERIES CHECKED: counter delta \$0\.030000 vs settled \$0\.030000/u);
  });
});

describe("outcome", () => {
  it("writes the automatic outcome between the markers of gate.md § Results", async () => {
    const world = setup();
    const { deps } = depsFor(world);
    await main(["preflight"], deps);
    write(
      join(world.repoRoot, CHANGE, "gate.md"),
      "# Gate\n\n## Results\n\n<!-- glm-gate:outcome:start -->\nold\n<!-- glm-gate:outcome:end -->\n",
    );
    expect(await main(["outcome", "--write"], deps)).toBe(0);
    const gate = readFileSync(join(world.repoRoot, CHANGE, "gate.md"), "utf8");
    expect(gate).toContain("**Verdict:** in progress — next step: clean");
    expect(gate).not.toContain("\nold\n");
    expect(gate).toMatch(/<!-- glm-gate:outcome:end -->\n$/u);
  });
});

describe("usage", () => {
  it("names an unknown command", async () => {
    const world = setup();
    const { deps, lines } = depsFor(world);
    expect(await main(["bogus"], deps)).toBe(2);
    expect(lines[0]).toMatch(/one of preflight, run, g3, reconcile, continue, outcome, manifest/u);
  });
});

// Integration: the real production CLI, end to end, against the dry-run stub.
describe("run --dry-run through the real CLI", () => {
  it("is a valid clean run with no key and no network, recorded outside the change folder", async () => {
    const cache = mkdtempSync(join(tmpdir(), "glm-gate-dry-"));
    const lines = [];
    const quietSpawn = (args, env, cwd) =>
      new Promise((done) => {
        const child = spawn("npm", ["run", "review", "--", ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        child.on("close", (exitCode, signal) => done({ exitCode, signal, stdout, stderr, interrupted: false }));
      });
    const env = { ...process.env, GLM_GATE_CACHE: cache };
    for (const name of ["OPENROUTER_REVIEW_MODEL", "OPENROUTER_FINDER_PROVIDERS", "OPENROUTER_MODEL"]) delete env[name];
    const code = await main(["run", "--case", "clean", "--run-id", "dry-it", "--dry-run"], {
      repoRoot: REPO_ROOT,
      packageDir: PACKAGE_DIR,
      envFile: join(PACKAGE_DIR, ".env.does-not-exist"),
      env,
      git: () => "",
      readCounter: () => {
        throw new Error("a dry run reads no counter");
      },
      readEndpoints: () => {
        throw new Error("a dry run reads no endpoint");
      },
      runCli: quietSpawn,
      runCommand: () => {
        throw new Error("no command in a run");
      },
      now: () => new Date(),
      sleep: async () => undefined,
      log: (line) => lines.push(line),
    });
    expect(lines.at(-1)).toMatch(/^VALID RUN: dry-it \(clean, exit 0/u);
    expect(code).toBe(0);
    const series = readSeries(join(cache, "dry-run", "series.jsonl"));
    expect(series.find((line) => line.type === "record")).toMatchObject({
      valid: true,
      configurationOk: true,
      models: { finder: "z-ai/glm-5.3" },
      findings: [],
    });
  }, 60_000);
});
