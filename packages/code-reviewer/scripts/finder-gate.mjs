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
//     --n <total> --out <series.jsonl> [--max-spend <usd>] [--through <k>] \
//     [--start <k> --append]
//
// `--max-spend` stops the series BEFORE an attempt once the series' own
// reported spend — every finder, verifier and judge request — has reached the
// limit; the attempts not run are recorded as `not-run (budget)` in the
// summary, never silently dropped. `--through <k>` stops after attempt k and
// leaves the rest unrecorded (the A3 probe is G2 attempt 01). `--start k
// --append` continues the series at exactly max(recorded) + 1, and only with
// the same stages, models, endpoints, case and n: every line carries all of
// them. A `started` line goes into the file BEFORE each paid call, so an attempt
// the process did not survive is visible as started and never finished — it
// counts as failed and is never re-run (impl-review-phase-1 F1).
import { appendFileSync, existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";

import {
  assertSeriesWritable,
  evaluateAttempt,
  parseGateArgs,
  runGateAttempt,
  summarizeSeries,
  verificationCounts,
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
});
if (!append) writeFileSync(out, "");
for (const attempt of series.interrupted) {
  console.log(`attempt ${String(attempt)}: started and never finished in an earlier run — counts as failed`);
}
const identity = { stages, model, endpoint, verifierModel, verifierEndpoint, case: caseName, n };
let seriesSpend = 0;
let seriesRetries = 0;
const evaluations = [];
const summary = {
  ...identity,
  start,
  through,
  outcomes: {},
  notRun: 0,
  interruptedBefore: series.interrupted,
};

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

for (let i = start; i <= through; i += 1) {
  const id = `${endpoint}-${verifierEndpoint}-${caseName}-${String(i).padStart(2, "0")}`;
  if (seriesSpend >= maxSpend) {
    summary.notRun += 1;
    console.log(`${id}: not-run (budget: series spend $${seriesSpend.toFixed(6)} >= $${String(maxSpend)})`);
    continue;
  }
  const started = Date.now();
  // Written before the call: if the process dies during the attempt, the file
  // still shows the attempt was started, and a continuation refuses to re-run it.
  appendFileSync(
    out,
    `${JSON.stringify({ kind: "started", id, ...identity, attempt: i, at: new Date(started).toISOString() })}\n`,
  );
  const attempt = await runGateAttempt({
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
  });
  const wallMs = Date.now() - started;
  const evaluation = evaluateAttempt({
    attempt,
    expected: { finder: expectedName, verifier: expectedVerifierName },
  });
  evaluations.push(evaluation);
  seriesSpend += evaluation.cost.total;
  seriesRetries += attempt.retries.length;

  const { result, error } = attempt;
  const record = {
    kind: "attempt",
    id,
    ...identity,
    expectedProvider: { finder: expectedName, verifier: expectedVerifierName },
    attempt: i,
    at: new Date(started).toISOString(),
    ...evaluation,
    wallMs,
    repairs: attempt.repairs,
    retried: attempt.retries.length > 0,
    retries: attempt.retries,
    calls: attempt.calls,
    requests: attempt.requests,
    preVerificationFindingCount: result?.preVerificationFindingCount ?? null,
    findingCount: result === undefined ? null : result.published.length,
    ...(result === undefined
      ? {}
      : {
          // `findings` = the PUBLISHED findings; the verification record holds
          // every pre-verification finding with its state (R4 matches on those).
          findings: result.published,
          verification: { ...result.verification, counts: verificationCounts(result.verification) },
          summary: result.summary,
          ...(result.verdict === undefined ? {} : { verdict: result.verdict, verdictReason: result.verdictReason }),
        }),
    ...(error === undefined ? {} : { error: { class: evaluation.outcome, ...errorDetail(error) } }),
  };
  appendFileSync(out, `${JSON.stringify(record)}\n`);
  summary.outcomes[evaluation.outcome] = (summary.outcomes[evaluation.outcome] ?? 0) + 1;
  const providers = (pass) =>
    attempt.requests
      .filter((r) => r.pass === pass)
      .map((r) => r.provider ?? "?")
      .join(",");
  console.log(
    `${id}: ${evaluation.outcome}${evaluation.measurementError === null ? "" : ` (${evaluation.measurementError})`}` +
      `${evaluation.invalidated ? " INVALIDATED" : ""}${evaluation.reasoningLeak ? " REASONING" : ""} ` +
      `retries=${String(attempt.retries.length)} requests=${String(attempt.requests.length)} ` +
      `finder=${providers("finder")} verifier=${providers("verifier") || "(not called)"}` +
      `${stages.endsWith("judge") ? ` judge=${providers("judge")}` : ""} ` +
      `findings=${result === undefined ? "-" : `${String(result.published.length)}/${String(result.preVerificationFindingCount)}`} ` +
      `cost=$${evaluation.cost.total.toFixed(6)}${evaluation.costComplete ? "" : " (cost incomplete)"} ${String(wallMs)}ms` +
      `${error === undefined ? "" : ` :: ${(error instanceof Error ? error.message : String(error)).slice(0, 160)}`}`,
  );
}

summary.unrecorded = n - through;
summary.seriesSpend = seriesSpend;
summary.seriesRetries = seriesRetries;
summary.gates = summarizeSeries(evaluations);
console.log(`SUMMARY ${JSON.stringify(summary)}`);
