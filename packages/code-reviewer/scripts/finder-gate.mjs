// Gate runner for change `finder-verification` (plan.md Phase 2 §1; the sealed
// protocol is context/changes/finder-verification/gate.md). First written for
// `finder-serialization-outage`, then used by `finder-model-swap` to measure the
// finder alone.
//
// PAID. One attempt is one PRODUCTION pass over the requested stages:
//   --stages finder,verifier        the finder, then runVerificationPass (G2);
//   --stages finder,verifier,judge  runReviewPipeline (the PR series).
// The finder is pinned to ONE endpoint through OPENROUTER_FINDER_PROVIDERS and
// the verifier to one through OPENROUTER_VERIFIER_PROVIDERS, exactly as the gate
// prescribes; the judge is production's, unchanged. Writes one JSONL line per
// ATTEMPT — never per successful row — so every 429, timeout and output error
// counts against the gate (lesson "a guard metric that only exists on success
// cannot detect failure").
//
// Retries as in production: the pipeline's single transient retry per pass,
// and nothing else. There is NO outer retry here (plan.md, Critical
// Implementation Details), so an attempt can never get two; every retry is in
// the record (`retries`), and the requests of both tries stay in `requests`.
//
// The verifier's reader is ALWAYS built from --source-root (the same root as
// the finder's source) and `requireVerification` is ALWAYS true (plan-review
// re-run F3): an attempt can never take R8's local pass-through. A verification
// status other than `verified` / `no-findings`, or the abort for an unusable
// source, is a MEASUREMENT ERROR (gate.md §5), never a model result.
//
// Each attempt is checked, request by request (finder-gate-core.mjs,
// evaluateAttempt): provider and A3 GATED on the finder and the verifier,
// REPORTED for the judge; cost complete only when every request reported one
// and every pass that was called left a priced request; verifier and judge
// timeouts counted, retried ones included (R3).
//
// Usage (from packages/code-reviewer):
//   npx tsx --env-file=.env scripts/finder-gate.mjs --stages <finder,verifier[,judge]> \
//     --model <id> --endpoint <slug> --verifier-model <id> --verifier-endpoint <slug> \
//     --case <name> --diff <diff> --rules <rules.md> --source-root <dir> \
//     --n <total> --out <series.jsonl> --max-spend <usd> [--through <k>] \
//     [--start <k> --append]
//
// `--max-spend` is REQUIRED (impl-review phase 2 F8) and caps the WHOLE series:
// it stops the series BEFORE an attempt once the series' reported spend — every
// finder, verifier and judge request, including the attempts an earlier
// invocation recorded in the file (F2) — has reached the limit; the attempts
// not run are recorded as `not-run (budget)` in the summary, never silently
// dropped. The first measurement error stops the series (F3): the remaining
// attempts are `not-run (measurement error)`. `--through <k>` stops after
// attempt k and leaves the rest unrecorded (the A3 probe is G2 attempt 01).
// `--start k --append` continues the series at exactly max(recorded) + 1, and
// only with the same stages, models, endpoints, case, n and inputs (the sha256
// of the diff and the rules, and the source root's git tree; F4) and the same
// code under test (the sealed hashes of verifier-prompt-hash.mjs and the git
// tree of packages/code-reviewer/src; impl-review a8844a6 F3): every line
// carries all of them. A `started` line goes into the file BEFORE each paid
// call, so an attempt the process did not survive is visible as started and
// never finished — it counts as failed, with incomplete cost, and is never
// re-run (impl-review-phase-1 F1). The SUMMARY's `gates` is the verdict of the
// whole series, never of one invocation (F2).
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertSeriesWritable,
  committedTreeOf,
  parseGateArgs,
  runGateAttempt,
  runSeries,
  seriesIdentity,
  sha256Hex,
} from "./finder-gate-core.mjs";

// The command line is checked before the reviewer's module graph loads, so a
// bad invocation fails fast and names the flag.
let opts;
try {
  opts = parseGateArgs(process.argv.slice(2));
} catch (error) {
  console.error(`finder-gate: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

const { resolveFinderProviderRouting, resolveVerifierProviderRouting } = await import("../src/config.ts");
const { DEFAULT_FINDER_MAX_STEPS } = await import("../src/cli.ts");
const { FinderOutputError } = await import("../src/output-repair.ts");
const pipeline = await import("../src/pipeline.ts");
const { createReviewer } = await import("../src/reviewer.ts");
const { createVerifier, VerifierOutputError } = await import("../src/verifier.ts");
const { createJudge } = await import("../src/judge.ts");
const { assignFindingIds } = await import("../src/scorecard.ts");
const { mergeFindings } = await import("../src/findings.ts");
const { createDiffScopedReaderForDiff, createDiffScopedSourceForDiff } = await import("../src/source-provider.ts");
const { computeVerifierPromptHashes } = await import("./verifier-prompt-hash.mjs");

const {
  stages,
  model,
  endpoint,
  expectedName,
  verifierModel,
  verifierEndpoint,
  expectedVerifierName,
  caseName,
  n,
  out,
  maxSpend,
  start,
  through,
  append,
} = opts;
const diff = readFileSync(opts.diffPath, "utf8");
const rules = readFileSync(opts.rulesPath, "utf8");

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const PACKAGE_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

// Pin through the production mechanism, then confirm the routing it produced:
// a malformed value would silently fall back to the default list.
process.env.OPENROUTER_FINDER_PROVIDERS = endpoint;
process.env.OPENROUTER_VERIFIER_PROVIDERS = verifierEndpoint;
for (const [label, routing, slug] of [
  ["finder", resolveFinderProviderRouting(), endpoint],
  ["verifier", resolveVerifierProviderRouting(), verifierEndpoint],
]) {
  if (JSON.stringify(routing.only) !== JSON.stringify([slug]) || routing.require_parameters !== true) {
    throw new Error(`${label} routing did not pin ${slug}: ${JSON.stringify(routing)}`);
  }
}

const fsIo = {
  readFile: (path) => readFileSync(path, "utf8"),
  realpath: (path) => realpathSync(path),
  isRegularFile: (path) => statSync(path).isFile(),
};
const source = createDiffScopedSourceForDiff({ diff, root: opts.sourceRoot, ...fsIo });
if (source === undefined) throw new Error("the diff declares no post-change paths; the tool could serve nothing");
// The verifier's reader: the same root and allowlist as the finder's source.
const reader = createDiffScopedReaderForDiff({ diff, root: opts.sourceRoot, ...fsIo });
if (reader === undefined) throw new Error("the diff declares no post-change paths; the verifier could read nothing");

const api = {
  runReviewPipeline: pipeline.runReviewPipeline,
  runVerificationPass: pipeline.runVerificationPass,
  capDiff: pipeline.capDiff,
  orderDiffForCap: pipeline.orderDiffForCap,
  capProjectContext: pipeline.capProjectContext,
  resolveTimeouts: pipeline.resolveTimeouts,
  createReviewer,
  createVerifier,
  createJudge,
  assignFindingIds,
  mergeFindings,
};
const timeouts = {
  finderTimeoutMs: pipeline.DEFAULT_FINDER_TIMEOUT_MS,
  verifierTimeoutMs: pipeline.DEFAULT_VERIFIER_TIMEOUT_MS,
};

const inputs = {
  diffSha256: sha256Hex(diff),
  rulesSha256: sha256Hex(rules),
  sourceRootTree: committedTreeOf({ git, dir: opts.sourceRoot, label: "--source-root" }),
  // The code under test (impl-review a8844a6 F3): the sealed hashes, imported
  // from verifier-prompt-hash.mjs, and the committed tree of the package's
  // src/ — uncommitted changes there refuse, as under the source root.
  packageSrcTree: committedTreeOf({ git, dir: PACKAGE_SRC, label: "packages/code-reviewer/src" }),
  codeHashes: computeVerifierPromptHashes(),
};
const series = assertSeriesWritable({
  append,
  start,
  existingText: existsSync(out) ? readFileSync(out, "utf8") : undefined,
  out,
  stages,
  model,
  endpoint,
  verifierModel,
  verifierEndpoint,
  caseName,
  n,
  inputs,
});
if (!append) writeFileSync(out, "");
const identity = seriesIdentity({ stages, model, endpoint, verifierModel, verifierEndpoint, caseName, n, inputs });
// The commit the source root was checked out at, on every line for the record.
// The identity pins the source TREE, not the commit (see committedTreeOf).
const sourceRootHead = git(opts.sourceRoot, "rev-parse", "HEAD");

const errorDetail = (error) => ({
  message: error instanceof Error ? error.message : String(error),
  ...(error instanceof FinderOutputError || error instanceof VerifierOutputError
    ? {
        rejectedText: error.text,
        validationError: error.validationError,
        repaired: error.repaired,
        finishReason: error.finishReason ?? null,
        provider: error.provider ?? null,
      }
    : {}),
});

const summary = await runSeries({
  identity,
  idPrefix: `${endpoint}-${verifierEndpoint}-${caseName}`,
  start,
  through,
  maxSpend,
  series,
  expected: { finder: expectedName, verifier: expectedVerifierName },
  hasJudge: stages.endsWith("judge"),
  runAttempt: () =>
    runGateAttempt({
      stages,
      api,
      diff,
      rules,
      source,
      reader,
      finderModel: model,
      verifierModel,
      finderMaxSteps: DEFAULT_FINDER_MAX_STEPS,
      timeouts,
    }),
  appendLine: (line) => appendFileSync(out, `${JSON.stringify({ ...line, sourceRootHead })}\n`),
  log: (line) => console.log(line),
  errorDetail,
});
console.log(`SUMMARY ${JSON.stringify(summary)}`);
