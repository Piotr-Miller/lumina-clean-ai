// Measurement runner for change `finder-glm-5-3-high`, built by change
// `finder-glm-5-3` (its plan.md Phase 3 §1; A1). A thin layer over the
// PRODUCTION CLI: every run is `npm run review` with the arguments action.yml
// passes, and every paid step is admitted, recorded and settled in one
// append-only JSONL series — whether it succeeds, fails or is interrupted.
// Every refusal happens BEFORE anything is spent. The rules live in
// scripts/glm-gate-core.mjs; this file does the I/O. References below to
// plan.md, gate.md and A1–A8 are the predecessor's unless they say otherwise.
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
//   d2 --run <id> --list | --match <F-id>[,<F-id>…] | --none | --not-applicable [--note <text>]
//                                      Free. Lists a #269 run's D2 candidates, or records the owner's
//                                      final D2 line for it (this change's plan.md Phase 2 §2).
//   outcome [--write] [--hand-read <json>]
//                                      The automatic outcome; --write puts it into gate.md § Results.
//   manifest                           Prints the manifest of the current tree (for the seal). Free.
//
// `--screening` (this change's plan.md Phase 2 §1) runs the screening instead
// of the gate, on its own ledger, results and T0: `preflight`, `fixtures`
// (G3's four cases × 1), `run --case pr247|pr269`, `reconcile`, `continue
// --for auth-credit|mismatch|grader-error|invalid-run`, `d2` and `outcome
// [--write]` (into screening.md). No manifest; instead every paid step checks
// and records the screened tree's sha256 (owner decision 2026-10-16).
//
// `--dry-run` (preflight, run, d2, outcome): no key, no network, no manifest
// required; the CLI runs with scripts/glm-gate-dry-run-stub.mjs preloaded and
// the series is written under the cache, never into the change folder. The
// path flags --manifest, --series, --results, --g3-rows and --gate are refused
// without it (Amendment 1 as code, this change's plan.md H8).
//
// Paths: series, results and g3-rows in context/changes/finder-glm-5-3-high/gate/;
// the screening's in …/screening/; console logs and exports under
// ~/.cache/finder-glm-5-3-high/ (GLM_GATE_CACHE), the screening's in its screening/;
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
  admitScreening,
  authCreditStopped,
  classifyRun,
  computeOutcome,
  computeScreeningOutcome,
  D2_TERMS,
  d2LineFor,
  d2Wait,
  describeD2,
  EXPECTED_CONFIGURATION_LINE,
  finderTiming,
  forbiddenEnvSet,
  g3EvalArgs,
  isD2Candidate,
  parseCliStderr,
  probeProblems,
  reconcileTolerance,
  renderOutcome,
  renderScreeningOutcome,
  runCost,
  RUN_CASES,
  scheduleState,
  screeningBaseline,
  screeningState,
  seriesSpend,
  seriesT0,
  SETTLE_SECONDS,
  timedLineOf,
  unsettledSteps,
} from "./glm-gate-core.mjs";
import { checkExport, describeSummary, exportRows } from "./promptfoo-gate-rows.mjs";
import { buildRegradeConfig, selectGraderErrorRows } from "./promptfoo-regrade-config.mjs";

export const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = resolve(PACKAGE_DIR, "..", "..");
const CHANGE = "context/changes/finder-glm-5-3-high";
const KEY_URL = "https://openrouter.ai/api/v1/key";
const ENDPOINTS_URL = "https://openrouter.ai/api/v1/models/z-ai/glm-5.3/endpoints";
const REGRADE_CONFIG = "evals/glm-5.3.regrade.json";
const OUTCOME_START = "<!-- glm-gate:outcome:start -->";
const OUTCOME_END = "<!-- glm-gate:outcome:end -->";
const SCREEN_OUTCOME_START = "<!-- glm-screen:outcome:start -->";
const SCREEN_OUTCOME_END = "<!-- glm-screen:outcome:end -->";

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
    change: "finder-glm-5-3-high",
    files: sealedFileHashes(context.repoRoot),
    inputs: Object.fromEntries(RUN_CASES.map((caseKey) => [caseKey, inputFingerprint(caseKey, context)])),
    configurationLine: EXPECTED_CONFIGURATION_LINE,
  };
}

/**
 * The sha256 of a manifest as `manifest` prints it (`node scripts/glm-gate.mjs
 * manifest > gate-manifest.json` writes these bytes): the screened tree's
 * identity, which the pre-registration compares with the seal.
 */
export const manifestSha256 = (manifest) => sha256(`${JSON.stringify(manifest, null, 2)}\n`);

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

const BOOLEAN_FLAGS = new Set([
  "dry-run",
  "list",
  "manifest-only",
  "none",
  "not-applicable",
  "regrade",
  "screening",
  "write",
]);

/** Path overrides: a smoke test's, never a paid step's (Amendment 1 as code, this change's plan.md H8). */
const PATH_FLAGS = Object.freeze(["manifest", "series", "results", "g3-rows", "gate"]);

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
  const screening = flags.screening === true;
  const changeDir = join(deps.repoRoot, CHANGE);
  const cache = resolve(flags.cache ?? deps.env.GLM_GATE_CACHE ?? join(homedir(), ".cache", "finder-glm-5-3-high"));
  // Console logs and exports: <cache>/runs and <cache>/g3 for the gate, <cache>/screening/ for the screening.
  const work = join(cache, ...(dryRun ? ["dry-run"] : []), ...(screening ? ["screening"] : []));
  const base = dryRun ? work : join(changeDir, screening ? "screening" : "gate");
  const gate = resolve(flags.gate ?? join(changeDir, "gate.md"));
  return {
    dryRun,
    screening,
    repoRoot: deps.repoRoot,
    packageDir: deps.packageDir,
    git: deps.git,
    cache,
    work,
    inputsDir: resolve(flags.inputs ?? deps.env.GLM_GATE_INPUTS ?? join(homedir(), ".cache", "finder-sonnet-gate")),
    series: resolve(flags.series ?? join(base, "series.jsonl")),
    results: resolve(flags.results ?? join(base, "results")),
    g3Rows: resolve(flags["g3-rows"] ?? join(base, "g3-rows.json")),
    manifest: resolve(flags.manifest ?? join(changeDir, "gate-manifest.json")),
    gate,
    // The document `outcome --write` writes into; a dry-run screening writes beside its own series.
    doc: screening ? (dryRun ? join(base, "screening.md") : join(changeDir, "screening.md")) : gate,
  };
}

/** A path for messages: repository-relative, or `<cache>/…`; never absolute. */
const shown = (context, path) =>
  path.startsWith(`${context.cache}/`)
    ? `<cache>/${relative(context.cache, path)}`
    : path.startsWith(`${context.repoRoot}/`)
      ? relative(context.repoRoot, path)
      : "a path outside the repository and the cache";

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
      "unset them — an empty or blank value counts as set — in the shell and in packages/code-reviewer/.env",
    );
  }
}

function apiKey(deps) {
  const key = effectiveEnv(deps.env, deps.envFile).OPENROUTER_API_KEY;
  if (!key) refuse("no API key", "OPENROUTER_API_KEY", "put it in packages/code-reviewer/.env");
  return key;
}

const counterNow = async (context, deps) => (context.dryRun ? 0 : deps.readCounter(apiKey(deps)));

const errorLine = (error) => (error instanceof Error ? error.message.split("\n")[0] : String(error));

/** The screened tree now: its manifest and that manifest's sha256. Refuses when an input is unreadable. */
function screenedTree(context) {
  let manifest;
  try {
    manifest = describeManifest(context);
  } catch (error) {
    refuse("input unreadable", errorLine(error), "restore the frozen inputs under GLM_GATE_INPUTS");
  }
  return { manifest, sha: manifestSha256(manifest) };
}

/**
 * The screened tree check (owner decision 2026-10-16): a paid screening step
 * runs only on the tree of the baseline preflight, and names what differs.
 */
function checkScreenedTree(context, series) {
  const current = screenedTree(context);
  const baseline = screeningBaseline(series);
  if (baseline !== undefined && baseline.treeSha256 !== current.sha) {
    const problems = [
      ...manifestMismatches(baseline.tree, context.repoRoot),
      ...inputMismatches(baseline.tree, RUN_CASES, context),
    ];
    refuse(
      "screened tree changed",
      `sha256 ${current.sha}, baseline ${baseline.treeSha256}${problems.length > 0 ? ` (${problems.join("; ")})` : ""}`,
      "the screening measures one tree: undo the change; before any spending a fix takes a new `preflight --screening`, after it the owner decides",
    );
  }
  return current;
}

/** The screening's state after a step, in words: stop, pause, next step, warnings. */
function reportScreening(context, deps) {
  const state = screeningState(readSeries(context.series));
  if (state.ended === "GO") {
    deps.log("SCREENING ENDED: GO — every step ran and settled; record it with `outcome --screening --write`.");
  } else if (state.ended !== null) {
    const fired = state.fired.map((stop) => `${stop.label} — ${stop.steps.join(", ")}`).join("; ");
    deps.log(
      `SCREENING ENDED: ${state.ended}${fired === "" ? "" : ` (stop rules that hold: ${fired})`} — no further paid step; record it with \`outcome --screening --write\`.`,
    );
  } else if (state.waitingFor !== null) {
    deps.log(`SCREENING PAUSED: waiting for ${state.waitingFor}.`);
  } else {
    deps.log(`SCREENING: the next step is ${String(state.nextStepId)} (${String(state.next)}).`);
  }
  for (const warning of state.warnings) deps.log(`WARNING: ${warning}.`);
  return state;
}

async function commandPreflight(flags, deps) {
  const context = contextFor(flags, deps);
  if (context.screening) return commandScreeningPreflight(context, deps);
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
 * The screening's preflight (plan Phase 2 §1): T0_s, the endpoints, the input
 * fingerprints, the screened tree's manifest and sha256, git HEAD. No manifest
 * is required; the forbidden environment is refused.
 */
async function commandScreeningPreflight(context, deps) {
  checkEnvironment(deps);
  const tree = screenedTree(context);
  let head;
  try {
    head = deps.git(["rev-parse", "HEAD"], context.repoRoot);
  } catch (error) {
    refuse("no git HEAD", errorLine(error), "run the screening from a git checkout of the branch it measures");
  }
  const series = readSeries(context.series);
  let counter = 0;
  let endpoints = null;
  if (!context.dryRun) {
    const key = apiKey(deps);
    counter = await deps.readCounter(key);
    endpoints = await deps.readEndpoints(key);
  }
  const t0 = seriesT0(series);
  const frozen = series.some((line) => line.type === "started") ? screeningBaseline(series) : undefined;
  appendLine(context.series, {
    type: "preflight",
    screening: true,
    at: deps.now().toISOString(),
    counter,
    endpoints,
    head,
    treeSha256: tree.sha,
    tree: tree.manifest,
    dryRun: context.dryRun,
  });
  const inputs = ["pr247", "pr269"]
    .map((caseKey) => {
      const fingerprint = tree.manifest.inputs[caseKey];
      return `${caseKey} diff ${fingerprint.diff.slice(0, 8)}… worktree ${String(fingerprint.head).slice(0, 7)} ${fingerprint.clean ? "clean" : "DIRTY"}`;
    })
    .join(", ");
  deps.log(
    `SCREENING PREFLIGHT RECORDED: key counter $${counter.toFixed(6)}${t0 === undefined ? " (T0_s)" : ` (T0_s stays $${t0.counter.toFixed(6)})`}` +
      `, tree sha256 ${tree.sha} at HEAD ${head}` +
      `${frozen === undefined ? " (the baseline until the first paid step)" : ` (the baseline stays ${frozen.treeSha256}: frozen at the first paid step)`}` +
      `, ${inputs}, environment clean${endpoints === null ? "" : `, endpoints ${JSON.stringify(endpoints)}`} → ${shown(context, context.series)}.`,
  );
  return 0;
}

/**
 * Admission for every paid step: no unsettled step, the $3.00 pause honoured,
 * T + P ≤ $3.50 (the screening's: T_s + P ≤ $0.75). A failed T + P test is
 * recorded as a budget stop. Returns the counter read and the admission record.
 */
async function admitStep(context, deps, series, kind) {
  const counter = await counterNow(context, deps);
  const counterRead = context.dryRun ? undefined : counter;
  const decision = context.screening ? admitScreening(series, kind, counterRead) : admit(series, kind, counterRead);
  if (decision.budgetStop) {
    appendLine(context.series, { type: "budget_stop", kind, at: deps.now().toISOString(), ...decision });
    throw new Refusal(
      `BUDGET STOP: ${kind} — T $${decision.t.toFixed(4)} + P $${decision.p.toFixed(4)} > cap $${decision.cap.toFixed(2)}; the ${context.screening ? "screening" : "series"} ends INCOMPLETE (budget). Nothing was spent.`,
      4,
    );
  }
  if (!decision.admit) refuse("not admitted", kind, decision.refusal);
  return { counter, decision };
}

const RUN_ID = /^[a-z0-9][a-z0-9-]*$/u;

/** A run id for this invocation: never re-used in a paid series; a dry run's reused id becomes `<id>-r<k>`. */
function stepIdFor(context, series, requestedId) {
  if (typeof requestedId !== "string" || !RUN_ID.test(requestedId)) {
    refuse("bad run-id", String(requestedId), "use lowercase letters, digits and dashes, e.g. pr269-01");
  }
  const used = (id) => series.some((line) => line.stepId === id);
  // A paid run is never re-run or replaced. A dry run is a smoke test that must
  // stay re-runnable as written, so a reused id is recorded as `<id>-r<k>`.
  if (!used(requestedId)) return requestedId;
  if (!context.dryRun) refuse("run-id already used", requestedId, "a run is never re-run or replaced");
  let k = 2;
  while (used(`${requestedId}-r${String(k)}`)) k += 1;
  return `${requestedId}-r${String(k)}`;
}

/**
 * One production CLI run, recorded and — when its telemetry is complete —
 * settled: the part the gate and the screening share, so both classify,
 * price and time a run the same way.
 */
async function executeRun(context, deps, { stepId, caseKey, counter, decision, startedExtra = {} }) {
  const inputs = caseInputs(caseKey, context);
  const runDir = join(context.work, "runs", stepId);
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
    ...startedExtra,
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
  // Finder-pass timing (H11), when the CLI ran under spawnCommand: numbers only, no line text.
  const timing =
    child.timedLines === undefined
      ? { finderStepOffsetsMs: null, finderElapsedMs: null, finderAttemptFailed: null }
      : finderTiming(child.timedLines, child.exitAtMs ?? null);
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
    // The stderr step lines, valid runs included: they alone carry each request's output tokens.
    steps: classification.log.steps,
    retries: classification.log.retries,
    // The run's own terminal error was a timeout (retry lines aside): stop rule (b) of the screening.
    terminalTimeout: classification.log.terminalTimeout,
    ...timing,
    cost,
    reviewSha256,
    consoleLog: `<cache>/${relative(context.cache, runDir)}`,
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
  return { record, classification, child, runDir, cost };
}

const runSubject = (context, { record, child, cost }) =>
  `${record.stepId} (${record.kind}, exit ${String(child.exitCode)}, ${String(record.requests.length)} finder request(s), ${
    cost.complete
      ? "settled from telemetry"
      : `UNSETTLED — run \`reconcile${context.screening ? " --screening" : ""}\` before the next paid step`
  })`;

async function commandRun(flags, deps) {
  const context = contextFor(flags, deps);
  if (context.screening) return commandScreeningRun(flags, deps, context);
  const caseKey = flags.case;
  if (!RUN_CASES.includes(caseKey)) refuse("unknown case", String(caseKey), `use one of ${RUN_CASES.join(", ")}`);
  if (typeof flags["run-id"] !== "string" || !RUN_ID.test(flags["run-id"])) {
    refuse("bad run-id", String(flags["run-id"]), "use lowercase letters, digits and dashes, e.g. pr269-01");
  }
  checkEnvironment(deps);
  const series = readSeries(context.series);
  const stepId = stepIdFor(context, series, flags["run-id"]);
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
  const { counter, decision } = await admitStep(context, deps, series, caseKey);
  const run = await executeRun(context, deps, { stepId, caseKey, counter, decision });
  const { record, classification } = run;

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
    appendLine(context.series, { type: "probe", stepId, at: record.at, problems });
    probeNote =
      problems.length === 0
        ? " G2-01 PROBE OK — the owner confirms it with `continue --for probe` before G2-02."
        : ` G2-01 PROBE FAILED (${problems.join("; ")}) — STOP and ask the owner.`;
  }
  // Owner decision 2026-10-16 (d): no paid step after a #269 run until its d2 line.
  const d2Note = caseKey === "pr269" ? ` D2 PAUSE: no paid step until ${d2Wait(record)}.` : "";
  if (classification.valid) {
    deps.log(
      `VALID RUN: ${runSubject(context, run)}, ${String(record.findings.length)} finding(s), verdict ${String(record.verdict)}.${probeNote}${d2Note}`,
    );
    return 0;
  }
  deps.log(
    `INVALID RUN (${classification.reasons.join(", ")}): ${runSubject(context, run)} — see <cache>/${relative(context.cache, run.runDir)}/stderr.log.${probeNote}${d2Note}`,
  );
  return 1;
}

/**
 * Before a paid screening step: a preflight, the step the screening's order
 * names next (H2), nothing to wait for, and — for a run — the run id it names.
 */
function screeningOrder(context, series, kind, requestedId) {
  if (!series.some((line) => line.type === "preflight" && line.screening === true))
    refuse("no screening preflight", kind, "run `preflight --screening` first (it records T0_s and the screened tree)");
  const state = screeningState(series);
  if (state.ended !== null) refuse("the screening has ended", state.ended, "no further paid step; record the outcome");
  if (state.waitingFor !== null) refuse("screening paused", kind, `waiting for ${state.waitingFor}`);
  if (state.next !== kind) refuse("out of the screening's order", kind, `the next step is ${String(state.nextStepId)}`);
  if (requestedId !== undefined && requestedId !== state.nextStepId)
    refuse("run-id out of the screening's order", requestedId, `the next ${kind} run is ${String(state.nextStepId)}`);
  return state.nextStepId;
}

async function commandScreeningRun(flags, deps, context) {
  const caseKey = flags.case;
  if (caseKey !== "pr247" && caseKey !== "pr269")
    refuse(
      "unknown screening case",
      String(caseKey),
      "the screening runs pr247 and pr269; its fixtures step is `fixtures --screening`",
    );
  if (typeof flags["run-id"] !== "string" || !RUN_ID.test(flags["run-id"])) {
    refuse("bad run-id", String(flags["run-id"]), "use the id the screening names next, e.g. s247-01");
  }
  checkEnvironment(deps);
  const series = readSeries(context.series);
  const stepId = context.dryRun
    ? stepIdFor(context, series, flags["run-id"])
    : screeningOrder(context, series, caseKey, flags["run-id"]);
  const tree = checkScreenedTree(context, series);
  const { counter, decision } = await admitStep(context, deps, series, caseKey);
  const run = await executeRun(context, deps, {
    stepId,
    caseKey,
    counter,
    decision,
    startedExtra: { treeSha256: tree.sha },
  });
  const { record, classification } = run;
  if (record.authCredit === "confirmed") {
    deps.log(
      `AUTH/CREDIT PAUSE: ${stepId} (${caseKey}) — confirmed OpenRouter ${classification.log.apiStatuses.join("/")}; not a sample, its cost counts toward T_s (\`reconcile --screening\` it).`,
    );
  } else if (classification.valid) {
    deps.log(
      `VALID SCREENING RUN: ${runSubject(context, run)}, ${String(record.findings.length)} finding(s), verdict ${String(record.verdict)}.`,
    );
  } else {
    deps.log(
      `INVALID SCREENING RUN (${classification.reasons.join(", ")}): ${runSubject(context, run)} — see <cache>/${relative(context.cache, run.runDir)}/stderr.log.`,
    );
  }
  if (!context.dryRun) reportScreening(context, deps);
  else if (caseKey === "pr269") deps.log(`D2 PAUSE (dry run): ${d2Wait(record, { screening: true })}.`);
  if (record.authCredit === "confirmed") return 5;
  return classification.valid ? 0 : 1;
}

async function commandG3(flags, deps) {
  const context = contextFor(flags, deps);
  if (context.screening)
    refuse("not a screening step", "g3", "the screening's fixture step is `fixtures --screening` (G3's cases × 1)");
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
  const g3Dir = join(context.cache, "g3");
  const exportPath = join(g3Dir, "g3.export.json");
  const regradeExport = join(g3Dir, "g3-regrade.export.json");
  // Amendment 1 as code (this change's plan.md H8): a step reads only the export it writes.
  const ownExport = regrade ? regradeExport : exportPath;
  if (existsSync(ownExport)) {
    refuse(
      "export already exists",
      shown(context, ownExport),
      "a G3 step reads only the export it writes, and this one belongs to an earlier step: move it away first",
    );
  }
  const { counter, decision } = await admitStep(context, deps, series, kind);
  mkdirSync(g3Dir, { recursive: true });
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

/**
 * The screening's fixtures step (plan Phase 2 §1): G3's command with
 * `--repeat 1`, checked with `repeats: 1`. Its quality is informational; its
 * rows feed stop rules (a) and (b) and the pauses.
 */
async function commandFixtures(flags, deps) {
  const context = contextFor(flags, deps);
  if (!context.screening)
    refuse("not a gate step", "fixtures", "the fixtures step belongs to the screening: `fixtures --screening`");
  if (context.dryRun)
    refuse(
      "no dry run for the fixtures step",
      "fixtures --screening",
      "it calls promptfoo's grader; test it with the hermetic tests",
    );
  checkEnvironment(deps);
  const series = readSeries(context.series);
  const stepId = screeningOrder(context, series, "fixtures");
  const exportPath = join(context.work, `${stepId}.export.json`);
  if (existsSync(exportPath)) {
    refuse(
      "export already exists",
      shown(context, exportPath),
      "a fixtures step reads only the export it writes, and this one is left from an earlier attempt: move it away first",
    );
  }
  const tree = checkScreenedTree(context, series);
  const { counter, decision } = await admitStep(context, deps, series, "fixtures");
  mkdirSync(context.work, { recursive: true });
  appendLine(context.series, {
    type: "started",
    stepId,
    kind: "fixtures",
    at: deps.now().toISOString(),
    counterBefore: counter,
    admission: decision,
    treeSha256: tree.sha,
  });
  const child = await deps.runCommand(
    "npm",
    g3EvalArgs(exportPath, { repeat: 1 }),
    effectiveEnv(deps.env, deps.envFile),
    deps.packageDir,
  );
  writeFileSync(join(context.work, `${stepId}.stdout.log`), child.stdout);
  writeFileSync(join(context.work, `${stepId}.stderr.log`), child.stderr);
  let checked;
  try {
    checked = checkExport(JSON.parse(readFileSync(exportPath, "utf8")), undefined, { repeats: 1 });
  } catch (error) {
    checked = {
      rows: [],
      summary: { failedRun: true, repeats: 1, problems: [`no usable export: ${errorLine(error)}`] },
    };
  }
  const rowsPath = join(context.results, `${stepId}.fixture-rows.json`);
  mkdirSync(context.results, { recursive: true });
  writeFileSync(rowsPath, `${JSON.stringify(checked, null, 2)}\n`);
  appendLine(context.series, {
    type: "fixtures",
    stepId,
    kind: "fixtures",
    at: deps.now().toISOString(),
    exitCode: child.exitCode,
    summary: checked.summary,
    rowsSha256: sha256File(rowsPath),
  });
  for (const line of describeSummary(checked.summary)) deps.log(line);
  deps.log(
    `FIXTURES RECORDED: ${shown(context, rowsPath)} — quality is informational; UNSETTLED (grading cost is not in the export): run \`reconcile --screening\` before the next paid step.`,
  );
  const state = reportScreening(context, deps);
  if (checked.summary.authCredit === true) return 5;
  return state.ended !== null || state.pause !== null ? 1 : 0;
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
  const again = `reconcile${context.screening ? " --screening" : ""}`;

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
  const record = series.find(
    (line) => (line.type === "record" || line.type === "g3" || line.type === "fixtures") && line.stepId === stepId,
  );
  // A step's admission counter can lag behind earlier telemetry settlements.
  // Attribute only cumulative usage not already recorded, never those charges again.
  // As with T, usage on this key outside the series cannot be distinguished and
  // is conservatively included; use a key with no concurrent external spending.
  const delta = Math.max(0, spend.counterDelta - spend.settledTotal);
  // Telemetry: a run's complete cost, or the part that is known (a G3 step's finder cost; grading is not reported).
  const known =
    record?.type === "g3" || record?.type === "fixtures"
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
    deps.log(`UNSETTLED: ${stepId} — ${note}. No paid step until it settles: re-run \`${again}\` later.`);
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
  // A settlement can fire stop rule (c) of the screening (H4 after #247).
  if (context.screening) reportScreening(context, deps);
  return 0;
}

const SCREENING_CONTINUE_REASONS = Object.freeze(["auth-credit", "mismatch", "grader-error", "invalid-run"]);

async function commandContinue(flags, deps) {
  const context = contextFor(flags, deps);
  if (context.screening) return commandScreeningContinue(flags, deps, context);
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

/**
 * The owner's decision at a screening pause (owner decisions 2026-10-16): the
 * reason must be the one `waitingFor` names, the paused step settled, and
 * after a #269 run its d2 line recorded first. One go-ahead per pause.
 */
async function commandScreeningContinue(flags, deps, context) {
  const reason = flags.for;
  if (!SCREENING_CONTINUE_REASONS.includes(reason))
    refuse(
      "bad --for",
      String(reason),
      `use the reason the pause names: ${SCREENING_CONTINUE_REASONS.map((r) => `--for ${r}`).join(", ")}`,
    );
  if (typeof flags.note !== "string" || flags.note.trim() === "")
    refuse("no note", "continue --screening", "record the owner's words with --note");
  const series = readSeries(context.series);
  const state = screeningState(series);
  if (state.ended !== null) refuse("the screening has ended", state.ended, "there is nothing to resume");
  if (state.pause === null)
    refuse(
      "no screening pause",
      `continue --screening --for ${reason}`,
      state.waitingFor === null
        ? `nothing is paused; the next step is ${String(state.nextStepId)}`
        : `waiting for ${state.waitingFor}`,
    );
  const { stepId } = state.pause;
  if (state.pause.reason !== reason)
    refuse(
      "wrong reason",
      `continue --screening --for ${reason}`,
      `${stepId} pauses for ${state.pause.reason} (${state.pause.causes.join("; ")}): \`continue --screening --for ${state.pause.reason} --note <text>\``,
    );
  if (unsettledSteps(series).includes(stepId))
    refuse("unsettled", stepId, "`reconcile --screening` first, then the owner's continue");
  appendLine(context.series, {
    type: "continue",
    screening: true,
    for: reason,
    stepId,
    note: flags.note,
    at: deps.now().toISOString(),
    by: "owner",
  });
  deps.log(`OWNER GO-AHEAD RECORDED: ${stepId} — ${reason} (${flags.note}).`);
  reportScreening(context, deps);
  return 0;
}

const location = (finding) => {
  const { file, startLine, endLine } = finding;
  if (startLine === undefined) return String(file);
  return endLine === undefined || endLine === startLine
    ? `${String(file)}:${String(startLine)}`
    : `${String(file)}:${String(startLine)}-${String(endLine)}`;
};

/** A run's published findings, read back from its stored review.json and checked against the recorded sha256. */
function storedFindings(context, record) {
  const path = join(context.results, `${record.stepId}.review.json`);
  if (!existsSync(path))
    refuse("stored review.json missing", shown(context, path), "restore it from the run's results before deciding D2");
  const bytes = readFileSync(path);
  if (sha256(bytes) !== record.reviewSha256)
    refuse(
      "stored review.json differs from its recorded sha256",
      shown(context, path),
      "restore the bytes the run recorded; D2 is decided on those only",
    );
  const findings = JSON.parse(bytes.toString("utf8")).findings;
  return Array.isArray(findings) ? findings : [];
}

/**
 * The owner's D2 decision per #269 run (owner decision 2026-10-16 (a)–(d);
 * this change's plan.md Phase 2 §2), the same in the gate and the screening.
 * `--list` prints the candidates and writes nothing; every other form appends
 * the run's one, final `d2` line.
 */
async function commandD2(flags, deps) {
  const context = contextFor(flags, deps);
  const screening = context.screening ? " --screening" : "";
  const forms = ["list", "match", "none", "not-applicable"].filter((name) => flags[name] !== undefined);
  if (forms.length !== 1)
    refuse("usage", "d2", "give exactly one of --list, --match <F-id>[,<F-id>…], --none, --not-applicable");
  const stepId = flags.run;
  if (typeof stepId !== "string" || !RUN_ID.test(stepId)) refuse("bad --run", String(stepId), "name a #269 run id");
  const series = readSeries(context.series);
  const record = series.find((line) => line.type === "record" && line.stepId === stepId);
  if (record === undefined || record.kind !== "pr269")
    refuse(
      "not a #269 run",
      `${stepId} in ${shown(context, context.series)}`,
      "D2 is decided for the #269 runs of this ledger only",
    );
  const valid = record.valid === true && !authCreditStopped(record);
  const decided = d2LineFor(series, stepId);

  if (flags.list === true) {
    if (record.artifact !== true) {
      deps.log(
        `D2 CANDIDATES: ${stepId} (pr269, invalid, no stored review.json) — nothing to list; ${
          decided === undefined
            ? `record \`d2${screening} --run ${stepId} --not-applicable --note <text>\``
            : `decided: ${describeD2(decided)}`
        }.`,
      );
      return 0;
    }
    const findings = storedFindings(context, record);
    const candidates = findings.filter(isD2Candidate);
    deps.log(
      `D2 CANDIDATES: ${stepId} (pr269, ${valid ? "valid" : "INVALID — its findings never count"}, review.json sha256 ${record.reviewSha256}) — ${String(candidates.length)} of ${String(findings.length)} finding(s) match the D2 terms (${D2_TERMS.join(", ")}):`,
    );
    for (const finding of candidates) {
      deps.log(
        `- ${String(finding.id)} · ${location(finding)} · ${String(finding.severity)} · ${String(finding.description).split("\n")[0]}`,
      );
    }
    const others = findings.filter((finding) => !isD2Candidate(finding)).map((finding) => String(finding.id));
    deps.log(`Not listed (no D2 term): ${others.length === 0 ? "none" : others.join(", ")}.`);
    deps.log(
      decided !== undefined
        ? `Decided: ${describeD2(decided)} (final).`
        : valid
          ? `Decide: \`d2${screening} --run ${stepId} --match <F-id>[,…] --note <text>\` or \`d2${screening} --run ${stepId} --none --note <text>\` — a finding outside this list may be approved too.`
          : `Decide: \`d2${screening} --run ${stepId} --not-applicable --note <text>\`.`,
    );
    return 0;
  }

  if (decided !== undefined)
    refuse(
      "already decided",
      `${stepId}: ${describeD2(decided)}`,
      "a run's D2 line is final (owner decision 2026-10-16 (a))",
    );
  if (typeof flags.note !== "string" || flags.note.trim() === "")
    refuse("no note", `d2 ${stepId}`, "record the owner's words with --note");
  const at = deps.now().toISOString();
  let line;
  if (flags["not-applicable"] === true) {
    if (valid) refuse("a valid run", stepId, "D2 is decided for a valid run: `--match <F-id>[,…]` or `--none`");
    line = { type: "d2", stepId, decision: "not-applicable", note: flags.note, by: "owner", at };
  } else {
    if (!valid)
      refuse(
        "an invalid run",
        stepId,
        `D2 counts only for valid runs: \`d2${screening} --run ${stepId} --not-applicable --note <text>\``,
      );
    const findings = storedFindings(context, record);
    const published = findings.map((finding) => String(finding.id));
    const candidates = findings.filter(isD2Candidate).map((finding) => String(finding.id));
    const matches =
      flags.none === true
        ? []
        : [
            ...new Set(
              String(flags.match)
                .split(",")
                .map((id) => id.trim())
                .filter((id) => id !== ""),
            ),
          ];
    if (flags.none !== true && matches.length === 0)
      refuse("no finding id", "--match", "name the approved findings, e.g. --match F2,F5, or use --none");
    const unknown = matches.filter((id) => !published.includes(id));
    if (unknown.length > 0)
      refuse(
        "not a published finding",
        `${unknown.join(", ")} in ${stepId}`,
        `the run's findings are ${published.join(", ") || "none"}`,
      );
    line = {
      type: "d2",
      stepId,
      decision: flags.none === true ? "no-match" : "match",
      matches,
      candidates,
      unlisted: matches.filter((id) => !candidates.includes(id)),
      note: flags.note,
      by: "owner",
      at,
    };
  }
  appendLine(context.series, line);
  deps.log(
    `D2 RECORDED: ${stepId} — ${describeD2(line)}${line.unlisted?.length ? ` (approved outside the candidate list: ${line.unlisted.join(", ")})` : ""} → ${shown(context, context.series)}.`,
  );
  if (context.screening) {
    if (!context.dryRun) reportScreening(context, deps);
  } else if (line.decision === "no-match") {
    deps.log(
      "D2 EARLY STOP: the series ends FAIL (D2) → NOT ADMITTED (hand-read); the rest of G1, cost, the hand-read and G5 are not measured.",
    );
  }
  return 0;
}

async function commandOutcome(flags, deps) {
  const context = contextFor(flags, deps);
  const series = readSeries(context.series);
  const key = effectiveEnv(deps.env, deps.envFile).OPENROUTER_API_KEY;
  const counter = context.dryRun || !key ? undefined : await deps.readCounter(key);
  let block;
  let start = OUTCOME_START;
  let end = OUTCOME_END;
  if (context.screening) {
    block = renderScreeningOutcome(computeScreeningOutcome(series, { counterNow: counter }), {
      at: deps.now().toISOString(),
    });
    start = SCREEN_OUTCOME_START;
    end = SCREEN_OUTCOME_END;
  } else {
    const handRead =
      flags["hand-read"] === undefined ? undefined : JSON.parse(readFileSync(resolve(flags["hand-read"]), "utf8"));
    const outcome = computeOutcome(series, { counterNow: counter, handRead });
    block = renderOutcome(outcome, { at: deps.now().toISOString() });
  }
  deps.log(block);
  if (counter === undefined) deps.log("NOTE: no key counter read — T is from settled costs only.");
  if (flags.write) {
    const doc = context.doc;
    const what = context.screening ? "screening.md" : "gate.md";
    if (!existsSync(doc))
      refuse(
        `no ${what}`,
        shown(context, doc),
        context.screening
          ? "write the screening rules first (plan Phase 3 §1)"
          : "write the pre-registration first (plan Phase 4)",
      );
    const text = readFileSync(doc, "utf8");
    const from = text.indexOf(start);
    const to = text.indexOf(end);
    if (from === -1 || to === -1 || to < from) {
      refuse("no outcome markers", shown(context, doc), `add ${start} and ${end} under § Results`);
    }
    writeFileSync(doc, `${text.slice(0, from + start.length)}\n\n${block}\n\n${text.slice(to)}`);
    deps.log(`OUTCOME WRITTEN: ${shown(context, doc)} § Results.`);
  }
  return 0;
}

/** Entry point with injectable dependencies; the tests drive it with a fake CLI and counter. */
export async function main(argv, deps) {
  try {
    const [command, ...rest] = argv;
    const flags = parseFlags(rest);
    const overridden = PATH_FLAGS.filter((name) => flags[name] !== undefined);
    if (overridden.length > 0 && flags["dry-run"] !== true) {
      refuse(
        "path override without --dry-run",
        overridden.map((name) => `--${name}`).join(", "),
        "a paid step uses the change folder's own paths: drop the flag, or add --dry-run for a smoke test",
      );
    }
    if (command === "preflight") return await commandPreflight(flags, deps);
    if (command === "run") return await commandRun(flags, deps);
    if (command === "g3") return await commandG3(flags, deps);
    if (command === "fixtures") return await commandFixtures(flags, deps);
    if (command === "reconcile") return await commandReconcile(flags, deps);
    if (command === "continue") return await commandContinue(flags, deps);
    if (command === "d2") return await commandD2(flags, deps);
    if (command === "outcome") return await commandOutcome(flags, deps);
    if (command === "manifest") {
      deps.log(JSON.stringify(describeManifest(contextFor(flags, deps)), null, 2));
      return 0;
    }
    throw new Refusal(
      `USAGE: unknown command ${String(command)} — one of preflight, run, g3, fixtures, reconcile, continue, d2, outcome, manifest.`,
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

/**
 * Spawns a command; SIGINT kills the child and marks the step interrupted.
 * It also notes when each complete stderr line that times the finder pass
 * arrives — the configuration line, a finder step line, a `retrying finder`
 * line — and when the process exits (this change's plan.md H11). Only the
 * line's kind and offset are kept, never its text.
 */
export function spawnCommand(command, args, env, cwd, { now = () => performance.now(), echo = true } = {}) {
  return new Promise((resolvePromise) => {
    const startedAt = now();
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let stdout = "";
    let stderr = "";
    let interrupted = false;
    const timedLines = [];
    let partial = "";
    const note = (line, atMs) => {
      const info = timedLineOf(line.replace(/\r$/u, ""));
      if (info !== null) timedLines.push({ atMs, ...info });
    };
    const onInterrupt = () => {
      interrupted = true;
      child.kill("SIGINT");
    };
    process.once("SIGINT", onInterrupt);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (echo) process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      const atMs = Math.round(now() - startedAt);
      stderr += chunk;
      // A line split across chunks arrives with the chunk that completes it.
      const parts = `${partial}${chunk}`.split("\n");
      partial = parts.pop() ?? "";
      for (const line of parts) note(line, atMs);
      if (echo) process.stderr.write(chunk);
    });
    child.on("close", (exitCode, signal) => {
      const exitAtMs = Math.round(now() - startedAt);
      if (partial !== "") note(partial, exitAtMs);
      process.removeListener("SIGINT", onInterrupt);
      resolvePromise({ exitCode, signal, stdout, stderr, interrupted, timedLines, exitAtMs });
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
