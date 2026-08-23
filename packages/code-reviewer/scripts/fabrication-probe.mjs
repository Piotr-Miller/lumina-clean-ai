// Fabrication probe for change `finder-fabrication-triggers`.
//
// Runs the real finder on a DECLARED variant of the PR #127 reproducing diff
// and captures everything the campaign's grading needs — full findings JSON,
// per-run token usage + provider-reported cost, and a window manifest naming
// exactly which files the model could see. Replaces finder-distribution.mjs
// for fabrication work (that script captures no finding text, computes no
// cost, and its recipe diverged from CI — see its deprecation header).
//
// Variants (recipes reproduce what each consumer historically saw):
//   ci          three-dot `e8ebb66...9c49a0c` minus reviews/*.md + the plan
//               path — byte-anchor 215,560 (validated against the Actions log
//               of run 31725802000). What production reviewed.
//   instrument  two-dot `7c9c12f^1 7c9c12f` minus reviews/*.md — byte-anchor
//               266,444. What the archived 2/8 collapse evidence measured.
//
// Rungs (CI variant only; pathspec ablations per plan.md + review F3):
//   base   recipe → capDiff (production cap)
//   r1     recipe, cap LIFTED (full diff sent) — ablates the cap (M1)
//   r2     recipe minus context/** → capDiff — ablates prose
//   r3     recipe restricted to prose (minus packages/** AND .github/**) → capDiff
//   rloc   base (capped) + the frozen off-diff-definitions block from
//          ground-truth/rloc-context.txt — ablates diff-boundary invisibility (M3)
//
// `--dry` builds the input + manifest and writes/prints them WITHOUT any API
// call (no key needed) — the byte anchors above are Phase 1 success criteria.
//
// Model is PINNED here, never env-resolved: finder-distribution.mjs reads the
// legacy OPENROUTER_MODEL and ignores CI's OPENROUTER_REVIEW_MODEL, so env
// resolution is exactly how a probe drifts off the production model silently.
//
// Usage:
//   npx tsx --env-file-if-exists=.env scripts/fabrication-probe.mjs \
//     --variant ci --rung base --n 8 [--dry]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { asStepCost, capDiff, computeFileSegments, computeManifest, DIFF_CAP_BYTES } from "../src/pipeline.js";
import { buildInstructions, buildPrompt } from "../src/prompts.js";
import { createReviewer } from "../src/reviewer.js";

export const FINDER_MODEL = "z-ai/glm-4.6";
const FINDER_TIMEOUT_MS = 300_000;

// Largest pre-registered arm (baselines n=20; screens n=8; top-ups +12 —
// plan.md ceilings). A bigger batch risks blowing the 140-attempt campaign
// ceiling in one interrupted invocation (review F3).
export const MAX_ARM_ATTEMPTS = 20;

// Amendment A1 (2026-08-21, before any gradeable observation): unpinned
// OpenRouter routing spread glm-4.6 across five upstreams and produced 4/4
// calibration failures with three DISTINCT malformed envelopes. The finder
// is pinned to Venice's fp4 endpoint — the only healthy glm-4.6 endpoint
// advertising `structured_outputs` (server-enforced strict JSON Schema);
// schema enforcement is required for the instrument to produce a measurable
// outcome. Fallbacks off, require_parameters on; every run records the
// serving provider. Campaign claims are scoped to glm-4.6 served by Venice
// fp4 and must not be generalized to bf16 or unpinned routing. See
// verification.md "Amendment A1".
export const PINNED_PROVIDER = {
  order: ["venice"],
  allow_fallbacks: false,
  require_parameters: true,
  quantizations: ["fp4"],
};

const CI_BASE = "e8ebb66";
const CI_HEAD = "9c49a0c";
const INSTRUMENT_SHA = "7c9c12f";
const PLAN_EXCLUDE = "context/changes/impl-review-ci-agent/plan.md";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
// Re-pointed (archived campaign → archived R5 → this change) to the R2
// escalation re-run per the successor-change discipline. Only ci.md was
// re-frozen here: rung `rloc` and variant `instrument` stay advertised, but
// their frozen inputs (rloc-context.txt, instrument.md) live in the archive —
// a successor change must re-freeze them byte-identical into ITS OWN change
// dir (sha256-pinned in its verification.md, the ci.md precedent) before
// using those modes. The rloc guard below and the grader's ground-truth check
// both fail fast with this discipline (impl-review F2).
const changeDir = `${repoRoot}context/changes/r2-prose-rerun`;
const resultsDir = `${changeDir}/results`;
const RLOC_CONTEXT_PATH = `${changeDir}/ground-truth/rloc-context.txt`;

const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 60 * 1024 * 1024 });

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const args = { variant: undefined, rung: "base", n: 1, dry: false, preNote: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--variant") args.variant = argv[++i];
    else if (a === "--rung") args.rung = argv[++i];
    else if (a === "--n") args.n = Number(argv[++i]);
    else if (a === "--dry") args.dry = true;
    else if (a === "--pre-note") args.preNote = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (args.variant !== "ci" && args.variant !== "instrument") {
    throw new Error(`--variant must be ci|instrument, got: ${String(args.variant)}`);
  }
  if (!["base", "r1", "r2", "r3", "rloc"].includes(args.rung)) {
    throw new Error(`--rung must be base|r1|r2|r3|rloc, got: ${String(args.rung)}`);
  }
  if (args.rung !== "base" && args.variant !== "ci") {
    throw new Error("rungs r1/r2/r3/rloc are defined for --variant ci only (plan.md)");
  }
  if (!Number.isSafeInteger(args.n) || args.n < 1) {
    throw new Error(`--n must be a positive integer, got: ${String(args.n)}`);
  }
  if (args.n > MAX_ARM_ATTEMPTS) {
    throw new Error(
      `--n must be ≤ ${String(MAX_ARM_ATTEMPTS)} — no pre-registered arm exceeds it ` +
        "(baselines n=20, screens n=8, top-ups +12; plan.md ceilings)",
    );
  }
  return args;
}

/** Write via a temp file + rename so a checkpoint is never half-written. */
function writeFileAtomic(path, data) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

// ---------------------------------------------------------------------------
// Input construction (recipes + rung ablations)
// ---------------------------------------------------------------------------

function recipeArgs(variant, rung) {
  if (variant === "instrument") {
    return ["diff", `${INSTRUMENT_SHA}^1`, INSTRUMENT_SHA, "--", ".", ":(exclude,glob)**/reviews/*.md"];
  }
  const base = [
    "diff",
    `${CI_BASE}...${CI_HEAD}`,
    "--",
    ".",
    ":(exclude,glob)**/reviews/*.md",
    `:(exclude)${PLAN_EXCLUDE}`,
  ];
  if (rung === "r2") base.push(":(exclude)context/**");
  if (rung === "r3") base.push(":(exclude)packages/**", ":(exclude).github/**");
  return base;
}

// computeFileSegments / computeManifest formerly lived here; they are now
// imported from ../src/pipeline.js (change r5-finder-truncation-note) so
// production's truncation note and this instrument share one implementation.

/**
 * The exact ReviewUnit the paid finder call receives (r5 plan-review F6):
 * extracted and hermetically tested so provenance can DERIVE noteActive from
 * the unit instead of asserting it. Truncation facts come from the probe's
 * own manifest — the same computeManifest production's truncationReport uses.
 */
export function buildProbeReviewUnit(sent, manifest) {
  return {
    kind: "diff",
    diff: sent,
    ...(manifest.truncated
      ? {
          truncated: true,
          ...(manifest.cutFile === null || manifest.cutFile === undefined ? {} : { cutFile: manifest.cutFile }),
          overCapFiles: manifest.overCap,
        }
      : {}),
  };
}

function buildInput(variant, rung) {
  const raw = git(...recipeArgs(variant, rung));
  let sent;
  let capBytes;
  if (rung === "r1") {
    sent = raw;
    capBytes = null;
  } else {
    sent = capDiff(raw).diff;
    capBytes = DIFF_CAP_BYTES;
  }
  let rlocContext = null;
  if (rung === "rloc") {
    let block;
    try {
      block = readFileSync(RLOC_CONTEXT_PATH, "utf8");
    } catch {
      throw new Error(
        `rloc needs the frozen off-diff-definitions block at ${RLOC_CONTEXT_PATH} ` +
          "(authored in Phase 2's rung ground-truth freeze).",
      );
    }
    const wrapped = `\n\n<off-diff-context>\n${block}\n</off-diff-context>\n`;
    // Labeled manifest entry (review F7): the injected block is part of the
    // window the model saw, so it carries its own byte range + hash. Offsets
    // are relative to the SENT input (post-cap) — unlike the raw-diff-relative
    // window segments.
    const sentStartByte = new TextEncoder().encode(sent).length;
    const bytes = new TextEncoder().encode(wrapped).length;
    rlocContext = {
      label: "injected off-diff-context block (ground-truth/rloc-context.txt)",
      sentStartByte,
      sentEndByte: sentStartByte + bytes,
      bytes,
      sha256: createHash("sha256").update(wrapped, "utf8").digest("hex"),
    };
    sent = sent + wrapped;
  }
  // Trusted rules pinned to the variant's historical base — deterministic,
  // unlike finder-distribution.mjs's floating origin/master read. Fail CLOSED
  // (review F2): reviewing without the rules the historical runs saw would
  // silently change the finder's behavior mid-campaign.
  const rulesRef = variant === "ci" ? CI_BASE : `${INSTRUMENT_SHA}^1`;
  let projectContext;
  try {
    projectContext = git("show", `${rulesRef}:.github/ai-review-rules.md`);
  } catch (error) {
    throw new Error(
      `cannot load pinned rules ${rulesRef}:.github/ai-review-rules.md — ` +
        `refusing to run without them: ${String(error?.message)}`,
    );
  }
  const manifest = {
    variant,
    rung,
    recipe: recipeArgs(variant, rung).join(" "),
    rawBytes: new TextEncoder().encode(raw).length,
    sentBytes: new TextEncoder().encode(sent).length,
    inputSha256: createHash("sha256").update(sent, "utf8").digest("hex"),
    rulesRef,
    rulesChars: projectContext.length,
    rulesSha256: createHash("sha256").update(projectContext, "utf8").digest("hex"),
    // Binds EVERY model-visible input (diff window + rules) into one identity
    // the grader can cross-check (review F2).
    inputsSha256: createHash("sha256")
      .update(sent, "utf8")
      .update("\0", "utf8")
      .update(projectContext, "utf8")
      .digest("hex"),
    rlocContext,
    model: FINDER_MODEL,
    ...computeManifest(raw, capBytes),
  };
  return { sent, projectContext, manifest };
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

const summarise = (findings) => {
  const bySeverity = {};
  const byCategory = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  }
  return { n: findings.length, bySeverity, byCategory };
};

async function main() {
  const { variant, rung, n, dry, preNote } = parseArgs(process.argv.slice(2));
  const { sent, projectContext, manifest } = buildInput(variant, rung);
  // Provenance binds the intervention (r5 plan-review F6): the unit is the
  // exact one the paid call receives, noteActive is DERIVED from it, and
  // promptSha256 hashes the complete rendered model-visible prompt
  // (instructions + user prompt) alongside the intentionally unchanged
  // inputSha256.
  //
  // --pre-note (change r2-prose-rerun): builds the unit WITHOUT truncation
  // facts, which by the production prompt contract ("untruncated prompt stays
  // byte-identical to the pre-note prompt", prompts.test.ts) renders exactly
  // what pre-R5 arms saw — required for a run that must combine with a screen
  // recorded before the truncation note existed. noteActive then derives as
  // false, so provenance states the prompt regime instead of asserting it.
  const reviewUnit = preNote ? { kind: "diff", diff: sent } : buildProbeReviewUnit(sent, manifest);
  const noteActive = reviewUnit.truncated === true;
  const promptSha256 = createHash("sha256")
    .update(
      buildInstructions("general", { fileContextTool: false, projectContext: projectContext || undefined }) +
        "\n\n" +
        buildPrompt(reviewUnit),
      "utf8",
    )
    .digest("hex");
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");

  mkdirSync(resultsDir, { recursive: true });

  if (dry) {
    const outPath = `${resultsDir}/${variant}-${rung}-dry-manifest.json`;
    writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(JSON.stringify({ sentBytes: manifest.sentBytes, rawBytes: manifest.rawBytes }, null, 2));
    console.log(`\nwindow (${String(manifest.window.length)} files, cut=${String(manifest.cutFile)}):`);
    for (const f of manifest.window) console.log(`  ${f.complete ? " " : "✂"} ${f.path}`);
    console.log(`overCap (${String(manifest.overCap.length)}): ${manifest.overCap.join(", ")}`);
    console.log(`\nmanifest → ${outPath}`);
    return;
  }

  const runs = [];
  const base = `${resultsDir}/${variant}-${rung}-n${String(n)}-${stamp}`;
  writeFileSync(`${base}-manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  // Checkpoint after EVERY paid attempt (review F3): an interruption must not
  // lose completed attempts — they count against the 140-attempt ceiling
  // whether or not they reach disk.
  const checkpoint = (complete) =>
    writeFileAtomic(
      `${base}.json`,
      JSON.stringify(
        {
          variant,
          rung,
          model: FINDER_MODEL,
          stamp,
          inputSha256: manifest.inputSha256,
          rulesSha256: manifest.rulesSha256,
          inputsSha256: manifest.inputsSha256,
          plannedAttempts: n,
          complete,
          runs,
        },
        null,
        2,
      ) + "\n",
    );
  for (let i = 1; i <= n; i += 1) {
    // Pipeline telemetry convention (review F4): assign only what the
    // provider actually reported — `?? 0` would make a telemetry failure
    // look like free spend. Unreported metrics never create their key.
    const usage = { steps: 0 };
    const accumulate = (key, next) => {
      if (next === undefined) return;
      usage[key] = (usage[key] ?? 0) + next;
    };
    let servedBy = null;
    const onStepEnd = (step) => {
      usage.steps += 1;
      accumulate("inputTokens", step.usage?.inputTokens);
      accumulate("outputTokens", step.usage?.outputTokens);
      accumulate("totalTokens", step.usage?.totalTokens);
      const cost = asStepCost(step.providerMetadata);
      if (cost === undefined) usage.costUnknownSteps = (usage.costUnknownSteps ?? 0) + 1;
      else usage.cost = (usage.cost ?? 0) + cost;
      // Amendment A1: record which upstream actually served the call.
      const provider = step.providerMetadata?.openrouter?.provider;
      if (typeof provider === "string" && provider !== "") servedBy = provider;
    };
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    const record = {
      run: i,
      startedAt,
      durationMs: 0,
      // Immutable per-run provenance (review F5): identifies the run's exact
      // input even if this record is later separated from its results file.
      provenance: {
        model: FINDER_MODEL,
        variant,
        rung,
        inputSha256: manifest.inputSha256,
        sentBytes: manifest.sentBytes,
        noteActive,
        promptSha256,
      },
      provider: null,
      usage,
      findings: null,
      summary: null,
      error: null,
    };
    try {
      const { review } = createReviewer({
        model: FINDER_MODEL,
        projectContext: projectContext || undefined,
        providerRouting: PINNED_PROVIDER,
        onStepEnd,
      });
      const result = await review(reviewUnit, { timeoutMs: FINDER_TIMEOUT_MS });
      record.findings = result.findings;
      record.summary = summarise(result.findings);
    } catch (error) {
      // Raw-failure contract (review F4): keep the EXACT provider text —
      // never truncate — with explicit size metadata alongside.
      record.error = {
        name: String(error?.name),
        message: String(error?.message),
        ...(typeof error?.text === "string"
          ? { text: error.text, textBytes: new TextEncoder().encode(error.text).length }
          : {}),
      };
    }
    record.durationMs = Math.round(performance.now() - t0);
    record.provider = servedBy;
    runs.push(record);
    checkpoint(false);
    const tag = record.error ? `FAILED ${record.error.name}` : `n=${String(record.summary.n)}`;
    const costTag = usage.cost === undefined ? "unknown" : `$${usage.cost.toFixed(6)}`;
    const tokensTag = usage.totalTokens === undefined ? "unknown" : String(usage.totalTokens);
    console.log(
      `run ${String(i)}/${String(n)}: ${tag}  provider=${servedBy ?? "unknown"} cost=${costTag} tokens=${tokensTag} ${String(record.durationMs)}ms`,
    );
  }

  checkpoint(true);
  const paid = runs.length;
  const failed = runs.filter((r) => r.error).length;
  const totalKnownCost = runs.reduce((sum, r) => sum + (r.usage.cost ?? 0), 0);
  const unknownSteps = runs.reduce((sum, r) => sum + (r.usage.costUnknownSteps ?? 0), 0);
  console.log(
    `\n${String(paid)} attempts (${String(failed)} failed) — total cost ` +
      `${unknownSteps > 0 ? "≥" : ""}$${totalKnownCost.toFixed(6)}` +
      `${unknownSteps > 0 ? ` (${String(unknownSteps)} steps reported no cost)` : ""}`,
  );
  console.log(`results  → ${base}.json`);
  console.log(`manifest → ${base}-manifest.json`);
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
