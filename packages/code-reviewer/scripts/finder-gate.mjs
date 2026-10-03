// Gate runner for change `finder-model-swap` (plan.md, Phases 1–2; the sealed
// protocol is context/changes/finder-model-swap/gate.md). First written for
// `finder-serialization-outage`, whose gate measured `z-ai/glm-4.6` endpoints.
//
// PAID. Runs the production finder (`createReviewer`, two stages, reasoning
// off, the finder's own routing) on one diff, pinned to ONE endpoint through
// OPENROUTER_FINDER_PROVIDERS, exactly as the gate prescribes. Writes one JSONL
// line per ATTEMPT — never per successful row — so every 429, timeout and
// FinderOutputError counts against the gate (lesson "a guard metric that only
// exists on success cannot detect failure").
//
// Retries as in production (gate.md §4, owner 2026-10-03): one attempt is one
// production pass, including production's single transient retry —
// `withOneRetry` from src/retry.ts (429, 5xx or timeout; one retry; the same
// header-aware delay). FinderOutputError is never retried. Every retry is in
// the attempt's record (`retries`), and the requests of both tries stay in
// `requests`, so cost, latency, provider and A3 checks cover the retry too. No
// other re-run exists.
//
// Each attempt is checked, request by request, for:
//   - the serving provider: every request must report the pinned endpoint's
//     name; a missing or different name INVALIDATES the attempt;
//   - reasoning (Amendment A3): any reasoning token or reasoning text means
//     `reasoning: {enabled: false}` did not take effect, and the attempt fails;
//   - cost: a request without a provider-reported cost leaves the attempt's
//     cost incomplete, which G4 treats as a failure, never as free.
//
// The rejected text of a FinderOutputError goes into the JSONL (a local file,
// not a public log), with the full findings of every valid attempt for the
// owner's hand-read (G3).
//
// Usage (from packages/code-reviewer):
//   npx tsx --env-file=.env scripts/finder-gate.mjs --model <id> --endpoint <slug> \
//     --case <name> --diff <diff> --rules <rules.md> --source-root <dir> \
//     --n <total> --out <series.jsonl> [--max-spend <usd>] [--through <k>] \
//     [--start <k> --append]
//
// `--max-spend` stops the series BEFORE an attempt once the series' own
// reported spend has reached the limit; the attempts not run are recorded as
// `not-run (budget)` in the summary, never silently dropped. `--through <k>`
// stops after attempt k and leaves the rest unrecorded (the A3 probe is G2
// attempt 01). `--start k --append` runs exactly the attempts not yet recorded.
import { appendFileSync, existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";

import {
  assertSeriesWritable,
  classify,
  evaluateAttempt,
  parseGateArgs,
  reasoningTokensOf,
  runAttempt,
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

const { resolveFinderProviderRouting } = await import("../src/config.ts");
const { DEFAULT_FINDER_MAX_STEPS } = await import("../src/cli.ts");
const { FinderOutputError } = await import("../src/output-repair.ts");
const { DEFAULT_FINDER_TIMEOUT_MS, describeFinderStep } = await import("../src/pipeline.ts");
const { createReviewer } = await import("../src/reviewer.ts");
const { createDiffScopedSourceForDiff } = await import("../src/source-provider.ts");

const { model, endpoint, expectedName, caseName, n, out, maxSpend, start, through, append } = opts;
const diff = readFileSync(opts.diffPath, "utf8");
const rules = readFileSync(opts.rulesPath, "utf8");

// Pin through the production mechanism, then confirm the routing it produced:
// a malformed value would silently fall back to the default list.
process.env.OPENROUTER_FINDER_PROVIDERS = endpoint;
const routing = resolveFinderProviderRouting();
if (JSON.stringify(routing.only) !== JSON.stringify([endpoint]) || routing.require_parameters !== true) {
  throw new Error(`routing did not pin ${endpoint}: ${JSON.stringify(routing)}`);
}

const source = createDiffScopedSourceForDiff({
  diff,
  root: opts.sourceRoot,
  readFile: (path) => readFileSync(path, "utf8"),
  realpath: (path) => realpathSync(path),
  isRegularFile: (path) => statSync(path).isFile(),
});
if (source === undefined) throw new Error("the diff declares no post-change paths; the tool could serve nothing");

assertSeriesWritable({ append, start, existingText: existsSync(out) ? readFileSync(out, "utf8") : undefined, out });
if (!append) writeFileSync(out, "");
let seriesSpend = 0;
let seriesRetries = 0;
const summary = { model, endpoint, case: caseName, n, start, through, outcomes: {}, notRun: 0 };

for (let i = start; i <= through; i += 1) {
  const id = `${endpoint}-${caseName}-${String(i).padStart(2, "0")}`;
  if (seriesSpend >= maxSpend) {
    summary.notRun += 1;
    console.log(`${id}: not-run (budget: series spend $${seriesSpend.toFixed(6)} >= $${String(maxSpend)})`);
    continue;
  }
  const requests = [];
  let repairs = 0;
  const reviewer = createReviewer({
    model,
    projectContext: rules,
    source,
    maxSteps: DEFAULT_FINDER_MAX_STEPS,
    onStepEnd: (step) => {
      const info = describeFinderStep(step);
      requests.push({
        provider: info.provider ?? null,
        finishReason: info.finishReason,
        cost: info.cost ?? null,
        toolCalls: info.toolCalls,
        fileContextCalls: info.fileContextCalls,
        inputTokens: info.usage.inputTokens ?? null,
        outputTokens: info.usage.outputTokens ?? null,
        reasoningTokens: reasoningTokensOf(step),
        reasoningTextChars: typeof step.reasoningText === "string" ? step.reasoningText.length : 0,
      });
    },
    onOutputRepair: () => {
      repairs += 1;
    },
  });

  const started = Date.now();
  const { result, error, retries } = await runAttempt(() =>
    reviewer.review({ kind: "diff", diff }, { timeoutMs: DEFAULT_FINDER_TIMEOUT_MS }),
  );
  const latencyMs = Date.now() - started;
  const outcome = error === undefined ? (repairs === 0 ? "valid" : "valid-after-repair") : classify(error);

  const { providerMismatch, invalidated, reasoningLeak, cost, costComplete, g1Pass } = evaluateAttempt({
    requests,
    outcome,
    expectedName,
  });
  seriesSpend += cost;
  seriesRetries += retries.length;

  const findings = result?.findings ?? [];
  const bySeverity = {};
  for (const finding of findings) bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;

  const record = {
    id,
    model,
    endpoint,
    expectedProvider: expectedName,
    case: caseName,
    attempt: i,
    at: new Date(started).toISOString(),
    outcome,
    g1Pass,
    invalidated,
    providerMismatch,
    reasoningLeak,
    repairs,
    retried: retries.length > 0,
    retries,
    requests,
    cost,
    costComplete,
    latencyMs,
    findingCount: result === undefined ? null : findings.length,
    bySeverity,
    ...(result === undefined ? {} : { summary: result.summary, findings }),
    ...(error === undefined
      ? {}
      : {
          error: {
            class: outcome,
            message: error instanceof Error ? error.message : String(error),
            ...(error instanceof FinderOutputError
              ? {
                  rejectedText: error.text,
                  validationError: error.validationError,
                  repaired: error.repaired,
                  finishReason: error.finishReason ?? null,
                  provider: error.provider ?? null,
                }
              : {}),
          },
        }),
  };
  appendFileSync(out, `${JSON.stringify(record)}\n`);
  summary.outcomes[outcome] = (summary.outcomes[outcome] ?? 0) + 1;
  console.log(
    `${id}: ${outcome}${invalidated ? " INVALIDATED" : ""}${reasoningLeak ? " REASONING" : ""} ` +
      `retries=${String(retries.length)} requests=${String(requests.length)} ` +
      `providers=${requests.map((r) => r.provider ?? "?").join(",")} ` +
      `findings=${result === undefined ? "-" : String(findings.length)} cost=$${cost.toFixed(6)}` +
      `${costComplete ? "" : " (cost incomplete)"} ${String(latencyMs)}ms` +
      `${error === undefined ? "" : ` :: ${(error instanceof Error ? error.message : String(error)).slice(0, 160)}`}`,
  );
}

summary.unrecorded = n - through;
summary.seriesSpend = seriesSpend;
summary.seriesRetries = seriesRetries;
console.log(`SUMMARY ${JSON.stringify(summary)}`);
