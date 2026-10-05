// Measurement runner for change `finder-sonnet` (plan Phase 1 §6).
//
// Runs ONE sealed measurement run through the production entry point
// (`npm run review`, the same arguments action.yml passes, no plan file) and
// records it in an append-only JSONL series whether it succeeds, fails or is
// interrupted — a guard that only exists on success cannot detect failure
// (lessons.md). Every refusal happens BEFORE the paid call.
//
// Subcommands (run with tsx — the runner imports the package's TS sources so
// the configuration it checks is resolved by the same code the CLI runs):
//
//   describe   Print the global manifest of the current tree: code hashes, the
//              src git tree, the finder wire-schema sha256 and the effective
//              configuration. No network. Phase 2 seals this output.
//   t0         Read the OpenRouter key counter once and record it as T0.
//   run        One measurement run (--run-id <pr>-r<k> --diff --rules
//              --source-root --pr-meta --out --manifest).
//   reconcile  Re-read the counter twice, --settle-seconds apart, and settle
//              (or refuse to settle) the last run's cost.
//   resolve    Record the OWNER's attribution for a run whose cost could not be
//              settled (--cost <usd> --reason <text>). Never automatic.
//
// Exit codes (`run`): 0 valid run, 1 invalid run, 3 measurement error, 2 usage
// error or refusal — 2 always means nothing was spent. Every exit prints one
// line naming the state, the subject and the way out.
//
// Usage:
//   ./node_modules/.bin/tsx scripts/sonnet-gate.mjs describe
//   ./node_modules/.bin/tsx scripts/sonnet-gate.mjs run --run-id 247-r1 \
//     --diff <247.diff> --rules <247.rules.md> --source-root <worktree> \
//     --pr-meta <247.meta.json> --out <gate-sonnet-runs.jsonl> --manifest <manifest.json>
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

import { DEFAULT_FINDER_MAX_STEPS } from "../src/cli.js";
import { resolveFinderProviderRouting, resolveModels, resolveProviderRouting } from "../src/config.js";
import { tolerantReviewOutput } from "../src/output-repair.js";

export const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The code under test, hashed into the seal (plan § Critical Implementation Details). */
export const SEALED_CODE_FILES = [
  "src/config.ts",
  "src/reviewer.ts",
  "src/prompts.ts",
  "src/schemas.ts",
  "scripts/sonnet-gate.mjs",
];

/**
 * How the runner and the child CLI see configuration: `npm run review` runs
 * `tsx --env-file-if-exists=.env`, and Node's --env-file never overrides a
 * variable already in the environment. So inherited environment wins, then the
 * package's .env, then the code defaults — and the runner hands the child the
 * merged result, so the CLI cannot resolve anything the pre-flight did not see.
 */
export const ENV_POLICY = "inherited environment > packages/code-reviewer/.env > code defaults";

/** Environment variables that change what a run measures; recorded raw in the effective configuration. */
const BEHAVIOUR_ENV = [
  "REVIEW_FINDER_MAX_STEPS",
  "REVIEW_FINDER_TIMEOUT_MS",
  "REVIEW_JUDGE_TIMEOUT_MS",
  "REVIEW_IMPL_REVIEW_TIMEOUT_MS",
  "OPENROUTER_REQUIRE_PARAMETERS",
];

const RUN_ID = /^(\d+)-r([1-9]\d*)$/u;
const KEY_URL = "https://openrouter.ai/api/v1/key";

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

// --- Effective configuration ---------------------------------------------------

/** Inherited env over the package .env, exactly as `tsx --env-file-if-exists` merges them. */
export function loadEffectiveEnv(inherited, envFile) {
  const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
  return { ...fromFile, ...inherited };
}

/**
 * Resolves the configuration with the package's own resolvers under `env`.
 * They read process.env, so it is swapped for the call and always restored.
 */
export function resolveEffectiveConfig(env) {
  const saved = process.env;
  process.env = { ...env };
  try {
    const models = resolveModels();
    const rawSteps = env.REVIEW_FINDER_MAX_STEPS;
    return {
      finderModel: models.reviewModel,
      judgeModel: models.judgeModel,
      finderRouting: resolveFinderProviderRouting(),
      judgeRouting: resolveProviderRouting() ?? null,
      finderMaxSteps: rawSteps ? Number(rawSteps) : DEFAULT_FINDER_MAX_STEPS,
      behaviourEnv: Object.fromEntries(BEHAVIOUR_ENV.map((name) => [name, env[name] ?? null])),
      envPolicy: ENV_POLICY,
    };
  } finally {
    process.env = saved;
  }
}

// --- Global manifest -----------------------------------------------------------

export const realGit = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/**
 * Uncommitted changes under the package's src, as `git status --porcelain` lines.
 * `:(top)` anchors the pathspec at the repo root: git runs from the package
 * directory, where a plain `packages/code-reviewer/src` names a nonexistent
 * nested path and always reports clean.
 */
export const uncommittedSrc = (git, packageDir) =>
  git(["status", "--porcelain", "--", ":(top)packages/code-reviewer/src"], packageDir);

/** Everything the seal pins about the code and its configuration. No network. */
export async function describeGlobal(deps) {
  const codeHashes = Object.fromEntries(
    SEALED_CODE_FILES.map((file) => [file, sha256(readFileSync(join(deps.packageDir, file)))]),
  );
  const srcTree = deps.git(["rev-parse", "HEAD:packages/code-reviewer/src"], deps.packageDir);
  const wireSchemaSha256 = sha256(JSON.stringify(await tolerantReviewOutput().responseFormat));
  const effectiveConfig = resolveEffectiveConfig(loadEffectiveEnv(deps.env, deps.envFile));
  return { codeHashes, srcTree, wireSchemaSha256, effectiveConfig };
}

/** The first path where two JSON values differ, or undefined when equal. */
export function firstDifference(sealed, current, path = "") {
  if (typeof sealed !== "object" || sealed === null || typeof current !== "object" || current === null) {
    return Object.is(sealed, current) ? undefined : path || "(root)";
  }
  const keys = new Set([...Object.keys(sealed), ...Object.keys(current)]);
  for (const key of [...keys].sort()) {
    const diff = firstDifference(sealed[key], current[key], path ? `${path}.${key}` : key);
    if (diff !== undefined) return diff;
  }
  return undefined;
}

// --- Series ----------------------------------------------------------------------

export function readSeries(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

const appendLine = (path, entry) => {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`);
};

/** A run's settled cost, or undefined while it is unsettled or unresolved. */
function settledCost(series, runId) {
  const terminal = series.filter(
    (line) =>
      line.runId === runId && ((line.type === "reconcile" && line.status === "settled") || line.type === "resolution"),
  );
  return terminal.at(-1)?.cost;
}

/**
 * The spend state of the series. T = max(counter − T0, Σ settled run costs):
 * each run's settled cost IS its counter delta (telemetry only cross-checks
 * it), so the two terms never add telemetry and counter for the same run.
 */
export function seriesSpend(series, counterNow) {
  const t0 = series.find((line) => line.type === "t0");
  const started = series.filter((line) => line.type === "started").map((line) => line.runId);
  const unsettled = started.filter((runId) => settledCost(series, runId) === undefined);
  const settledTotal = started.reduce((sum, runId) => sum + (settledCost(series, runId) ?? 0), 0);
  const counterDelta = t0 === undefined || counterNow === undefined ? undefined : counterNow - t0.counter;
  const t = counterDelta === undefined ? undefined : Math.max(counterDelta, settledTotal);
  return { t0, unsettled, settledTotal, counterDelta, t };
}

/** P: the conservative estimate for the next run on `pr` (Definitions row P). */
export function nextRunEstimate(series, manifest, pr) {
  const costs = series
    .filter((line) => line.type === "started" && line.pr === pr)
    .map((line) => settledCost(series, line.runId))
    .filter((cost) => cost !== undefined);
  return costs.length === 0 ? manifest.budget.firstRunEstimate[pr] : 2 * Math.max(...costs);
}

// --- Log parsing -------------------------------------------------------------------

const STEP_LINE = /^finder step (\d+): .* provider=(\S+) finish=(\S+)$/u;
const RETRY_LINE = /^retrying (\S+) after (\S+)/u;

/** Finder steps (provider + finish) and retries per pass, out of the CLI's stderr. */
export function parseCliLog(stderr) {
  const steps = [];
  const retries = {};
  for (const line of stderr.split("\n")) {
    const step = STEP_LINE.exec(line);
    if (step) steps.push({ step: Number(step[1]), provider: step[2], finish: step[3] });
    const retry = RETRY_LINE.exec(line);
    if (retry) retries[retry[1]] = (retries[retry[1]] ?? 0) + 1;
  }
  return { steps, retries };
}

// An OpenRouter auth or credit failure, or a missing key: the instrument
// failed, not the model. Matched on the CLI's own error text.
const MEASUREMENT_ERROR =
  /\b(401|402)\b|Unauthorized|Payment Required|Insufficient credits|insufficient_quota|User not found|No auth credentials|OPENROUTER_API_KEY is missing/iu;

/**
 * valid / invalid / measurement error, from what the CLI left behind. A run
 * is valid only with a parsed review.json carrying finder and judge output.
 */
export function classifyRun({ exitCode, signal, stderr, review, sealedFinderModel, interrupted }) {
  if (interrupted) return { outcome: "invalid", errorClass: "interrupted" };
  if (MEASUREMENT_ERROR.test(stderr)) return { outcome: "measurement-error", errorClass: "openrouter-auth-or-credit" };
  if (signal !== null || (exitCode !== 0 && exitCode !== 1)) {
    return {
      outcome: "measurement-error",
      errorClass: `cli-crash(exit=${String(exitCode)}, signal=${String(signal)})`,
    };
  }
  if (exitCode !== 0 || review === undefined) {
    return { outcome: "invalid", errorClass: exitCode === 0 ? "no-review-json" : "model-attributable" };
  }
  if (review.models?.finder !== sealedFinderModel) {
    return { outcome: "measurement-error", errorClass: `finder-model-mismatch(${String(review.models?.finder)})` };
  }
  // findings = the finder's output; scores + verdict = the judge's.
  if (!Array.isArray(review.findings) || typeof review.verdict !== "string" || review.scores === undefined) {
    return { outcome: "invalid", errorClass: "incomplete-review-json" };
  }
  return { outcome: "valid", errorClass: null };
}

// --- Counter -----------------------------------------------------------------------

/** The key's cumulative USD usage from GET /api/v1/key. Free; no model call. */
export async function readKeyCounter(apiKey, fetchImpl = fetch) {
  const response = await fetchImpl(KEY_URL, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(`GET ${KEY_URL} returned HTTP ${String(response.status)}`);
  const body = await response.json();
  const usage = body?.data?.usage;
  if (typeof usage !== "number") throw new Error(`GET ${KEY_URL} carried no numeric data.usage`);
  return usage;
}

// --- Commands --------------------------------------------------------------------

class Refusal extends Error {}

const refuse = (state, subject, wayOut) => {
  throw new Refusal(`REFUSED (${state}): ${subject} — ${wayOut}. Nothing was spent.`);
};

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Refusal(`USAGE: unknown or valueless argument ${String(flag)} — see the header of sonnet-gate.mjs.`);
    }
    flags[flag.slice(2)] = value;
  }
  return flags;
}

const need = (flags, names) => {
  const missing = names.filter((name) => flags[name] === undefined);
  if (missing.length > 0) {
    throw new Refusal(`USAGE: missing --${missing.join(", --")} — see the header of sonnet-gate.mjs.`);
  }
};

function loadManifest(path) {
  if (!existsSync(path)) refuse("no manifest", path, "write the sealed manifest from gate.md first");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  if (!manifest.global || !manifest.inputs || !manifest.budget) {
    refuse("malformed manifest", path, "it needs global, inputs and budget sections");
  }
  return manifest;
}

/** The effective env with the API key, or a refusal that names the missing key. */
function effectiveEnvWithKey(deps) {
  const env = loadEffectiveEnv(deps.env, deps.envFile);
  if (!env.OPENROUTER_API_KEY) refuse("no API key", "OPENROUTER_API_KEY", "put it in packages/code-reviewer/.env");
  return env;
}

async function commandT0(flags, deps) {
  need(flags, ["out"]);
  const series = readSeries(flags.out);
  if (series.some((line) => line.type === "t0")) {
    refuse("T0 already recorded", flags.out, "T0 is read once per series and never re-read");
  }
  const env = effectiveEnvWithKey(deps);
  const counter = await deps.readCounter(env.OPENROUTER_API_KEY);
  appendLine(flags.out, { type: "t0", at: deps.now().toISOString(), counter });
  deps.log(`T0 RECORDED: key counter $${counter.toFixed(6)} → ${flags.out}`);
  return 0;
}

async function commandRun(flags, deps) {
  need(flags, ["run-id", "diff", "rules", "source-root", "pr-meta", "out", "manifest"]);
  const runId = flags["run-id"];
  const match = RUN_ID.exec(runId);
  if (!match) refuse("bad run-id", runId, "use <pr>-r<k>, e.g. 247-r1");
  const pr = match[1];
  const manifest = loadManifest(flags.manifest);
  const sealedInputs = manifest.inputs[pr];
  if (sealedInputs === undefined) refuse("PR not sealed", `PR #${pr}`, "only PRs in the manifest's inputs can run");
  const series = readSeries(flags.out);

  if (series.some((line) => line.runId === runId)) {
    refuse("run-id already used", runId, "a recorded or started run is never re-run; use the next run-id");
  }
  if (!series.some((line) => line.type === "t0")) refuse("no T0", flags.out, "record T0 with `t0` first");

  const dirty = uncommittedSrc(deps.git, deps.packageDir);
  if (dirty !== "") refuse("uncommitted src", "packages/code-reviewer/src", `commit or stash it first:\n${dirty}`);

  const inputs = {
    diff: sha256(readFileSync(flags.diff)),
    rules: sha256(readFileSync(flags.rules)),
    prMeta: sha256(readFileSync(flags["pr-meta"])),
    head: deps.git(["rev-parse", "HEAD"], flags["source-root"]),
  };
  const inputDiff = firstDifference(sealedInputs, inputs);
  if (inputDiff !== undefined) {
    refuse(
      "input differs from the seal",
      `PR #${pr} ${inputDiff}: sealed ${JSON.stringify(sealedInputs[inputDiff])}, now ${JSON.stringify(inputs[inputDiff])}`,
      "restore the frozen input, or amend the seal before this run",
    );
  }
  if (deps.git(["status", "--porcelain"], flags["source-root"]) !== "") {
    refuse("dirty source root", flags["source-root"], "the source root must be a clean worktree at the sealed head");
  }

  const global = await describeGlobal(deps);
  const globalDiff = firstDifference(manifest.global, global);
  if (globalDiff !== undefined) {
    refuse(
      "code or configuration differs from the seal",
      globalDiff,
      "undo the change, or record a dated, hashed amendment and reseal before this run",
    );
  }

  const env = effectiveEnvWithKey(deps);
  const counterBefore = await deps.readCounter(env.OPENROUTER_API_KEY);
  const spend = seriesSpend(series, counterBefore);
  if (spend.unsettled.length > 0) {
    refuse(
      "unsettled spend",
      `run(s) ${spend.unsettled.join(", ")}`,
      "run `reconcile` (or have the owner `resolve`) before another paid call",
    );
  }
  const p = nextRunEstimate(series, manifest, pr);
  const { total, reserve } = manifest.budget;
  const budget = { t: spend.t, p, reserve, total, fits: spend.t + p + reserve <= total };
  if (!budget.fits) {
    refuse(
      "INCOMPLETE (budget)",
      `T $${spend.t.toFixed(4)} + P $${p.toFixed(4)} + reserve $${reserve.toFixed(2)} > $${total.toFixed(2)}`,
      "the series stops here; no automatic increase",
    );
  }

  const meta = JSON.parse(readFileSync(flags["pr-meta"], "utf8"));
  const runDir = resolve(flags.artifacts ?? join(dirname(flags.out), "gate-runs", runId));
  mkdirSync(runDir, { recursive: true });
  const startedAt = deps.now();
  appendLine(flags.out, {
    type: "started",
    runId,
    pr,
    at: startedAt.toISOString(),
    counterBefore: { value: counterBefore, at: startedAt.toISOString() },
    budget,
  });

  const outDir = join(runDir, "review-out");
  const childEnv = { ...env, PR_TITLE: meta.title ?? "", PR_BODY: meta.body ?? "" };
  const args = [
    "--diff-file",
    resolve(flags.diff),
    "--out-dir",
    outDir,
    "--source-root",
    resolve(flags["source-root"]),
    "--project-context-file",
    resolve(flags.rules),
  ];
  const child = await deps.runCli(args, childEnv, deps.packageDir);
  writeFileSync(join(runDir, "stdout.log"), child.stdout);
  writeFileSync(join(runDir, "stderr.log"), child.stderr);
  const endedAt = deps.now();

  const reviewPath = join(outDir, "review.json");
  let review;
  if (existsSync(reviewPath)) {
    try {
      review = JSON.parse(readFileSync(reviewPath, "utf8"));
    } catch {
      review = undefined;
    }
  }
  const { steps, retries } = parseCliLog(child.stderr);
  const classification = classifyRun({
    exitCode: child.exitCode,
    signal: child.signal,
    stderr: child.stderr,
    review,
    sealedFinderModel: manifest.global.effectiveConfig.finderModel,
    interrupted: child.interrupted === true,
  });
  let counterAfter;
  try {
    counterAfter = { value: await deps.readCounter(env.OPENROUTER_API_KEY), at: deps.now().toISOString() };
  } catch (error) {
    counterAfter = { value: null, at: deps.now().toISOString(), error: String(error) };
  }

  const finderCost = review?.finderTelemetry?.cost ?? null;
  const judgeCost = review?.judgeTelemetry?.cost ?? null;
  const costSource =
    finderCost !== null && judgeCost !== null
      ? "telemetry"
      : finderCost !== null || judgeCost !== null
        ? "partial"
        : "none";
  const record = {
    type: "record",
    runId,
    pr,
    at: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    models: { finder: review?.models?.finder ?? null, judge: review?.models?.judge ?? null },
    routing: manifest.global.effectiveConfig.finderRouting,
    finderSteps: steps,
    retries,
    outcome: classification.outcome,
    errorClass: classification.errorClass,
    exitCode: child.exitCode,
    signal: child.signal,
    cost: {
      finder: finderCost,
      judge: judgeCost,
      total: costSource === "telemetry" ? finderCost + judgeCost : null,
      costSource,
    },
    counterBefore: { value: counterBefore, at: startedAt.toISOString() },
    counterAfter,
    reconciliation: "pending",
    findings: review?.findings ?? null,
    verdict: review?.verdict ?? null,
    inputs,
    codeHashes: global.codeHashes,
    srcTree: global.srcTree,
    wireSchemaSha256: global.wireSchemaSha256,
    artifacts: runDir,
  };
  appendLine(flags.out, record);

  const subject = `${runId} (exit ${String(child.exitCode)}, ${String(steps.length)} finder step(s), retries ${JSON.stringify(retries)})`;
  const settle = "then `reconcile` this run before any further paid call";
  if (classification.outcome === "valid") {
    deps.log(
      `VALID RUN: ${subject}, ${String(record.findings.length)} finding(s), verdict ${record.verdict} — ${settle}.`,
    );
    return 0;
  }
  if (classification.outcome === "invalid") {
    deps.log(
      `INVALID RUN (${classification.errorClass}): ${subject} — the reliability gate FAILS; report ${join(runDir, "stderr.log")} to the owner, ${settle}.`,
    );
    return 1;
  }
  deps.log(
    `MEASUREMENT ERROR (${classification.errorClass}): ${subject} — not a run result; stop, fix by amendment, read ${join(runDir, "stderr.log")}, ${settle}.`,
  );
  return 3;
}

/** Tolerance between a settled counter delta and complete telemetry. */
export const RECONCILE_TOLERANCE = (telemetry) => Math.max(0.005, telemetry * 0.02);

async function commandReconcile(flags, deps) {
  need(flags, ["run-id", "out"]);
  const runId = flags["run-id"];
  const series = readSeries(flags.out);
  const started = series.find((line) => line.type === "started" && line.runId === runId);
  if (started === undefined) refuse("no such run", runId, "reconcile a run-id the series started");
  if (settledCost(series, runId) !== undefined) refuse("already settled", runId, "nothing to reconcile");
  const record = series.find((line) => line.type === "record" && line.runId === runId);
  const env = effectiveEnvWithKey(deps);
  const settleSeconds = Number(flags["settle-seconds"] ?? 180);
  if (!Number.isFinite(settleSeconds) || settleSeconds <= 0) {
    refuse(
      "bad settle-seconds",
      String(flags["settle-seconds"]),
      "the two readings must be a positive number of seconds apart (default 180); an immediate re-read is not settlement evidence",
    );
  }

  const first = { value: await deps.readCounter(env.OPENROUTER_API_KEY), at: deps.now().toISOString() };
  await deps.sleep(settleSeconds * 1000);
  const second = { value: await deps.readCounter(env.OPENROUTER_API_KEY), at: deps.now().toISOString() };
  const delta = second.value - started.counterBefore.value;
  const telemetry = record?.cost?.total ?? null;
  const partial = (record?.cost?.finder ?? 0) + (record?.cost?.judge ?? 0);

  let status;
  let note;
  if (Math.abs(second.value - first.value) > 1e-9) {
    status = "unsettled";
    note = `counter still moving (${String(first.value)} → ${String(second.value)} over ${String(settleSeconds)}s)`;
  } else if (delta < partial - 1e-9 || (telemetry !== null && delta < telemetry - RECONCILE_TOLERANCE(telemetry))) {
    status = "unsettled";
    note = `counter delta $${delta.toFixed(6)} is below the telemetry $${(telemetry ?? partial).toFixed(6)}: still lagging`;
  } else if (telemetry !== null && delta - telemetry > RECONCILE_TOLERANCE(telemetry)) {
    status = "unexplained";
    note = `counter delta $${delta.toFixed(6)} exceeds complete telemetry $${telemetry.toFixed(6)}: other spend on the key, or an unreported attempt`;
  } else if (telemetry === null && partial <= 1e-9 && delta <= 1e-9) {
    // An unmoved counter is also what a lagging counter shows: with no telemetry
    // to corroborate it, nothing proves the attempt was free.
    status = "unsettled";
    note = `counter delta $${delta.toFixed(6)} with no telemetry (${record?.cost?.costSource ?? "no record"}): nothing shows the attempt was counted yet`;
  } else {
    status = "settled";
    note =
      telemetry === null
        ? `telemetry incomplete (${record?.cost?.costSource ?? "no record"}); cost is the settled counter delta`
        : "counter delta matches telemetry";
  }
  appendLine(flags.out, {
    type: "reconcile",
    runId,
    at: second.at,
    reads: [first, second],
    delta,
    telemetry,
    status,
    note,
    ...(status === "settled" ? { cost: delta, costSource: "counter" } : {}),
  });
  if (status === "settled") {
    deps.log(`SETTLED: ${runId} cost $${delta.toFixed(6)} (${note}).`);
    return 0;
  }
  deps.log(
    `${status.toUpperCase()}: ${runId} — ${note}. No further paid call until it settles: re-run \`reconcile\` later, or ask the owner to \`resolve\` it.`,
  );
  return 1;
}

async function commandResolve(flags, deps) {
  need(flags, ["run-id", "out", "cost", "reason"]);
  const runId = flags["run-id"];
  const series = readSeries(flags.out);
  if (!series.some((line) => line.type === "started" && line.runId === runId)) {
    refuse("no such run", runId, "resolve a run-id the series started");
  }
  const cost = Number(flags.cost);
  if (!Number.isFinite(cost) || cost < 0) refuse("bad cost", flags.cost, "give the owner's figure in USD");
  appendLine(flags.out, {
    type: "resolution",
    runId,
    at: deps.now().toISOString(),
    cost,
    reason: flags.reason,
    by: "owner",
  });
  deps.log(`RESOLVED BY OWNER: ${runId} at $${cost.toFixed(6)} (${flags.reason}).`);
  return 0;
}

/** Entry point with injectable dependencies; the tests drive this with a fake CLI. */
export async function main(argv, deps) {
  try {
    const [command, ...rest] = argv;
    if (command === "describe") {
      deps.log(JSON.stringify(await describeGlobal(deps), null, 2));
      return 0;
    }
    const flags = parseFlags(rest);
    if (command === "t0") return await commandT0(flags, deps);
    if (command === "run") return await commandRun(flags, deps);
    if (command === "reconcile") return await commandReconcile(flags, deps);
    if (command === "resolve") return await commandResolve(flags, deps);
    throw new Refusal(`USAGE: unknown command ${String(command)} — one of describe, t0, run, reconcile, resolve.`);
  } catch (error) {
    if (error instanceof Refusal) {
      deps.log(error.message);
      return 2;
    }
    throw error;
  }
}

/** Runs `npm run review -- <args>`; SIGINT kills the child and marks the run interrupted. */
export function spawnReviewCli(command = ["npm", "run", "review", "--"]) {
  return (args, env, cwd) =>
    new Promise((resolvePromise) => {
      const child = spawn(command[0], [...command.slice(1), ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let interrupted = false;
      const onInterrupt = () => {
        interrupted = true;
        child.kill("SIGINT");
      };
      process.once("SIGINT", onInterrupt);
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        process.stdout.write(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
        process.stderr.write(chunk);
      });
      child.on("close", (exitCode, signal) => {
        process.removeListener("SIGINT", onInterrupt);
        resolvePromise({ exitCode, signal, stdout, stderr, interrupted });
      });
    });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await main(process.argv.slice(2), {
    packageDir: PACKAGE_DIR,
    envFile: join(PACKAGE_DIR, ".env"),
    env: process.env,
    git: realGit,
    readCounter: (apiKey) => readKeyCounter(apiKey),
    runCli: spawnReviewCli(),
    now: () => new Date(),
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    log: (message) => {
      console.log(message);
    },
  });
}
