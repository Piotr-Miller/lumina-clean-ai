// Phase 4 gate runner for change `finder-serialization-outage` (plan.md,
// Phase 4; thresholds in context/changes/finder-serialization-outage/gate.md).
//
// PAID. Runs the production finder (`createReviewer`, two stages, reasoning
// off, the finder's own routing) N times on one diff, pinned to ONE endpoint
// through OPENROUTER_FINDER_PROVIDERS, exactly as the gate prescribes. Writes
// one JSONL line per ATTEMPT — never per successful row — so every 429,
// timeout and FinderOutputError counts against G1 (lesson "a guard metric that
// only exists on success cannot detect failure"). Nothing is retried: one
// attempt = one `review()` call.
//
// Each attempt is checked, request by request, for:
//   - the serving provider: every request must report the pinned endpoint's
//     name; a missing or different name INVALIDATES the attempt (gate.md,
//     "A request served by another provider invalidates the attempt");
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
//   npx tsx --env-file=.env scripts/finder-gate.mjs --endpoint z-ai --case pr269 \
//     --diff <pr269.diff> --rules <rules.md> --source-root <worktree at fca2778> \
//     --n 10 --out <gate-z-ai-pr269.jsonl> [--max-spend 0.40]
//
// `--max-spend` stops the series BEFORE an attempt once the series' own
// reported spend has reached the limit; the attempts not run are recorded as
// `not-run (budget)` in the summary, never silently dropped; `--start k --append`
// runs exactly those attempts later.
import { appendFileSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";

import { resolveFinderProviderRouting } from "../src/config.ts";
import { DEFAULT_FINDER_MAX_STEPS } from "../src/cli.ts";
import { FinderOutputError } from "../src/output-repair.ts";
import { DEFAULT_FINDER_TIMEOUT_MS, describeFinderStep } from "../src/pipeline.ts";
import { createReviewer } from "../src/reviewer.ts";
import { createDiffScopedSourceForDiff } from "../src/source-provider.ts";

// The routing slug and the name OpenRouter reports as the serving provider
// differ in notation (`z-ai` is served as `Z.AI`; observed in the Phase 2
// captures). Exact match against this table, nothing looser: an unknown slug
// is a usage error, not a guess.
export const ENDPOINT_NAMES = { "z-ai": "Z.AI", novita: "Novita", deepinfra: "DeepInfra", venice: "Venice" };

const MODEL = "z-ai/glm-4.6";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const required = (name) => {
  const value = flag(name);
  if (value === undefined) throw new Error(`missing ${name}`);
  return value;
};

const endpoint = required("--endpoint");
const expectedName = ENDPOINT_NAMES[endpoint];
if (expectedName === undefined) throw new Error(`unknown endpoint slug ${JSON.stringify(endpoint)}`);
const caseName = required("--case");
const diff = readFileSync(required("--diff"), "utf8");
const rules = readFileSync(required("--rules"), "utf8");
const sourceRoot = required("--source-root");
const n = Number(required("--n"));
if (!Number.isSafeInteger(n) || n < 1) throw new Error("--n must be a positive integer");
const out = required("--out");
const maxSpend = flag("--max-spend") === undefined ? Infinity : Number(flag("--max-spend"));
// `--start <k> --append` CONTINUES a series that `--max-spend` cut short: it
// runs attempts k..n and appends to the same file. It never re-runs an
// attempt that already has a record — continuation, not a retry.
const start = flag("--start") === undefined ? 1 : Number(flag("--start"));
if (!Number.isSafeInteger(start) || start < 1 || start > n) throw new Error("--start must be in 1..n");
const append = args.includes("--append");

// Pin through the production mechanism, then confirm the routing it produced:
// a malformed value would silently fall back to the default list.
process.env.OPENROUTER_FINDER_PROVIDERS = endpoint;
const routing = resolveFinderProviderRouting();
if (JSON.stringify(routing.only) !== JSON.stringify([endpoint]) || routing.require_parameters !== true) {
  throw new Error(`routing did not pin ${endpoint}: ${JSON.stringify(routing)}`);
}

const source = createDiffScopedSourceForDiff({
  diff,
  root: sourceRoot,
  readFile: (path) => readFileSync(path, "utf8"),
  realpath: (path) => realpathSync(path),
  isRegularFile: (path) => statSync(path).isFile(),
});
if (source === undefined) throw new Error("the diff declares no post-change paths; the tool could serve nothing");

const reasoningTokensOf = (step) => {
  const sdk = step.usage?.outputTokenDetails?.reasoningTokens;
  const raw = step.providerMetadata?.openrouter?.usage?.completionTokensDetails?.reasoningTokens;
  return { sdk: typeof sdk === "number" ? sdk : null, openrouter: typeof raw === "number" ? raw : null };
};

const classify = (error) => {
  if (error instanceof FinderOutputError) return "FinderOutputError";
  if (error?.name === "TimeoutError" || error?.cause?.name === "TimeoutError") return "timeout";
  const status = error?.statusCode;
  return typeof status === "number" ? `APICallError-${String(status)}` : `error-${error?.name ?? typeof error}`;
};

if (append) {
  const done = readFileSync(out, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line).attempt);
  const clash = done.filter((attempt) => attempt >= start);
  if (clash.length > 0)
    throw new Error(`attempts ${clash.join(", ")} already recorded in ${out}; refusing to re-run them`);
} else {
  if (start !== 1) throw new Error("--start without --append would discard the earlier attempts");
  writeFileSync(out, "");
}
let seriesSpend = 0;
const summary = { endpoint, case: caseName, n, outcomes: {}, notRun: 0 };

for (let i = start; i <= n; i += 1) {
  const id = `${endpoint}-${caseName}-${String(i).padStart(2, "0")}`;
  if (seriesSpend >= maxSpend) {
    summary.notRun += 1;
    console.log(`${id}: not-run (budget: series spend $${seriesSpend.toFixed(6)} >= $${String(maxSpend)})`);
    continue;
  }
  const requests = [];
  let repairs = 0;
  const reviewer = createReviewer({
    model: MODEL,
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
  let outcome;
  let result;
  let error;
  try {
    result = await reviewer.review({ kind: "diff", diff }, { timeoutMs: DEFAULT_FINDER_TIMEOUT_MS });
    outcome = repairs === 0 ? "valid" : "valid-after-repair";
  } catch (caught) {
    error = caught;
    outcome = classify(caught);
  }
  const latencyMs = Date.now() - started;

  const providerMismatch = requests.filter((r) => r.provider !== expectedName).map((r) => r.provider);
  const reasoningLeak = requests.some(
    (r) => (r.reasoningTokens.sdk ?? 0) > 0 || (r.reasoningTokens.openrouter ?? 0) > 0 || r.reasoningTextChars > 0,
  );
  const cost = requests.reduce((total, r) => total + (r.cost ?? 0), 0);
  const costComplete = requests.length > 0 && requests.every((r) => r.cost !== null);
  seriesSpend += cost;

  const findings = result?.findings ?? [];
  const bySeverity = {};
  for (const finding of findings) bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;

  // An attempt passes G1 only when it produced a valid object, every request
  // was served by the pinned endpoint, and reasoning stayed off.
  const invalidated = providerMismatch.length > 0;
  const g1Pass = !invalidated && !reasoningLeak && (outcome === "valid" || outcome === "valid-after-repair");

  const record = {
    id,
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
      `requests=${String(requests.length)} providers=${requests.map((r) => r.provider ?? "?").join(",")} ` +
      `findings=${result === undefined ? "-" : String(findings.length)} cost=$${cost.toFixed(6)}` +
      `${costComplete ? "" : " (cost incomplete)"} ${String(latencyMs)}ms` +
      `${error === undefined ? "" : ` :: ${(error instanceof Error ? error.message : String(error)).slice(0, 160)}`}`,
  );
}

summary.seriesSpend = seriesSpend;
console.log(`SUMMARY ${JSON.stringify(summary)}`);
