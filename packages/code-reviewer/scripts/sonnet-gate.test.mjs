// Hermetic tests for the finder-sonnet(-effort) measurement runner: every
// refusal must fire BEFORE the paid call, and every run — valid, invalid,
// failed — must leave a record. A fake CLI and a fake key counter; no network,
// no API spend.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  describeArm,
  describeGlobal,
  effortFlags,
  main,
  PACKAGE_DIR,
  parseCliLog,
  readSeries,
  realGit,
  scheduleState,
  spawnReviewCli,
  uncommittedSrc,
} from "./sonnet-gate.mjs";

const HEADS = { 247: "dec09f8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 269: "fca2778bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };

/** The owner's balanced order (plan Phase 2 §2). */
const RUN_ORDER = [
  "low-247-r1",
  "medium-247-r1",
  "medium-269-r1",
  "low-269-r1",
  "medium-247-r2",
  "low-247-r2",
  "low-269-r2",
  "medium-269-r2",
];

/** One test world: temp inputs per PR, a fake git, a fake counter and a fake CLI. */
function makeWorld() {
  const dir = mkdtempSync(join(tmpdir(), "sonnet-gate-"));
  const files = {};
  for (const pr of ["247", "269"]) {
    const root = join(dir, `wt-${pr}`);
    mkdirSync(root);
    files[pr] = {
      diff: join(dir, `${pr}.diff`),
      rules: join(dir, `${pr}.rules.md`),
      meta: join(dir, `${pr}.meta.json`),
      root,
    };
    writeFileSync(files[pr].diff, `diff for ${pr}\n`);
    writeFileSync(files[pr].rules, `rules at base of ${pr}\n`);
    writeFileSync(files[pr].meta, JSON.stringify({ title: `PR ${pr}`, body: "body" }));
  }
  const world = {
    dir,
    files,
    out: join(dir, "series.jsonl"),
    manifestPath: join(dir, "manifest.json"),
    envFile: join(dir, ".env"),
    counter: 10,
    dirtySrc: false,
    // The reasoning count the fake CLI reports per step (null → `?`).
    reasoning: 1_000,
    logs: [],
    cliCalls: [],
    sleeps: [],
    // What the fake CLI does on its next call; overridden per test.
    cli: (args) => validCli(world, args),
  };
  world.deps = {
    packageDir: PACKAGE_DIR,
    envFile: world.envFile,
    env: { OPENROUTER_API_KEY: "k" },
    git: (args, cwd) => {
      const key = args.join(" ");
      if (key === "rev-parse HEAD:packages/code-reviewer/src") return "tree-sealed";
      if (key === "status --porcelain -- :(top)packages/code-reviewer/src") return world.dirtySrc ? " M src/x.ts" : "";
      if (key === "rev-parse HEAD") return cwd === files["247"].root ? HEADS[247] : HEADS[269];
      if (key === "status --porcelain") return "";
      throw new Error(`unexpected git ${key}`);
    },
    readCounter: () => Promise.resolve(world.counter),
    runCli: (args, env, cwd) => {
      world.cliCalls.push({ args, env, cwd });
      return Promise.resolve(world.cli(args, env));
    },
    now: () => new Date("2026-10-06T10:00:00Z"),
    sleep: (ms) => {
      world.sleeps.push(ms);
      return Promise.resolve();
    },
    log: (message) => {
      world.logs.push(message);
    },
  };
  return world;
}

const outDirOf = (args) => args[args.indexOf("--out-dir") + 1];
const effortOf = (args) => args[args.indexOf("--finder-reasoning-effort") + 1];

const REVIEW = {
  findings: [{ id: "F1", file: "a.ts", severity: "minor" }],
  scores: { correctness: 4 },
  verdict: "passed",
  models: { finder: "anthropic/claude-sonnet-5", judge: "anthropic/claude-sonnet-5" },
  finderTelemetry: { cost: 0.1 },
  judgeTelemetry: { cost: 0.02 },
};

/** The evidence lines the real CLI prints for this arm: its configuration and one request. */
function evidenceLines(world, effort, overrides = {}) {
  const resolved = world.armConfigs[effort].resolved;
  const request = {
    model: resolved.finder.model,
    provider: resolved.finder.routing,
    reasoning: { effort },
    max_tokens: resolved.finder.maxOutputTokens,
    ...overrides.request,
  };
  return (
    `resolved configuration: ${JSON.stringify(overrides.configuration ?? resolved)}\n` +
    `finder request: ${JSON.stringify(request)}\n`
  );
}

const stepLine = (reasoning) =>
  `finder step 1: no getFileContext call (tokens in=1 out=2 reasoning=${reasoning === null ? "?" : String(reasoning)} total=3) provider=Anthropic finish=stop\n`;

/** A clean run: spends $0.12 on the counter and writes review.json. */
function validCli(world, args, review = REVIEW) {
  world.counter += 0.12;
  mkdirSync(outDirOf(args), { recursive: true });
  writeFileSync(join(outDirOf(args), "review.json"), JSON.stringify(review));
  return {
    exitCode: 0,
    signal: null,
    stdout: "verdict=passed",
    stderr: evidenceLines(world, effortOf(args)) + stepLine(world.reasoning),
  };
}

/** A failed run: the CLI exits 1 after one logged step; the counter moves by `cost`. */
const invalidCli =
  (world, cost = 0.05) =>
  (args) => {
    world.counter += cost;
    return {
      exitCode: 1,
      signal: null,
      stdout: "",
      stderr: `${evidenceLines(world, effortOf(args))}${stepLine(world.reasoning)}No output generated.\n`,
    };
  };

async function seal(world, overrides = {}) {
  const global = await describeGlobal(world.deps);
  world.armConfigs = { low: describeArm(world.deps, "low"), medium: describeArm(world.deps, "medium") };
  const { createHash } = await import("node:crypto");
  const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  const inputs = Object.fromEntries(
    ["247", "269"].map((pr) => [
      pr,
      {
        diff: hash(world.files[pr].diff),
        rules: hash(world.files[pr].rules),
        prMeta: hash(world.files[pr].meta),
        head: HEADS[pr],
      },
    ]),
  );
  world.manifest = {
    global,
    arms: world.armConfigs,
    runOrder: RUN_ORDER,
    inputs,
    budget: { total: 4, reserve: 0.5, firstRunEstimate: { 247: 0.2, 269: 0.45 } },
    ...overrides,
  };
  writeFileSync(world.manifestPath, JSON.stringify(world.manifest));
}

const run = (world, runId) => {
  const pr = runId.split("-")[1];
  const f = world.files[pr] ?? world.files["247"];
  return main(
    [
      "run",
      "--run-id",
      runId,
      "--diff",
      f.diff,
      "--rules",
      f.rules,
      "--source-root",
      f.root,
      "--pr-meta",
      f.meta,
      "--out",
      world.out,
      "--manifest",
      world.manifestPath,
    ],
    world.deps,
  );
};

const reconcile = (world, runId, settleSeconds) =>
  main(
    [
      "reconcile",
      "--run-id",
      runId,
      "--out",
      world.out,
      ...(settleSeconds === undefined ? [] : ["--settle-seconds", settleSeconds]),
    ],
    world.deps,
  );

const ack = (world, runId) => main(["ack", "--run-id", runId, "--out", world.out, "--note", "owner told"], world.deps);

/** Runs `runId` and settles it; returns the run's exit code. */
async function runAndSettle(world, runId) {
  const code = await run(world, runId);
  if (code === 0 || code === 1 || code === 3) expect(await reconcile(world, runId)).toBe(0);
  return code;
}

const state = (world) => scheduleState(readSeries(world.out), world.manifest);
const runIdsCalled = (world) =>
  world.cliCalls.map(
    ({ args }) => `${effortOf(args)}-${args[args.indexOf("--diff-file") + 1].includes("247") ? "247" : "269"}`,
  );

let world;
beforeEach(async () => {
  world = makeWorld();
  await seal(world);
  await main(["t0", "--out", world.out], world.deps);
});

describe("arms and the sealed run order", () => {
  it("describe --arm low and --arm medium differ only in the finder's reasoning effort", async () => {
    const low = describeArm(world.deps, "low");
    const medium = describeArm(world.deps, "medium");
    expect(low.resolved.finder.reasoningEffort).toBe("low");
    expect(medium.resolved.finder.reasoningEffort).toBe("medium");
    expect({
      ...medium,
      resolved: { ...medium.resolved, finder: { ...medium.resolved.finder, reasoningEffort: "low" } },
    }).toEqual(low);
    // The base (no flag) configuration sends no effort.
    expect((await describeGlobal(world.deps)).effectiveConfig.resolved.finder.reasoningEffort).toBeNull();
  });

  it("describe refuses an unknown arm", async () => {
    expect(await main(["describe", "--arm", "max"], world.deps)).toBe(2);
    expect(world.logs.at(-1)).toContain("REFUSED (unknown arm): max");
  });

  it("the child CLI receives the arm's effort flag", async () => {
    expect(await run(world, "low-247-r1")).toBe(0);
    expect(world.cliCalls[0].args.slice(-2)).toEqual(["--finder-reasoning-effort", "low"]);
  });

  it("runs the balanced order end to end, each arm's P tracked per PR", async () => {
    for (const runId of RUN_ORDER) expect(await runAndSettle(world, runId)).toBe(0);
    expect(runIdsCalled(world)).toEqual(RUN_ORDER.map((runId) => runId.replace(/-r\d$/u, "")));
    expect(state(world)).toEqual({ next: undefined, ended: {}, blocking: undefined, halted: undefined });
    const started = readSeries(world.out).filter((line) => line.type === "started");
    const pOf = (runId) => started.find((line) => line.runId === runId).budget.p;
    // First runs per arm and PR use the sealed estimate; second runs 2 × that arm's own settled cost.
    expect(pOf("low-247-r1")).toBe(0.2);
    expect(pOf("medium-247-r1")).toBe(0.2);
    expect(pOf("medium-269-r1")).toBe(0.45);
    expect(pOf("low-269-r1")).toBe(0.45);
    expect(pOf("medium-247-r2")).toBeCloseTo(0.24, 9);
    expect(pOf("low-269-r2")).toBeCloseTo(0.24, 9);
  });

  it("P uses only the same arm's settled cost on the same PR", async () => {
    world.cli = (args) => {
      const result = validCli(world, args);
      world.counter += 0.18; // low-247-r1 costs $0.30 in total
      return result;
    };
    expect(await run(world, "low-247-r1")).toBe(0);
    // Telemetry says $0.12; the counter says $0.30 — the owner resolves it.
    expect(await reconcile(world, "low-247-r1")).toBe(1);
    expect(
      await main(
        ["resolve", "--run-id", "low-247-r1", "--out", world.out, "--cost", "0.3", "--reason", "owner"],
        world.deps,
      ),
    ).toBe(0);
    world.cli = (args) => validCli(world, args);
    expect(await run(world, "medium-247-r1")).toBe(0);
    const started = readSeries(world.out).filter((line) => line.type === "started");
    // medium's first run on #247 is not inflated by low's $0.30.
    expect(started.at(-1).budget.p).toBe(0.2);
  });

  it.each([
    ["an unsealed arm", "high-247-r1", "REFUSED (unknown arm)"],
    ["an unsealed PR", "low-999-r1", "REFUSED (PR not sealed)"],
    ["a third repeat", "low-247-r3", "REFUSED (run-id not in the sealed order): low-247-r3"],
    ["a malformed id", "247-r1", "REFUSED (bad run-id): 247-r1"],
    [
      "an out-of-order id",
      "medium-269-r1",
      "REFUSED (out of the sealed order): medium-269-r1 — next eligible run is low-247-r1",
    ],
  ])("refuses %s with zero CLI invocations", async (_label, runId, message) => {
    expect(await run(world, runId)).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain(message);
  });

  it("a different effective effort for an arm refuses before the CLI starts", async () => {
    world.manifest.arms.low.resolved.finder.reasoningEffort = "medium";
    writeFileSync(world.manifestPath, JSON.stringify(world.manifest));
    expect(await run(world, "low-247-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain(
      "REFUSED (arm low configuration differs from the seal): resolved.finder.reasoningEffort",
    );
  });

  it("a manifest whose runOrder names an unsealed arm is refused", async () => {
    world.manifest.runOrder = [...RUN_ORDER, "high-247-r1"];
    writeFileSync(world.manifestPath, JSON.stringify(world.manifest));
    expect(await run(world, "low-247-r1")).toBe(2);
    expect(world.logs.at(-1)).toContain("REFUSED (malformed manifest)");
    expect(world.logs.at(-1)).toContain("high-247-r1");
  });
});

describe("arms that end early", () => {
  it.each([
    ["low", "low-247-r1", ["medium-247-r1", "medium-269-r1", "medium-247-r2", "medium-269-r2"]],
    ["medium", "medium-247-r1", ["low-269-r1", "low-247-r2", "low-269-r2"]],
  ])("an invalid %s run ends that arm; the other continues in sealed order", async (arm, failing, rest) => {
    const before = RUN_ORDER.slice(0, RUN_ORDER.indexOf(failing));
    for (const runId of before) expect(await runAndSettle(world, runId)).toBe(0);
    world.cli = invalidCli(world);
    expect(await runAndSettle(world, failing)).toBe(1);
    expect(state(world).ended).toEqual({ [arm]: { outcome: "FAIL (reliability)", runId: failing } });

    // The owner must be told before anything more is spent.
    world.cli = (args) => validCli(world, args);
    world.cliCalls.length = 0;
    expect(await run(world, rest[0])).toBe(2);
    expect(world.logs.at(-1)).toContain(`REFUSED (owner stop pending): run(s) ${failing}`);
    expect(await ack(world, failing)).toBe(0);

    // A direct call to the ended arm refuses without starting the CLI.
    const laterOfArm = RUN_ORDER.find(
      (runId) => runId.startsWith(`${arm}-`) && runId !== failing && !before.includes(runId),
    );
    expect(await run(world, laterOfArm)).toBe(2);
    expect(world.logs.at(-1)).toContain(`REFUSED (arm ${arm} ended — FAIL (reliability) at ${failing})`);
    expect(world.cliCalls).toHaveLength(0);

    for (const runId of rest) expect(await runAndSettle(world, runId)).toBe(0);
    expect(state(world).next).toBeUndefined();
    expect(world.cliCalls).toHaveLength(rest.length);
  });

  it("a budget skip is recorded, ends that arm INCOMPLETE and spends nothing; the other arm continues", async () => {
    for (const runId of ["low-247-r1", "medium-247-r1"]) expect(await runAndSettle(world, runId)).toBe(0);
    // medium-269-r1: T 0.24 + P 0.45 + 0.50 = 1.19 — make it not fit.
    world.counter += 2.9; // T = 3.14
    expect(
      await main(
        ["resolve", "--run-id", "medium-247-r1", "--out", world.out, "--cost", "3.02", "--reason", "owner"],
        world.deps,
      ),
    ).toBe(0);
    world.cliCalls.length = 0;
    expect(await run(world, "medium-269-r1")).toBe(4);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toMatch(/^BUDGET SKIP: medium-269-r1 — .* arm medium ends INCOMPLETE \(budget\)/u);
    const skip = readSeries(world.out).at(-1);
    expect(skip).toMatchObject({ type: "budget_skip", runId: "medium-269-r1", arm: "medium", pr: "269" });
    expect(readSeries(world.out).some((line) => line.type === "started" && line.runId === "medium-269-r1")).toBe(false);
    expect(state(world)).toMatchObject({
      next: "low-269-r1",
      ended: { medium: { outcome: "INCOMPLETE (budget)", runId: "medium-269-r1" } },
    });
    // A skipped run is never replaced, and its arm's later entries refuse.
    expect(await run(world, "medium-269-r1")).toBe(2);
    expect(await run(world, "medium-247-r2")).toBe(2);
    expect(world.logs.at(-1)).toContain("REFUSED (arm medium ended — INCOMPLETE (budget) at medium-269-r1)");
    expect(world.cliCalls).toHaveLength(0);
  });

  it("replaying the series reconstructs the same next run and ended arms", async () => {
    for (const runId of ["low-247-r1", "medium-247-r1"]) expect(await runAndSettle(world, runId)).toBe(0);
    world.cli = invalidCli(world);
    expect(await runAndSettle(world, "medium-269-r1")).toBe(1);
    const first = state(world);
    // A restarted process reads only the file.
    const replayed = scheduleState(
      readFileSync(world.out, "utf8")
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line)),
      JSON.parse(readFileSync(world.manifestPath, "utf8")),
    );
    expect(replayed).toEqual(first);
    expect(first).toEqual({
      next: "low-269-r1",
      ended: { medium: { outcome: "FAIL (reliability)", runId: "medium-269-r1" } },
      blocking: undefined,
      halted: undefined,
    });
    expect(await main(["status", "--out", world.out, "--manifest", world.manifestPath], world.deps)).toBe(0);
    expect(JSON.parse(world.logs.at(-1))).toMatchObject({ next: "low-269-r1", pendingOwnerStops: ["medium-269-r1"] });
  });

  it("an unresolved started run blocks every further call and is never replaced", async () => {
    world.cli = () => {
      throw new Error("runner killed mid-run");
    };
    await expect(run(world, "low-247-r1")).rejects.toThrow("runner killed");
    world.cli = (args) => validCli(world, args);
    world.cliCalls.length = 0;
    for (const runId of ["low-247-r1", "medium-247-r1", "low-247-r2"]) expect(await run(world, runId)).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-2)).toContain(
      "REFUSED (series stopped): medium-247-r1 — low-247-r1 started and has no record; it blocks the series and is never replaced",
    );
    expect(state(world)).toMatchObject({ blocking: "low-247-r1", next: undefined });
  });

  it("a measurement error halts the series for the owner", async () => {
    world.cli = () => {
      world.counter += 0.01;
      return {
        exitCode: 1,
        signal: null,
        stdout: "",
        stderr: "OpenRouter error 402: Insufficient credits. Add more using https://openrouter.ai/settings/credits\n",
      };
    };
    expect(await runAndSettle(world, "low-247-r1")).toBe(3);
    world.cli = (args) => validCli(world, args);
    expect(await run(world, "medium-247-r1")).toBe(2);
    expect(world.logs.at(-1)).toContain("the series is halted by the measurement error of low-247-r1");
    expect(state(world).halted).toBe("low-247-r1");
  });
});

describe("refusals before the paid call", () => {
  it("a recorded run-id refuses", async () => {
    expect(await runAndSettle(world, "low-247-r1")).toBe(0);
    world.cliCalls.length = 0;
    expect(await run(world, "low-247-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain("REFUSED (run-id already used): low-247-r1");
  });

  it("a dirty src refuses", async () => {
    world.dirtySrc = true;
    expect(await run(world, "low-247-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain("REFUSED (uncommitted src)");
  });

  it("a dirty src module outside the hashed files refuses against real git", async () => {
    // A throwaway repo shaped like this one: git runs from the package dir, so
    // a pathspec that is not anchored at the repo root would miss the edit.
    const repo = mkdtempSync(join(tmpdir(), "sonnet-gate-git-"));
    const pkg = join(repo, "packages", "code-reviewer");
    mkdirSync(join(pkg, "src"), { recursive: true });
    writeFileSync(join(pkg, "src", "pipeline.ts"), "export const v = 1;\n");
    const git = (args) => realGit(["-c", "user.email=t@t", "-c", "user.name=t", ...args], repo);
    git(["init", "-q"]);
    git(["add", "."]);
    git(["commit", "-qm", "seed"]);
    expect(uncommittedSrc(realGit, pkg)).toBe("");

    writeFileSync(join(pkg, "src", "pipeline.ts"), "export const v = 2;\n");
    expect(uncommittedSrc(realGit, pkg)).not.toBe("");
    const fakeGit = world.deps.git;
    world.deps.git = (args, cwd) => (args[0] === "status" && args.length > 2 ? realGit(args, pkg) : fakeGit(args, cwd));
    expect(await run(world, "low-247-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain("REFUSED (uncommitted src)");
  });

  it.each(["247", "269"])("a changed input for PR %s is refused before the CLI starts", async (pr) => {
    if (pr === "269")
      for (const runId of ["low-247-r1", "medium-247-r1"]) expect(await runAndSettle(world, runId)).toBe(0);
    world.cliCalls.length = 0;
    writeFileSync(world.files[pr].diff, "a different diff\n");
    expect(await run(world, pr === "247" ? "low-247-r1" : "medium-269-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain(`REFUSED (input differs from the seal): PR #${pr} diff`);
  });

  it("an inherited model override prevents CLI execution", async () => {
    world.deps.env = { ...world.deps.env, OPENROUTER_REVIEW_MODEL: "z-ai/glm-4.6" };
    expect(await run(world, "low-247-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain("effectiveConfig.resolved.finder.model");
  });

  it("a model override in the package .env prevents CLI execution", async () => {
    writeFileSync(world.envFile, "OPENROUTER_JUDGE_MODEL=z-ai/glm-4.6\n");
    expect(await run(world, "low-247-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain("effectiveConfig.resolved.judge.model");
  });

  it("the child receives the checked environment, so its .env cannot change the configuration", async () => {
    writeFileSync(world.envFile, "OPENROUTER_API_KEY=from-dotenv\nSOME_SETTING=x\n");
    expect(await run(world, "low-247-r1")).toBe(0);
    const { env } = world.cliCalls[0];
    expect(env.OPENROUTER_API_KEY).toBe("k"); // inherited wins, as Node's --env-file does
    expect(env.SOME_SETTING).toBe("x");
    expect(env.PR_TITLE).toBe("PR 247");
  });
});

describe("run records", () => {
  it("records per-step tokens, the request evidence and the resolved configuration", async () => {
    world.cli = (args) => {
      const result = validCli(world, args);
      return { ...result, stderr: `${result.stderr}retrying finder after NoOutputGeneratedError in 1500ms\n` };
    };
    expect(await run(world, "low-247-r1")).toBe(0);
    const record = readSeries(world.out).find((line) => line.type === "record");
    expect(record.retries).toEqual({ finder: 1 });
    expect(record.finderSteps).toEqual([
      { step: 1, inputTokens: 1, outputTokens: 2, reasoningTokens: 1000, provider: "Anthropic", finish: "stop" },
    ]);
    expect(record.requestedEffort).toBe("low");
    expect(record.finderRequests).toEqual([
      {
        model: "anthropic/claude-sonnet-5",
        provider: world.armConfigs.low.resolved.finder.routing,
        reasoning: { effort: "low" },
        max_tokens: 16_384,
      },
    ]);
    expect(record.resolvedConfiguration).toEqual(world.armConfigs.low.resolved);
    expect(record.effortFlag).toEqual([]);
  });

  it("a run with no review.json is invalid, and still recorded", async () => {
    world.cli = invalidCli(world);
    expect(await run(world, "low-247-r1")).toBe(1);
    const record = readSeries(world.out).find((line) => line.type === "record");
    expect(record).toMatchObject({ outcome: "invalid", errorClass: "model-attributable", findings: null });
    expect(record.cost).toEqual({ finder: null, judge: null, total: null, costSource: "none" });
    expect(world.logs.at(-1)).toMatch(/^INVALID RUN/u);
  });

  it("a 402 is a measurement error, not a run result", async () => {
    world.cli = () => ({
      exitCode: 1,
      signal: null,
      stdout: "",
      stderr: "OpenRouter error 402: Insufficient credits. Add more using https://openrouter.ai/settings/credits\n",
    });
    expect(await run(world, "low-247-r1")).toBe(3);
    const record = readSeries(world.out).find((line) => line.type === "record");
    expect(record.outcome).toBe("measurement-error");
    expect(world.logs.at(-1)).toMatch(/^MEASUREMENT ERROR \(openrouter-auth-or-credit\)/u);
  });

  it.each([
    [
      "sent a different effort",
      { request: { reasoning: { effort: "medium" } } },
      "request-mismatch(request 1: reasoning.effort)",
    ],
    ["sent no reasoning", { request: { reasoning: undefined } }, "request-mismatch(request 1: reasoning)"],
    [
      "resolved a different configuration",
      { configuration: { finder: { reasoningEffort: "medium" } } },
      "configuration-mismatch(finder.reasoningEffort)",
    ],
  ])("a child that %s is a measurement error", async (_label, overrides, errorClass) => {
    world.cli = (args) => {
      const result = validCli(world, args);
      const configuration =
        overrides.configuration === undefined
          ? undefined
          : {
              ...world.armConfigs.low.resolved,
              finder: { ...world.armConfigs.low.resolved.finder, ...overrides.configuration.finder },
            };
      return {
        ...result,
        stderr: evidenceLines(world, "low", { request: overrides.request, configuration }) + stepLine(1000),
      };
    };
    expect(await run(world, "low-247-r1")).toBe(3);
    const record = readSeries(world.out).find((line) => line.type === "record");
    expect(record).toMatchObject({ outcome: "measurement-error", errorClass });
  });

  it("a valid exit without request evidence is a measurement error", async () => {
    world.cli = (args) => ({ ...validCli(world, args), stderr: stepLine(1000) });
    expect(await run(world, "low-247-r1")).toBe(3);
    expect(readSeries(world.out).find((line) => line.type === "record").errorClass).toBe("no-resolved-configuration");
  });

  it("writes `started` before the paid call", async () => {
    world.cli = (args) => {
      expect(readSeries(world.out).map((line) => line.type)).toEqual(["t0", "started"]);
      return validCli(world, args);
    };
    expect(await run(world, "low-247-r1")).toBe(0);
    expect(readSeries(world.out)[1]).toMatchObject({
      runId: "low-247-r1",
      arm: "low",
      pr: "247",
      requestedEffort: "low",
    });
  });
});

describe("reasoning-volume anomaly flag", () => {
  it.each([
    ["low", 3_604, false],
    ["low", 3_605, true],
    ["medium", 9_011, false],
    ["medium", 9_012, true],
  ])("%s with %i reasoning tokens flagged: %s", (arm, reasoningTokens, flagged) => {
    expect(effortFlags([{ step: 2, reasoningTokens }], arm).length > 0).toBe(flagged);
  });

  it("a missing count is flagged, never read as zero; a reported zero is not", () => {
    expect(effortFlags([{ step: 1, reasoningTokens: null }], "low")).toEqual([
      { step: 1, reason: "missing-reasoning-count" },
    ]);
    expect(effortFlags([{ step: 1, reasoningTokens: 0 }], "low")).toEqual([]);
  });

  it("a flagged run stops the series until the owner acknowledges it", async () => {
    world.reasoning = 3_605;
    expect(await runAndSettle(world, "low-247-r1")).toBe(0);
    expect(world.logs.at(-2)).toContain("EFFORT FLAG on step(s) 1 (above-reference)");
    const record = readSeries(world.out).find((line) => line.type === "record");
    expect(record.effortFlag).toEqual([
      { step: 1, reason: "above-reference", reasoningTokens: 3_605, threshold: 3_277 * 1.1 },
    ]);
    world.reasoning = 1_000;
    world.cliCalls.length = 0;
    expect(await run(world, "medium-247-r1")).toBe(2);
    expect(world.logs.at(-1)).toContain("REFUSED (owner stop pending): run(s) low-247-r1");
    expect(world.cliCalls).toHaveLength(0);
    expect(await ack(world, "low-247-r1")).toBe(0);
    expect(await run(world, "medium-247-r1")).toBe(0);
  });

  it("a missing reasoning count is recorded as null plus a flag", async () => {
    world.reasoning = null;
    expect(await run(world, "low-247-r1")).toBe(0);
    const record = readSeries(world.out).find((line) => line.type === "record");
    expect(record.finderSteps[0].reasoningTokens).toBeNull();
    expect(record.effortFlag).toEqual([{ step: 1, reason: "missing-reasoning-count" }]);
  });

  it("ack refuses a run with nothing to acknowledge", async () => {
    expect(await runAndSettle(world, "low-247-r1")).toBe(0);
    expect(await ack(world, "low-247-r1")).toBe(2);
    expect(world.logs.at(-1)).toContain("REFUSED (nothing to acknowledge): low-247-r1");
  });
});

describe("cost reconciliation", () => {
  it("partial telemetry after a retry and a lagging counter leave spend unresolved and block the next run", async () => {
    // The judge failed after the finder's retry: only the finder's cost is reported,
    // and the counter has not yet caught up with what was spent.
    world.cli = () => {
      world.counter += 0.04; // lagging: the finder alone reported $0.10
      return {
        exitCode: 1,
        signal: null,
        stdout: "",
        stderr: `${evidenceLines(world, "low")}${stepLine(1000)}retrying judge after APICallError in 1000ms\nNo output generated.\n`,
      };
    };
    expect(await run(world, "low-247-r1")).toBe(1);
    expect(await ack(world, "low-247-r1")).toBe(0);
    // Partial telemetry is simulated on the record the way a judge failure leaves it.
    const lines = readSeries(world.out);
    const record = lines.find((line) => line.type === "record");
    record.cost = { finder: 0.1, judge: null, total: null, costSource: "partial" };
    writeFileSync(world.out, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);

    expect(await reconcile(world, "low-247-r1")).toBe(1);
    expect(readSeries(world.out).at(-1)).toMatchObject({ type: "reconcile", status: "unsettled" });

    world.cliCalls.length = 0;
    expect(await run(world, "medium-247-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain("REFUSED (unsettled spend): run(s) low-247-r1");

    // The counter catches up; the settled cost is the counter delta, once.
    world.counter = 10 + 0.13;
    expect(await reconcile(world, "low-247-r1")).toBe(0);
    expect(readSeries(world.out).at(-1)).toMatchObject({ status: "settled", costSource: "counter" });
    expect(readSeries(world.out).at(-1).cost).toBeCloseTo(0.13, 9);
    world.cli = (args) => validCli(world, args);
    expect(await run(world, "medium-247-r1")).toBe(0);
  });

  it("uses cumulative series totals without counting telemetry and counter twice", async () => {
    for (const runId of ["low-247-r1", "medium-247-r1", "medium-269-r1", "low-269-r1"]) {
      expect(await runAndSettle(world, runId)).toBe(0);
    }
    // Four runs at $0.12 each: T must be $0.48 (not $0.96), and P for medium-247-r2 is 2 × $0.12.
    expect(await run(world, "medium-247-r2")).toBe(0);
    const started = readSeries(world.out)
      .filter((line) => line.type === "started")
      .at(-1);
    expect(started.budget.t).toBeCloseTo(0.48, 9);
    expect(started.budget.p).toBeCloseTo(0.24, 9);
  });

  it("complete telemetry below the settled counter delta is unexplained, until the owner resolves it", async () => {
    world.cli = (args) => {
      const result = validCli(world, args);
      world.counter += 0.3; // spend the telemetry does not account for
      return result;
    };
    expect(await run(world, "low-247-r1")).toBe(0);
    expect(await reconcile(world, "low-247-r1")).toBe(1);
    expect(readSeries(world.out).at(-1).status).toBe("unexplained");
    world.cli = (args) => validCli(world, args);
    expect(await run(world, "medium-247-r1")).toBe(2);
    expect(
      await main(
        ["resolve", "--run-id", "low-247-r1", "--out", world.out, "--cost", "0.42", "--reason", "owner: other key use"],
        world.deps,
      ),
    ).toBe(0);
    expect(await run(world, "medium-247-r1")).toBe(0);
  });
});

describe("settlement evidence", () => {
  const failedCli = () => ({
    exitCode: 1,
    signal: null,
    stdout: "",
    stderr: `${evidenceLines(world, "low")}No output generated. Check the stream for errors.\n`,
  });

  it("a re-read under 180 s is not settlement: a shorter, non-positive or non-numeric interval is refused", async () => {
    expect(await run(world, "low-247-r1")).toBe(0);
    for (const interval of ["0", "-5", "abc", "0.001", "179"]) {
      expect(await reconcile(world, "low-247-r1", interval)).toBe(2);
      expect(world.logs.at(-1)).toContain("REFUSED (bad settle-seconds)");
    }
    expect(readSeries(world.out).some((line) => line.type === "reconcile")).toBe(false);
    expect(world.sleeps).toEqual([]);
    // The default keeps the two readings 180 s apart.
    expect(await reconcile(world, "low-247-r1")).toBe(0);
    expect(world.sleeps).toEqual([180_000]);
  });

  it("an explicit interval of exactly 180 s is accepted", async () => {
    expect(await run(world, "low-247-r1")).toBe(0);
    expect(await reconcile(world, "low-247-r1", "180")).toBe(0);
    expect(world.sleeps).toEqual([180_000]);
  });

  it("a failed run with no telemetry and an unmoved counter stays unresolved until the owner resolves it", async () => {
    // The CLI died before review.json: no telemetry, and the counter shows nothing —
    // which is also what a lagging counter shows, so it is not proof the attempt was free.
    world.cli = failedCli;
    expect(await run(world, "low-247-r1")).toBe(1);
    expect(await ack(world, "low-247-r1")).toBe(0);
    const record = readSeries(world.out).find((line) => line.type === "record");
    expect(record.cost).toMatchObject({ total: null, costSource: "none" });

    expect(await reconcile(world, "low-247-r1")).toBe(1);
    expect(readSeries(world.out).at(-1)).toMatchObject({ type: "reconcile", status: "unsettled", delta: 0 });
    expect(readSeries(world.out).at(-1).cost).toBeUndefined();

    world.cliCalls.length = 0;
    expect(await run(world, "medium-247-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain("REFUSED (unsettled spend): run(s) low-247-r1");

    const resolve = [
      "resolve",
      "--run-id",
      "low-247-r1",
      "--out",
      world.out,
      "--cost",
      "0",
      "--reason",
      "owner: no model call",
    ];
    expect(await main(resolve, world.deps)).toBe(0);
    world.cli = (args) => validCli(world, args);
    expect(await run(world, "medium-247-r1")).toBe(0);
  });

  it("a failed run with no telemetry settles at the counter delta once the counter has moved", async () => {
    world.cli = () => {
      world.counter += 0.05;
      return failedCli();
    };
    expect(await run(world, "low-247-r1")).toBe(1);
    expect(await reconcile(world, "low-247-r1")).toBe(0);
    expect(readSeries(world.out).at(-1)).toMatchObject({ status: "settled", costSource: "counter" });
    expect(readSeries(world.out).at(-1).cost).toBeCloseTo(0.05, 9);
  });
});

describe("parseCliLog", () => {
  it("reads tokens incl. reasoning, provider and finish per finder step, retries, requests and configuration", () => {
    const log = [
      'resolved configuration: {"finder":{"reasoningEffort":"low"}}',
      'finder request: {"model":"m","reasoning":{"effort":"low"},"max_tokens":16384}',
      "finder step 1: getFileContext src/a.ts:1-20 (tokens in=10 out=5 reasoning=3 total=15) provider=Anthropic finish=tool-calls",
      "retrying finder after TimeoutError in 2000ms",
      'finder request: {"model":"m","reasoning":{"effort":"low"},"max_tokens":16384}',
      "finder step 2: no getFileContext call (tokens in=? out=? reasoning=? total=?) provider=? finish=stop",
      "finder step 3: no getFileContext call (tokens in=4 out=16384 reasoning=0 total=16388) provider=Anthropic finish=length",
      "retrying judge after APICallError in 1000ms",
    ].join("\n");
    const parsed = parseCliLog(log);
    expect(parsed.steps).toEqual([
      { step: 1, inputTokens: 10, outputTokens: 5, reasoningTokens: 3, provider: "Anthropic", finish: "tool-calls" },
      { step: 2, inputTokens: null, outputTokens: null, reasoningTokens: null, provider: "?", finish: "stop" },
      { step: 3, inputTokens: 4, outputTokens: 16_384, reasoningTokens: 0, provider: "Anthropic", finish: "length" },
    ]);
    expect(parsed.retries).toEqual({ finder: 1, judge: 1 });
    expect(parsed.requests).toHaveLength(2);
    expect(parsed.requests[0]).toEqual({ model: "m", reasoning: { effort: "low" }, max_tokens: 16_384 });
    expect(parsed.configuration).toEqual({ finder: { reasoningEffort: "low" } });
  });

  it("reports no configuration as null, and an unparseable line as such", () => {
    const parsed = parseCliLog("finder request: {not json\n");
    expect(parsed.configuration).toBeNull();
    expect(parsed.requests).toEqual([{ unparseable: "{not json" }]);
  });
});

describe("spawnReviewCli", () => {
  it("runs the command with the given args, cwd and env, and captures its output", async () => {
    const fake = join(world.dir, "fake-cli.mjs");
    writeFileSync(
      fake,
      "console.log(JSON.stringify({ args: process.argv.slice(2), title: process.env.PR_TITLE }));\nconsole.error('err line');\nprocess.exitCode = 1;\n",
    );
    const result = await spawnReviewCli([process.execPath, fake])(["--diff-file", "d"], { PR_TITLE: "t" }, world.dir);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ args: ["--diff-file", "d"], title: "t" });
    expect(result.stderr).toBe("err line\n");
  });
});
