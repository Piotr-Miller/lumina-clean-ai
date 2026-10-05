// Hermetic tests for the finder-sonnet measurement runner: every refusal must
// fire BEFORE the paid call, and every run — valid, invalid, failed — must
// leave a record. A fake CLI and a fake key counter; no network, no API spend.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { describeGlobal, main, PACKAGE_DIR, parseCliLog, readSeries, spawnReviewCli } from "./sonnet-gate.mjs";

const HEADS = { 247: "dec09f8aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 269: "fca2778bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };

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
    logs: [],
    cliCalls: [],
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
      if (key === "status --porcelain -- packages/code-reviewer/src") return world.dirtySrc ? " M src/x.ts" : "";
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
    sleep: () => Promise.resolve(),
    log: (message) => {
      world.logs.push(message);
    },
  };
  return world;
}

const outDirOf = (args) => args[args.indexOf("--out-dir") + 1];

const REVIEW = {
  findings: [{ id: "F1", file: "a.ts", severity: "minor" }],
  scores: { correctness: 4 },
  verdict: "passed",
  models: { finder: "anthropic/claude-sonnet-5", judge: "anthropic/claude-sonnet-5" },
  finderTelemetry: { cost: 0.1 },
  judgeTelemetry: { cost: 0.02 },
};

/** A clean run: spends $0.12 on the counter and writes review.json. */
function validCli(world, args, review = REVIEW) {
  world.counter += 0.12;
  mkdirSync(outDirOf(args), { recursive: true });
  writeFileSync(join(outDirOf(args), "review.json"), JSON.stringify(review));
  return {
    exitCode: 0,
    signal: null,
    stdout: "verdict=passed",
    stderr: "finder step 1: no getFileContext call (tokens in=1 out=2 total=3) provider=Anthropic finish=stop\n",
  };
}

async function seal(world) {
  const global = await describeGlobal(world.deps);
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
  writeFileSync(
    world.manifestPath,
    JSON.stringify({ global, inputs, budget: { total: 3, reserve: 0.5, firstRunEstimate: { 247: 0.33, 269: 0.73 } } }),
  );
}

const run = (world, runId) => {
  const pr = runId.split("-")[0];
  const f = world.files[pr];
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

const reconcile = (world, runId) =>
  main(["reconcile", "--run-id", runId, "--out", world.out, "--settle-seconds", "0"], world.deps);

let world;
beforeEach(async () => {
  world = makeWorld();
  await seal(world);
  await main(["t0", "--out", world.out], world.deps);
});

describe("refusals before the paid call", () => {
  it("a recorded run-id refuses", async () => {
    expect(await run(world, "247-r1")).toBe(0);
    expect(await reconcile(world, "247-r1")).toBe(0);
    world.cliCalls.length = 0;
    expect(await run(world, "247-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain("REFUSED (run-id already used): 247-r1");
  });

  it("a started-but-unrecorded run-id refuses too", async () => {
    world.cli = () => {
      throw new Error("runner killed mid-run");
    };
    await expect(run(world, "247-r1")).rejects.toThrow("runner killed");
    world.cli = (args) => validCli(world, args);
    expect(await run(world, "247-r1")).toBe(2);
    expect(await run(world, "269-r1")).toBe(2);
    expect(world.logs.at(-1)).toContain("REFUSED (unsettled spend): run(s) 247-r1");
  });

  it("a dirty src refuses", async () => {
    world.dirtySrc = true;
    expect(await run(world, "247-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain("REFUSED (uncommitted src)");
  });

  it("each PR's distinct sealed inputs are accepted in the sealed order", async () => {
    for (const runId of ["247-r1", "269-r1", "247-r2"]) {
      expect(await run(world, runId)).toBe(0);
      expect(await reconcile(world, runId)).toBe(0);
    }
    expect(world.cliCalls).toHaveLength(3);
  });

  it.each(["247", "269"])("a changed input for PR %s is refused before the CLI starts", async (pr) => {
    writeFileSync(world.files[pr].diff, "a different diff\n");
    expect(await run(world, `${pr}-r1`)).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain(`REFUSED (input differs from the seal): PR #${pr} diff`);
  });

  it("an inherited model override prevents CLI execution", async () => {
    world.deps.env = { ...world.deps.env, OPENROUTER_REVIEW_MODEL: "z-ai/glm-4.6" };
    expect(await run(world, "247-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain("effectiveConfig.finderModel");
  });

  it("a model override in the package .env prevents CLI execution", async () => {
    writeFileSync(world.envFile, "OPENROUTER_JUDGE_MODEL=z-ai/glm-4.6\n");
    expect(await run(world, "247-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain("effectiveConfig.judgeModel");
  });

  it("the child receives the checked environment, so its .env cannot change the configuration", async () => {
    writeFileSync(world.envFile, "OPENROUTER_API_KEY=from-dotenv\nSOME_SETTING=x\n");
    expect(await run(world, "247-r1")).toBe(0);
    const { env } = world.cliCalls[0];
    expect(env.OPENROUTER_API_KEY).toBe("k"); // inherited wins, as Node's --env-file does
    expect(env.SOME_SETTING).toBe("x");
    expect(env.PR_TITLE).toBe("PR 247");
  });

  it("refuses when the next run does not fit the budget", async () => {
    world.counter = 10 + 2.3; // T = 2.30; 2.30 + 0.33 + 0.50 > 3.00
    expect(await run(world, "247-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain("REFUSED (INCOMPLETE (budget))");
  });
});

describe("run records", () => {
  it("a retry line counts one retry for its pass", async () => {
    world.cli = (args) => {
      const result = validCli(world, args);
      return { ...result, stderr: `${result.stderr}retrying finder after NoOutputGeneratedError in 1500ms\n` };
    };
    expect(await run(world, "247-r1")).toBe(0);
    const record = readSeries(world.out).find((line) => line.type === "record");
    expect(record.retries).toEqual({ finder: 1 });
    expect(record.finderSteps).toEqual([{ step: 1, provider: "Anthropic", finish: "stop" }]);
  });

  it("a run with no review.json is invalid, and still recorded", async () => {
    world.cli = () => {
      world.counter += 0.05;
      return { exitCode: 1, signal: null, stdout: "", stderr: "No output generated. Check the stream for errors.\n" };
    };
    expect(await run(world, "247-r1")).toBe(1);
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
    expect(await run(world, "247-r1")).toBe(3);
    const record = readSeries(world.out).find((line) => line.type === "record");
    expect(record.outcome).toBe("measurement-error");
    expect(world.logs.at(-1)).toMatch(/^MEASUREMENT ERROR \(openrouter-auth-or-credit\)/u);
  });

  it("writes `started` before the paid call", async () => {
    world.cli = (args) => {
      expect(readSeries(world.out).map((line) => line.type)).toEqual(["t0", "started"]);
      return validCli(world, args);
    };
    expect(await run(world, "247-r1")).toBe(0);
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
        stderr: "retrying judge after APICallError in 1000ms\nNo output generated.\n",
      };
    };
    expect(await run(world, "247-r1")).toBe(1);
    // Partial telemetry is simulated on the record the way a judge failure leaves it.
    const lines = readSeries(world.out);
    const record = lines.find((line) => line.type === "record");
    record.cost = { finder: 0.1, judge: null, total: null, costSource: "partial" };
    writeFileSync(world.out, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);

    expect(await reconcile(world, "247-r1")).toBe(1);
    expect(readSeries(world.out).at(-1)).toMatchObject({ type: "reconcile", status: "unsettled" });

    world.cliCalls.length = 0;
    expect(await run(world, "269-r1")).toBe(2);
    expect(world.cliCalls).toHaveLength(0);
    expect(world.logs.at(-1)).toContain("REFUSED (unsettled spend): run(s) 247-r1");

    // The counter catches up; the settled cost is the counter delta, once.
    world.counter = 10 + 0.13;
    expect(await reconcile(world, "247-r1")).toBe(0);
    expect(readSeries(world.out).at(-1)).toMatchObject({ status: "settled", costSource: "counter" });
    expect(readSeries(world.out).at(-1).cost).toBeCloseTo(0.13, 9);
    world.cli = (args) => validCli(world, args);
    expect(await run(world, "269-r1")).toBe(0);
  });

  it("uses cumulative series totals without counting telemetry and counter twice", async () => {
    expect(await run(world, "247-r1")).toBe(0);
    expect(await reconcile(world, "247-r1")).toBe(0);
    expect(await run(world, "269-r1")).toBe(0);
    expect(await reconcile(world, "269-r1")).toBe(0);
    // Two runs at $0.12 each: T must be $0.24 (not $0.48), and P for 247-r2 is 2 × $0.12.
    world.cliCalls.length = 0;
    expect(await run(world, "247-r2")).toBe(0);
    const started = readSeries(world.out)
      .filter((line) => line.type === "started")
      .at(-1);
    expect(started.budget.t).toBeCloseTo(0.24, 9);
    expect(started.budget.p).toBeCloseTo(0.24, 9);
  });

  it("complete telemetry below the settled counter delta is unexplained, until the owner resolves it", async () => {
    world.cli = (args) => {
      const result = validCli(world, args);
      world.counter += 0.3; // spend the telemetry does not account for
      return result;
    };
    expect(await run(world, "247-r1")).toBe(0);
    expect(await reconcile(world, "247-r1")).toBe(1);
    expect(readSeries(world.out).at(-1).status).toBe("unexplained");
    expect(await run(world, "269-r1")).toBe(2);
    expect(
      await main(
        ["resolve", "--run-id", "247-r1", "--out", world.out, "--cost", "0.42", "--reason", "owner: other key use"],
        world.deps,
      ),
    ).toBe(0);
    expect(await run(world, "269-r1")).toBe(0);
  });
});

describe("parseCliLog", () => {
  it("reads provider and finish per finder step, and retries per pass", () => {
    const log = [
      "finder step 1: getFileContext src/a.ts:1-20 (tokens in=10 out=5 total=15) provider=Anthropic finish=tool-calls",
      "retrying finder after TimeoutError in 2000ms",
      "finder step 2: no getFileContext call (tokens in=? out=? total=?) provider=? finish=stop",
      "retrying judge after APICallError in 1000ms",
    ].join("\n");
    expect(parseCliLog(log)).toEqual({
      steps: [
        { step: 1, provider: "Anthropic", finish: "tool-calls" },
        { step: 2, provider: "?", finish: "stop" },
      ],
      retries: { finder: 1, judge: 1 },
    });
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
