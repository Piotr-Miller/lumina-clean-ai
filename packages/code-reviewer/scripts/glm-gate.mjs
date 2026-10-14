// Measurement runner for change `finder-glm-5-3` (plan.md Phase 3 §1; A1). A
// thin layer over the PRODUCTION CLI: every run is `npm run review` with the
// arguments action.yml passes, and every paid step is admitted, recorded and
// settled in one append-only JSONL series — whether it succeeds, fails or is
// interrupted. Every refusal happens BEFORE anything is spent. The rules live
// in scripts/glm-gate-core.mjs; this file does the I/O.
//
// Subcommands (from packages/code-reviewer, plain `node`):
//   preflight [--manifest-only]        Free. T0 and glm-5.3 endpoint status, every input and
//                                      manifest hash, the forbidden environment. Writes a
//                                      `preflight` line. --manifest-only checks the sealed files only.
//   run --case clean|pr247|pr269 --run-id <id>
//                                      One production CLI run, in the sealed order, under admission.
//   g3 [--regrade]                     The 12-row promptfoo G3 step (or its one re-grade), under admission.
//   reconcile [--settle-seconds 180]   Two key-counter reads ≥ 180 s apart; settles the unsettled step,
//                                      or checks the whole series when none is unsettled.
//   continue --for probe|pause --note <text>
//                                      Records the owner's go-ahead: after the G2-01 probe, or at the
//                                      $3.00 pause.
//   outcome [--write] [--hand-read <json>]
//                                      The automatic outcome; --write puts it into gate.md § Results.
//   manifest                           Prints the manifest of the current tree (for the seal). Free.
//
// `--dry-run` (preflight, run): no key, no network, no manifest required; the
// CLI runs with scripts/glm-gate-dry-run-stub.mjs preloaded and the series is
// written under the cache, never into the change folder.
//
// Paths: series, results and g3-rows in context/changes/finder-glm-5-3/gate/;
// console logs and exports under ~/.cache/finder-glm-5-3/ (GLM_GATE_CACHE);
// frozen #247/#269 inputs under ~/.cache/finder-sonnet-gate/ (GLM_GATE_INPUTS).
// Nothing committed ever carries an absolute path.
//
// Exit codes: 0 done / valid run, 1 invalid run or a failed check, 2 refusal
// or usage (nothing spent), 5 a CONFIRMED OpenRouter 401/402 (the series stops
// INCOMPLETE (auth/credit); not a sample), 4 budget stop (nothing spent; the series ends
// INCOMPLETE (budget)). Every exit prints one line naming state, subject and way out.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

import { load } from "js-yaml";

import {
  admit,
  authCreditStopped,
  classifyRun,
  computeOutcome,
  EXPECTED_CONFIGURATION_LINE,
  forbiddenEnvSet,
  g3EvalArgs,
  parseCliStderr,
  probeProblems,
  reconcileTolerance,
  renderOutcome,
  runCost,
  RUN_CASES,
  scheduleState,
  seriesSpend,
  SETTLE_SECONDS,
  unsettledSteps,
} from "./glm-gate-core.mjs";
import { checkExport, describeSummary, exportRows } from "./promptfoo-gate-rows.mjs";
import { buildRegradeConfig, selectGraderErrorRows } from "./promptfoo-regrade-config.mjs";

export const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = resolve(PACKAGE_DIR, "..", "..");
const CHANGE = "context/changes/finder-glm-5-3";
const KEY_URL = "https://openrouter.ai/api/v1/key";
const ENDPOINTS_URL = "https://openrouter.ai/api/v1/models/z-ai/glm-5.3/endpoints";
const REGRADE_CONFIG = "evals/glm-5.3.regrade.json";
const OUTCOME_START = "<!-- glm-gate:outcome:start -->";
const OUTCOME_END = "<!-- glm-gate:outcome:end -->";

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const sha256File = (path) => sha256(readFileSync(path));

// --- Manifest -----------------------------------------------------------------------

/** Repo-relative files that are sealed (plan § Critical Implementation Details). */
const SEALED_FILES = [
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
];

const walk = (root, dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(root, path) : entry.isFile() ? [path] : [];
  });

/** Every sealed file of the tree at `repoRoot`, sorted: src (tests excluded), the fixtures, and SEALED_FILES. */
export function sealedFileList(repoRoot) {
  const src = walk(repoRoot, "packages/code-reviewer/src").filter(
    (path) => path.endsWith(".ts") && !path.endsWith(".test.ts"),
  );
  const fixtures = walk(repoRoot, "packages/code-reviewer/evals/fixtures");
  return [...new Set([...src, ...fixtures, ...SEALED_FILES])].sort();
}

/** The `files` map of the manifest for the tree at `repoRoot`. */
export const sealedFileHashes = (repoRoot) =>
  Object.fromEntries(sealedFileList(repoRoot).map((path) => [path, sha256File(join(repoRoot, path))]));

/** Where a case's inputs live. Clean is in the repository; #247/#269 are the frozen inputs. */
export function caseInputs(caseKey, { repoRoot, inputsDir }) {
  if (caseKey === "clean") {
    return {
      diff: join(repoRoot, "packages/code-reviewer/evals/fixtures/clean-change.diff"),
      rules: join(repoRoot, ".github/ai-review-rules.md"),
      meta: null,
      sourceRoot: join(repoRoot, "packages/code-reviewer/evals/fixtures/clean-change"),
      worktree: false,
    };
  }
  const pr = caseKey.slice(2);
  return {
    diff: join(inputsDir, pr, "pr.diff"),
    rules: join(inputsDir, pr, "rules.md"),
    meta: join(inputsDir, pr, "meta.json"),
    sourceRoot: join(inputsDir, `wt-${pr}`),
    worktree: true,
  };
}

/** A case's input fingerprint: sha256 of each file, and the frozen worktree's head. Throws on a missing input. */
export function inputFingerprint(caseKey, context) {
  const inputs = caseInputs(caseKey, context);
  const fingerprint = {
    diff: sha256File(inputs.diff),
    rules: sha256File(inputs.rules),
    meta: inputs.meta === null ? null : sha256File(inputs.meta),
  };
  if (inputs.worktree) {
    fingerprint.head = context.git(["rev-parse", "HEAD"], inputs.sourceRoot);
    fingerprint.clean = context.git(["status", "--porcelain"], inputs.sourceRoot) === "";
  }
  return fingerprint;
}

/** The manifest of the current tree: sealed file hashes, input fingerprints, the expected configuration line. */
export function describeManifest(context) {
  return {
    change: "finder-glm-5-3",
    files: sealedFileHashes(context.repoRoot),
    inputs: Object.fromEntries(RUN_CASES.map((caseKey) => [caseKey, inputFingerprint(caseKey, context)])),
    configurationLine: EXPECTED_CONFIGURATION_LINE,
  };
}

/** Every difference between the sealed manifest and the tree, as readable lines. Empty = matches. */
export function manifestMismatches(manifest, repoRoot) {
  const sealed = manifest?.files ?? {};
  const current = sealedFileHashes(repoRoot);
  const problems = [];
  for (const [path, hash] of Object.entries(sealed)) {
    if (current[path] === undefined) problems.push(`${path}: sealed, now missing`);
    else if (current[path] !== hash) problems.push(`${path}: content differs from the seal`);
  }
  for (const path of Object.keys(current)) if (sealed[path] === undefined) problems.push(`${path}: not in the seal`);
  if (manifest?.configurationLine !== EXPECTED_CONFIGURATION_LINE)
    problems.push("configurationLine differs from the seal");
  return problems;
}

/** Differences between the sealed inputs of the given cases and the frozen inputs on disk. */
export function inputMismatches(manifest, cases, context) {
  const problems = [];
  for (const caseKey of cases) {
    const sealed = manifest?.inputs?.[caseKey];
    if (sealed === undefined) {
      problems.push(`${caseKey}: no sealed inputs`);
      continue;
    }
    let now;
    try {
      now = inputFingerprint(caseKey, context);
    } catch (error) {
      problems.push(
        `${caseKey}: input unreadable (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`,
      );
      continue;
    }
    for (const key of Object.keys({ ...sealed, ...now })) {
      if (sealed[key] !== now[key])
        problems.push(`${caseKey}.${key}: sealed ${String(sealed[key])}, now ${String(now[key])}`);
    }
  }
  return problems;
}

// --- Series ---------------------------------------------------------------------------

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

// --- Effective environment ------------------------------------------------------------

/** Inherited env over the package .env, exactly as `tsx --env-file-if-exists` merges them. */
export function effectiveEnv(env, envFile) {
  const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
  return { ...fromFile, ...env };
}

// --- Commands ---------------------------------------------------------------------------

class Refusal extends Error {
  constructor(message, code = 2) {
    super(message);
    this.code = code;
  }
}

const refuse = (state, subject, wayOut) => {
  throw new Refusal(`REFUSED (${state}): ${subject} — ${wayOut}. Nothing was spent.`);
};

const BOOLEAN_FLAGS = new Set(["dry-run", "manifest-only", "regrade", "write"]);

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith("--"))
      throw new Refusal(`USAGE: unexpected argument ${flag} — see the header of glm-gate.mjs.`);
    const name = flag.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Refusal(`USAGE: --${name} needs a value — see the header of glm-gate.mjs.`);
    }
    flags[name] = value;
    i += 1;
  }
  return flags;
}

/** Resolved paths and context for one invocation. */
function contextFor(flags, deps) {
  const dryRun = flags["dry-run"] === true;
  const changeDir = join(deps.repoRoot, CHANGE);
  const cache = resolve(flags.cache ?? deps.env.GLM_GATE_CACHE ?? join(homedir(), ".cache", "finder-glm-5-3"));
  const base = dryRun ? join(cache, "dry-run") : join(changeDir, "gate");
  return {
    dryRun,
    repoRoot: deps.repoRoot,
    packageDir: deps.packageDir,
    git: deps.git,
    cache,
    inputsDir: resolve(flags.inputs ?? deps.env.GLM_GATE_INPUTS ?? join(homedir(), ".cache", "finder-sonnet-gate")),
    series: resolve(flags.series ?? join(base, "series.jsonl")),
    results: resolve(flags.results ?? join(base, "results")),
    g3Rows: resolve(flags["g3-rows"] ?? join(base, "g3-rows.json")),
    manifest: resolve(flags.manifest ?? join(changeDir, "gate-manifest.json")),
    gate: resolve(flags.gate ?? join(changeDir, "gate.md")),
  };
}

/** The sealed manifest, or a refusal. In a dry run a missing manifest is allowed and reported. */
function checkManifest(context, deps, { required }) {
  if (!existsSync(context.manifest)) {
    if (!required) {
      deps.log("NOTE: no gate-manifest.json yet (dry run) — the seal is not checked.");
      return undefined;
    }
    refuse(
      "no manifest",
      relative(context.repoRoot, context.manifest),
      "seal the gate (plan Phase 4) before any paid step",
    );
  }
  const manifest = JSON.parse(readFileSync(context.manifest, "utf8"));
  const problems = manifestMismatches(manifest, context.repoRoot);
  if (problems.length > 0) {
    refuse(
      "tree differs from the seal",
      problems.join("; "),
      "undo the change, or record a dated, hashed amendment and reseal before this step",
    );
  }
  return manifest;
}

function checkEnvironment(deps) {
  const set = forbiddenEnvSet(effectiveEnv(deps.env, deps.envFile));
  if (set.length > 0) {
    refuse(
      "environment overrides production defaults",
      set.join(", "),
      "unset them in the shell and in packages/code-reviewer/.env",
    );
  }
}

function apiKey(deps) {
  const key = effectiveEnv(deps.env, deps.envFile).OPENROUTER_API_KEY;
  if (!key) refuse("no API key", "OPENROUTER_API_KEY", "put it in packages/code-reviewer/.env");
  return key;
}

const counterNow = async (context, deps) => (context.dryRun ? 0 : deps.readCounter(apiKey(deps)));

async function commandPreflight(flags, deps) {
  const context = contextFor(flags, deps);
  if (flags["manifest-only"]) {
    if (!existsSync(context.manifest)) {
      refuse("no manifest", relative(context.repoRoot, context.manifest), "seal the gate first (plan Phase 4)");
    }
    const manifest = JSON.parse(readFileSync(context.manifest, "utf8"));
    const problems = manifestMismatches(manifest, context.repoRoot);
    if (problems.length > 0) {
      deps.log(`MANIFEST MISMATCH: ${String(problems.length)} difference(s) — ${problems.join("; ")}.`);
      return 1;
    }
    deps.log(`MANIFEST MATCHES: ${String(Object.keys(manifest.files).length)} sealed file(s) unchanged.`);
    return 0;
  }
  checkEnvironment(deps);
  const manifest = checkManifest(context, deps, { required: !context.dryRun });
  if (manifest !== undefined) {
    const problems = inputMismatches(manifest, RUN_CASES, context);
    if (problems.length > 0) refuse("inputs differ from the seal", problems.join("; "), "restore the frozen inputs");
  }
  const series = readSeries(context.series);
  let counter = 0;
  let endpoints = null;
  if (!context.dryRun) {
    const key = apiKey(deps);
    counter = await deps.readCounter(key);
    endpoints = await deps.readEndpoints(key);
  }
  const t0 = series.find((line) => line.type === "preflight");
  appendLine(context.series, {
    type: "preflight",
    at: deps.now().toISOString(),
    counter,
    endpoints,
    manifest: manifest === undefined ? "absent (dry run)" : "matches",
    dryRun: context.dryRun,
  });
  deps.log(
    `PREFLIGHT RECORDED: key counter $${counter.toFixed(6)}${t0 === undefined ? " (T0)" : ` (T0 stays $${t0.counter.toFixed(6)})`}` +
      `, manifest ${manifest === undefined ? "not checked (dry run)" : "matches"}, environment clean` +
      `${endpoints === null ? "" : `, endpoints ${JSON.stringify(endpoints)}`} → ${relative(context.repoRoot, context.series)}.`,
  );
  return 0;
}

/**
 * Admission for every paid step: no unsettled step, the $3.00 pause honoured,
 * T + P ≤ $3.50. A failed T + P test is recorded as a budget stop. Returns the
 * counter read and the admission record.
 */
async function admitStep(context, deps, series, kind) {
  const counter = await counterNow(context, deps);
  const decision = admit(series, kind, context.dryRun ? undefined : counter);
  if (decision.budgetStop) {
    appendLine(context.series, { type: "budget_stop", kind, at: deps.now().toISOString(), ...decision });
    throw new Refusal(
      `BUDGET STOP: ${kind} — T $${decision.t.toFixed(4)} + P $${decision.p.toFixed(4)} > cap $${decision.cap.toFixed(2)}; the series ends INCOMPLETE (budget). Nothing was spent.`,
      4,
    );
  }
  if (!decision.admit) refuse("not admitted", kind, decision.refusal);
  return { counter, decision };
}

const RUN_ID = /^[a-z0-9][a-z0-9-]*$/u;

async function commandRun(flags, deps) {
  const context = contextFor(flags, deps);
  const caseKey = flags.case;
  const requestedId = flags["run-id"];
  if (!RUN_CASES.includes(caseKey)) refuse("unknown case", String(caseKey), `use one of ${RUN_CASES.join(", ")}`);
  if (typeof requestedId !== "string" || !RUN_ID.test(requestedId)) {
    refuse("bad run-id", String(requestedId), "use lowercase letters, digits and dashes, e.g. pr269-01");
  }
  checkEnvironment(deps);
  const series = readSeries(context.series);
  const used = (id) => series.some((line) => line.stepId === id);
  // A paid run is never re-run or replaced. A dry run is a smoke test that must
  // stay re-runnable as written, so a reused id is recorded as `<id>-r<k>`.
  let stepId = requestedId;
  if (used(stepId)) {
    if (!context.dryRun) refuse("run-id already used", stepId, "a run is never re-run or replaced");
    let k = 2;
    while (used(`${requestedId}-r${String(k)}`)) k += 1;
    stepId = `${requestedId}-r${String(k)}`;
  }
  const manifest = checkManifest(context, deps, { required: !context.dryRun });
  if (!context.dryRun) {
    if (!series.some((line) => line.type === "preflight"))
      refuse("no preflight", stepId, "run `preflight` first (it records T0)");
    const state = scheduleState(series);
    if (state.next !== caseKey) {
      refuse(
        "out of the sealed order",
        `${stepId} (${caseKey})`,
        state.ended !== null
          ? `the series has ended: ${state.ended}`
          : (state.waitingFor ?? `the next step is ${String(state.next)}`),
      );
    }
  }
  if (manifest !== undefined) {
    const problems = inputMismatches(manifest, [caseKey], context);
    if (problems.length > 0) refuse("input differs from the seal", problems.join("; "), "restore the frozen input");
  }
  const inputs = caseInputs(caseKey, context);
  const { counter, decision } = await admitStep(context, deps, series, caseKey);

  const runDir = join(context.cache, context.dryRun ? "dry-run/runs" : "runs", stepId);
  const outDir = join(runDir, "review-out");
  mkdirSync(runDir, { recursive: true });
  const started = deps.now();
  appendLine(context.series, {
    type: "started",
    stepId,
    kind: caseKey,
    at: started.toISOString(),
    counterBefore: context.dryRun ? null : counter,
    admission: decision,
  });

  const meta = inputs.meta === null ? {} : JSON.parse(readFileSync(inputs.meta, "utf8"));
  const env = effectiveEnv(deps.env, deps.envFile);
  const childEnv = { ...env, PR_TITLE: meta.title ?? "", PR_BODY: meta.body ?? "" };
  if (context.dryRun) {
    childEnv.OPENROUTER_API_KEY = "dry-run-no-key";
    childEnv.NODE_OPTIONS =
      `${env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(join(deps.packageDir, "scripts/glm-gate-dry-run-stub.mjs")).href}`.trim();
    childEnv.GLM_GATE_DRY_RUN_FINDINGS = caseKey === "clean" ? "0" : "1";
  }
  const args = [
    "--diff-file",
    inputs.diff,
    "--out-dir",
    outDir,
    "--source-root",
    inputs.sourceRoot,
    "--project-context-file",
    inputs.rules,
  ];
  const child = await deps.runCli(args, childEnv, deps.packageDir);
  writeFileSync(join(runDir, "stdout.log"), child.stdout);
  writeFileSync(join(runDir, "stderr.log"), child.stderr);
  const ended = deps.now();

  const reviewPath = join(outDir, "review.json");
  let review;
  if (existsSync(reviewPath)) {
    try {
      review = JSON.parse(readFileSync(reviewPath, "utf8"));
    } catch {
      review = undefined;
    }
  }
  // An interrupted run is invalid whatever it left behind: the run did not finish on its own.
  const classification = child.interrupted
    ? {
        valid: false,
        artifact: null,
        reasons: ["interrupted"],
        requests: null,
        authCredit: null,
        log: parseCliStderr(child.stderr),
      }
    : classifyRun({ exitCode: child.exitCode, signal: child.signal, stderr: child.stderr, review });
  const cost = runCost(classification.artifact ? review : undefined, classification.log);
  let reviewSha256 = null;
  if (classification.artifact) {
    mkdirSync(context.results, { recursive: true });
    copyFileSync(reviewPath, join(context.results, `${stepId}.review.json`));
    reviewSha256 = sha256File(reviewPath);
  }
  const configurationOk = !classification.reasons.includes("configuration-mismatch");
  const record = {
    type: "record",
    stepId,
    kind: caseKey,
    at: ended.toISOString(),
    durationMs: ended.getTime() - started.getTime(),
    exitCode: child.exitCode,
    signal: child.signal ?? null,
    valid: classification.valid,
    artifact: classification.artifact,
    reasons: classification.reasons,
    // "confirmed" (a 401/402 on the CLI's status line) stops the series; "suspected" (text only) does not.
    authCredit: classification.authCredit,
    configurationOk,
    models: review?.models ?? null,
    verdict: classification.artifact ? review.verdict : null,
    findings: classification.artifact ? review.findings : null,
    requests: classification.requests ?? classification.log.steps,
    retries: classification.log.retries,
    cost,
    reviewSha256,
    consoleLog: `<cache>/${context.dryRun ? "dry-run/runs" : "runs"}/${stepId}`,
    dryRun: context.dryRun,
  };
  appendLine(context.series, record);
  if (cost.complete) {
    appendLine(context.series, {
      type: "settled",
      stepId,
      at: ended.toISOString(),
      cost: cost.total,
      source: "telemetry",
    });
  }

  if (record.authCredit === "confirmed") {
    deps.log(
      `AUTH/CREDIT STOP: ${stepId} (${caseKey}) — confirmed OpenRouter ${classification.log.apiStatuses.join("/")}; the series stops INCOMPLETE (auth/credit). Not a sample; its cost counts toward T (\`reconcile\` it). Resume only under a dated amendment recorded before further spending: \`continue --for auth-credit --amendment <ref> --note <text>\`.`,
    );
    return 5;
  }

  // G2-01 is the first clean SAMPLE: a run stopped by a confirmed 401/402 is not one.
  let probeNote = "";
  if (
    caseKey === "clean" &&
    readSeries(context.series).filter(
      (line) => line.type === "record" && line.kind === "clean" && !authCreditStopped(line),
    ).length === 1
  ) {
    const problems = probeProblems(record);
    appendLine(context.series, { type: "probe", stepId, at: ended.toISOString(), problems });
    probeNote =
      problems.length === 0
        ? " G2-01 PROBE OK — the owner confirms it with `continue --for probe` before G2-02."
        : ` G2-01 PROBE FAILED (${problems.join("; ")}) — STOP and ask the owner.`;
  }
  const settle = cost.complete ? "settled from telemetry" : "UNSETTLED — run `reconcile` before the next paid step";
  const subject = `${stepId} (${caseKey}, exit ${String(child.exitCode)}, ${String(record.requests.length)} finder request(s), ${settle})`;
  if (classification.valid) {
    deps.log(
      `VALID RUN: ${subject}, ${String(record.findings.length)} finding(s), verdict ${String(record.verdict)}.${probeNote}`,
    );
    return 0;
  }
  deps.log(
    `INVALID RUN (${classification.reasons.join(", ")}): ${subject} — see <cache>/${relative(context.cache, runDir)}/stderr.log.${probeNote}`,
  );
  return 1;
}

async function commandG3(flags, deps) {
  const context = contextFor(flags, deps);
  if (context.dryRun) refuse("no dry run for G3", "g3", "G3 calls promptfoo's grader; test it with the hermetic tests");
  const regrade = flags.regrade === true;
  const kind = regrade ? "regrade" : "g3";
  // Unique even when G3 runs again after an owner-resumed auth/credit stop.
  const base = regrade ? "g3-regrade" : "g3";
  const usedIds = new Set(readSeries(context.series).map((line) => line.stepId));
  let stepId = base;
  for (let k = 2; usedIds.has(stepId); k += 1) stepId = `${base}-r${String(k)}`;
  checkEnvironment(deps);
  const series = readSeries(context.series);
  checkManifest(context, deps, { required: true });
  if (!series.some((line) => line.type === "preflight"))
    refuse("no preflight", stepId, "run `preflight` first (it records T0)");
  const state = scheduleState(series);
  if (state.next !== kind) {
    refuse(
      "out of the sealed order",
      stepId,
      state.ended !== null
        ? `the series has ended: ${state.ended}`
        : (state.waitingFor ?? `the next step is ${String(state.next)}`),
    );
  }
  const { counter, decision } = await admitStep(context, deps, series, kind);
  const g3Dir = join(context.cache, "g3");
  mkdirSync(g3Dir, { recursive: true });
  const exportPath = join(g3Dir, "g3.export.json");
  const regradeExport = join(g3Dir, "g3-regrade.export.json");
  appendLine(context.series, {
    type: "started",
    stepId,
    kind,
    at: deps.now().toISOString(),
    counterBefore: counter,
    admission: decision,
  });

  let child;
  if (!regrade) {
    child = await deps.runCommand("npm", g3EvalArgs(exportPath), effectiveEnv(deps.env, deps.envFile), deps.packageDir);
  } else {
    const original = JSON.parse(readFileSync(exportPath, "utf8"));
    const config = buildRegradeConfig(
      load(readFileSync(join(deps.packageDir, "evals/promptfooconfig.yaml"), "utf8")),
      selectGraderErrorRows(exportRows(original)),
      { exportPath: "<cache>/g3/g3.export.json" },
    );
    writeFileSync(join(deps.packageDir, REGRADE_CONFIG), `${JSON.stringify(config, null, 2)}\n`);
    child = await deps.runCommand(
      "npx",
      ["promptfoo", "eval", "-c", REGRADE_CONFIG, "--env-file", ".env", "-j", "1", "--no-cache", "-o", regradeExport],
      effectiveEnv(deps.env, deps.envFile),
      deps.packageDir,
    );
  }
  writeFileSync(join(g3Dir, `${stepId}.stdout.log`), child.stdout);
  writeFileSync(join(g3Dir, `${stepId}.stderr.log`), child.stderr);

  let checked;
  try {
    const read = (path) => JSON.parse(readFileSync(path, "utf8"));
    checked = checkExport(read(exportPath), regrade ? read(regradeExport) : undefined);
  } catch (error) {
    checked = {
      rows: [],
      summary: {
        failedRun: true,
        problems: [`no usable export: ${error instanceof Error ? error.message : String(error)}`],
      },
    };
  }
  mkdirSync(dirname(context.g3Rows), { recursive: true });
  writeFileSync(context.g3Rows, `${JSON.stringify(checked, null, 2)}\n`);
  const { rows: _rows, ...rest } = checked;
  appendLine(context.series, {
    type: "g3",
    stepId,
    kind,
    regrade,
    at: deps.now().toISOString(),
    exitCode: child.exitCode,
    summary: rest.summary,
    rowsSha256: sha256File(context.g3Rows),
  });
  for (const line of describeSummary(checked.summary)) deps.log(line);
  deps.log(
    `G3 ${regrade ? "RE-GRADE " : ""}RECORDED: ${relative(context.repoRoot, context.g3Rows)} — UNSETTLED (grading cost is not in the export); run \`reconcile\` before the next paid step.`,
  );
  if (checked.summary.authCredit === true) {
    deps.log(
      `AUTH/CREDIT STOP: ${stepId} — a confirmed OpenRouter 401/402 on a finder row; the series stops INCOMPLETE (auth/credit). Not a G3 result; its cost counts toward T. Resume only under a dated amendment: \`continue --for auth-credit --amendment <ref> --note <text>\`.`,
    );
    return 5;
  }
  return !checked.summary.failedRun && checked.summary.pass ? 0 : 1;
}

async function commandReconcile(flags, deps) {
  const context = contextFor(flags, deps);
  const settleSeconds = Number(flags["settle-seconds"] ?? SETTLE_SECONDS);
  if (!Number.isFinite(settleSeconds) || settleSeconds < SETTLE_SECONDS) {
    refuse(
      "bad settle-seconds",
      String(flags["settle-seconds"]),
      `the two reads must be at least ${String(SETTLE_SECONDS)} s apart; a shorter re-read is not settlement evidence`,
    );
  }
  const series = readSeries(context.series);
  const key = apiKey(deps);
  const first = { value: await deps.readCounter(key), at: deps.now().toISOString() };
  await deps.sleep(settleSeconds * 1000);
  const second = { value: await deps.readCounter(key), at: deps.now().toISOString() };
  const moving = Math.abs(second.value - first.value) > 1e-9;
  const unsettled = unsettledSteps(series);

  if (unsettled.length === 0) {
    const spend = seriesSpend(series, second.value);
    appendLine(context.series, {
      type: "reconcile",
      stepId: null,
      at: second.at,
      reads: [first, second],
      counterDelta: spend.counterDelta,
      settledTotal: spend.settledTotal,
      t: spend.t,
      status: moving ? "counter still moving" : "checked",
    });
    deps.log(
      `SERIES CHECKED: counter delta $${String(spend.counterDelta?.toFixed(6))} vs settled $${spend.settledTotal.toFixed(6)}; T $${spend.t.toFixed(6)}${moving ? " — the counter is still moving; re-check later" : ""}.`,
    );
    return moving ? 1 : 0;
  }

  const stepId = unsettled[0];
  const spend = seriesSpend(series, second.value);
  if (spend.counterDelta === undefined)
    refuse("no preflight", stepId, "restore the series preflight before reconciling");
  const record = series.find((line) => (line.type === "record" || line.type === "g3") && line.stepId === stepId);
  // A step's admission counter can lag behind earlier telemetry settlements.
  // Attribute only cumulative usage not already recorded, never those charges again.
  // As with T, usage on this key outside the series cannot be distinguished and
  // is conservatively included; use a key with no concurrent external spending.
  const delta = Math.max(0, spend.counterDelta - spend.settledTotal);
  // Telemetry: a run's complete cost, or the part that is known (a G3 step's finder cost; grading is not reported).
  const known =
    record?.type === "g3"
      ? (record.summary?.cost?.total ?? 0)
      : (record?.cost?.finder ?? 0) + (record?.cost?.judge ?? 0);
  let status;
  let note;
  if (moving) {
    status = "unsettled";
    note = `counter still moving (${String(first.value)} → ${String(second.value)} over ${String(settleSeconds)} s)`;
  } else if (spend.counterDelta < spend.settledTotal - 1e-9) {
    status = "unsettled";
    note = `counter delta $${spend.counterDelta.toFixed(6)} is below already settled $${spend.settledTotal.toFixed(6)}: still lagging`;
  } else if (delta < known - reconcileTolerance(known)) {
    status = "unsettled";
    note = `counter delta $${delta.toFixed(6)} is below the reported $${known.toFixed(6)}: still lagging`;
  } else if (known <= 1e-9 && delta <= 1e-9) {
    status = "unsettled";
    note = "counter unmoved and nothing reported: nothing shows the step was counted yet";
  } else {
    status = "settled";
    note =
      delta - known > reconcileTolerance(known)
        ? `counter delta exceeds the reported $${known.toFixed(6)} by $${(delta - known).toFixed(6)} (unreported spend, e.g. grading or an aborted request)`
        : "counter delta within tolerance of the reported cost";
  }
  appendLine(context.series, {
    type: "reconcile",
    stepId,
    at: second.at,
    reads: [first, second],
    counterDelta: spend.counterDelta,
    settledTotal: spend.settledTotal,
    delta,
    known,
    status,
    note,
  });
  if (status !== "settled") {
    deps.log(`UNSETTLED: ${stepId} — ${note}. No paid step until it settles: re-run \`reconcile\` later.`);
    return 1;
  }
  appendLine(context.series, {
    type: "settled",
    stepId,
    at: second.at,
    cost: delta,
    source: "counter",
    difference: delta - known,
  });
  deps.log(`SETTLED: ${stepId} at $${delta.toFixed(6)} (${note}).`);
  return 0;
}

async function commandContinue(flags, deps) {
  const context = contextFor(flags, deps);
  if (flags.for !== "probe" && flags.for !== "pause" && flags.for !== "auth-credit")
    refuse("bad --for", String(flags.for), "use --for probe, --for pause or --for auth-credit");
  if (typeof flags.note !== "string" || flags.note.trim() === "")
    refuse("no note", "continue", "record the owner's words with --note");
  const series = readSeries(context.series);
  if (flags.for !== "auth-credit" && series.some((line) => line.type === "continue" && line.for === flags.for)) {
    refuse("already recorded", `continue --for ${flags.for}`, "each go-ahead is recorded once");
  }
  if (flags.for === "auth-credit") {
    // One resumption per confirmed 401/402 stop, and only under a dated amendment (owner decision 2026-10-14).
    if (scheduleState(series).ended !== "INCOMPLETE (auth/credit)")
      refuse("no auth/credit stop", "continue --for auth-credit", "only a confirmed 401/402 stop takes this go-ahead");
    if (typeof flags.amendment !== "string" || flags.amendment.trim() === "")
      refuse(
        "no amendment",
        "continue --for auth-credit",
        "name the dated, hashed gate.md amendment that authorizes resuming, with --amendment",
      );
  } else if (flags.for === "probe") {
    const clean = series.filter((line) => line.type === "record" && line.kind === "clean" && !authCreditStopped(line));
    if (clean.length !== 1) refuse("no probe to confirm", "G2-01", "the probe is the first clean run, and only it");
  } else {
    if (unsettledSteps(series).length > 0) refuse("unsettled", "pause", "reconcile first, then continue");
    const spend = seriesSpend(series, await counterNow(context, deps));
    if (spend.t < 3) refuse("no pause reached", `T $${spend.t.toFixed(4)}`, "the pause is at T ≥ $3.00");
  }
  appendLine(context.series, {
    type: "continue",
    for: flags.for,
    ...(flags.for === "auth-credit" ? { amendment: flags.amendment } : {}),
    note: flags.note,
    at: deps.now().toISOString(),
    by: "owner",
  });
  deps.log(`OWNER GO-AHEAD RECORDED: ${flags.for} (${flags.note}).`);
  return 0;
}

async function commandOutcome(flags, deps) {
  const context = contextFor(flags, deps);
  const series = readSeries(context.series);
  const key = effectiveEnv(deps.env, deps.envFile).OPENROUTER_API_KEY;
  const counter = context.dryRun || !key ? undefined : await deps.readCounter(key);
  const handRead =
    flags["hand-read"] === undefined ? undefined : JSON.parse(readFileSync(resolve(flags["hand-read"]), "utf8"));
  const outcome = computeOutcome(series, { counterNow: counter, handRead });
  const block = renderOutcome(outcome, { at: deps.now().toISOString() });
  deps.log(block);
  if (counter === undefined) deps.log("NOTE: no key counter read — T is from settled costs only.");
  if (flags.write) {
    if (!existsSync(context.gate))
      refuse("no gate.md", relative(context.repoRoot, context.gate), "write the pre-registration first (plan Phase 4)");
    const text = readFileSync(context.gate, "utf8");
    const start = text.indexOf(OUTCOME_START);
    const end = text.indexOf(OUTCOME_END);
    if (start === -1 || end === -1 || end < start) {
      refuse(
        "no outcome markers",
        relative(context.repoRoot, context.gate),
        `add ${OUTCOME_START} and ${OUTCOME_END} under § Results`,
      );
    }
    writeFileSync(context.gate, `${text.slice(0, start + OUTCOME_START.length)}\n\n${block}\n\n${text.slice(end)}`);
    deps.log(`OUTCOME WRITTEN: ${relative(context.repoRoot, context.gate)} § Results.`);
  }
  return 0;
}

/** Entry point with injectable dependencies; the tests drive it with a fake CLI and counter. */
export async function main(argv, deps) {
  try {
    const [command, ...rest] = argv;
    const flags = parseFlags(rest);
    if (command === "preflight") return await commandPreflight(flags, deps);
    if (command === "run") return await commandRun(flags, deps);
    if (command === "g3") return await commandG3(flags, deps);
    if (command === "reconcile") return await commandReconcile(flags, deps);
    if (command === "continue") return await commandContinue(flags, deps);
    if (command === "outcome") return await commandOutcome(flags, deps);
    if (command === "manifest") {
      deps.log(JSON.stringify(describeManifest(contextFor(flags, deps)), null, 2));
      return 0;
    }
    throw new Refusal(
      `USAGE: unknown command ${String(command)} — one of preflight, run, g3, reconcile, continue, outcome, manifest.`,
    );
  } catch (error) {
    if (error instanceof Refusal) {
      deps.log(error.message);
      return error.code;
    }
    throw error;
  }
}

// --- Real dependencies -----------------------------------------------------------------

/** The key's cumulative USD usage from GET /api/v1/key. Free; no model call. */
export async function readKeyCounter(key, fetchImpl = fetch) {
  const response = await fetchImpl(KEY_URL, { headers: { Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`GET ${KEY_URL} returned HTTP ${String(response.status)}`);
  const usage = (await response.json())?.data?.usage;
  if (typeof usage !== "number") throw new Error(`GET ${KEY_URL} carried no numeric data.usage`);
  return usage;
}

/** glm-5.3's endpoints for the listed providers: name, tag, status, 30-minute uptime. Free. */
export async function readEndpoints(key, fetchImpl = fetch) {
  const response = await fetchImpl(ENDPOINTS_URL, { headers: { Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`GET ${ENDPOINTS_URL} returned HTTP ${String(response.status)}`);
  const endpoints = (await response.json())?.data?.endpoints;
  if (!Array.isArray(endpoints)) throw new Error(`GET ${ENDPOINTS_URL} carried no data.endpoints`);
  return endpoints
    .filter((endpoint) => /^(z-ai|fireworks|together)(\/|$)/u.test(String(endpoint?.tag)))
    .map((endpoint) => ({
      provider: endpoint.provider_name ?? null,
      tag: endpoint.tag ?? null,
      status: endpoint.status ?? null,
      uptime30m: endpoint.uptime_last_30m ?? null,
    }));
}

/** Spawns a command; SIGINT kills the child and marks the step interrupted. */
export function spawnCommand(command, args, env, cwd) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
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

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), {
    repoRoot: REPO_ROOT,
    packageDir: PACKAGE_DIR,
    envFile: join(PACKAGE_DIR, ".env"),
    env: process.env,
    git: (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim(),
    readCounter: (key) => readKeyCounter(key),
    readEndpoints: (key) => readEndpoints(key),
    // Exactly action.yml's invocation: `npm run review -- <args>` from the package.
    runCli: (args, env, cwd) => spawnCommand("npm", ["run", "review", "--", ...args], env, cwd),
    runCommand: spawnCommand,
    now: () => new Date(),
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    log: (message) => {
      console.log(message);
    },
  });
}
