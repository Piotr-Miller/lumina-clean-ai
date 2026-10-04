// Pure logic of the gate runner (changes `finder-model-swap` and
// `finder-verification`; protocol in context/changes/finder-verification/gate.md).
// Split out of finder-gate.mjs so it can be tested without a network or an API
// key: the runner itself only wires these functions to the real pipeline.
//
// Since `finder-verification` (plan.md Phase 2 §1) one attempt is one
// PRODUCTION pass over the requested stages: `finder,verifier` runs the finder
// and then `runVerificationPass` (G2); `finder,verifier,judge` runs
// `runReviewPipeline` (the PR series). The pipeline's own single transient
// retry per pass is the only retry: there is no outer retry here, so an attempt
// can never get two (plan.md, Critical Implementation Details).
//
// The only package import is retry.ts, which plain `node` can load (type
// stripping, no relative `.js` imports), so the runner can reject a bad
// command line before it loads the reviewer. The pipeline functions an attempt
// needs are INJECTED (`api`), which is also what lets the tests run hermetically.
import { withOneRetry } from "../src/retry.ts";

// The routing slug and the name OpenRouter reports as the serving provider
// differ in notation (`z-ai` is served as `Z.AI`). Exact match against this
// table, nothing looser: an unknown slug is a usage error, not a guess. The
// candidate names were read from GET /api/v1/models/<id>/endpoints on
// 2026-10-03 (gate.md §1). `openai/flex` and `openai/fast` also report
// `OpenAI`, so this check cannot tell service tiers apart; gate.md records how
// that is covered.
export const ENDPOINT_NAMES = {
  "z-ai": "Z.AI",
  novita: "Novita",
  deepinfra: "DeepInfra",
  venice: "Venice",
  openai: "OpenAI",
  alibaba: "Alibaba",
  minimax: "Minimax",
  // MAIN's verifier endpoint (`finder-verification` gate.md §1, read from the
  // public endpoints list on 2026-10-04).
  anthropic: "Anthropic",
};

/** The two stage sets a gate attempt may run (plan.md Phase 2 §1). */
export const STAGE_SETS = ["finder,verifier", "finder,verifier,judge"];

/** G4b ceiling: median total review cost per attempt, per PR series (R3, gate.md §4). */
export const G4B_CEILING = 0.063;

/**
 * Parses and validates the runner's command line. Throws a message naming the
 * offending flag. `--model` is required: there is no default model, so a gate
 * series can never silently measure the wrong one.
 */
export function parseGateArgs(args) {
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const required = (name) => {
    const value = flag(name);
    if (value === undefined) throw new Error(`missing ${name}`);
    return value;
  };

  // Checked first: an invocation that does not say which stages it measures
  // must fail naming --stages, before any other flag is read.
  const stages = required("--stages");
  if (!STAGE_SETS.includes(stages)) {
    throw new Error(`--stages must be one of ${STAGE_SETS.join(" | ")}, got ${JSON.stringify(stages)}`);
  }
  const model = required("--model");
  const endpoint = required("--endpoint");
  const expectedName = ENDPOINT_NAMES[endpoint];
  if (expectedName === undefined) throw new Error(`unknown endpoint slug ${JSON.stringify(endpoint)}`);
  const verifierModel = required("--verifier-model");
  const verifierEndpoint = required("--verifier-endpoint");
  const expectedVerifierName = ENDPOINT_NAMES[verifierEndpoint];
  if (expectedVerifierName === undefined) {
    throw new Error(`unknown --verifier-endpoint slug ${JSON.stringify(verifierEndpoint)}`);
  }
  const caseName = required("--case");
  const diffPath = required("--diff");
  const rulesPath = required("--rules");
  const sourceRoot = required("--source-root");
  const n = Number(required("--n"));
  if (!Number.isSafeInteger(n) || n < 1) throw new Error("--n must be a positive integer");
  const out = required("--out");
  const maxSpend = flag("--max-spend") === undefined ? Infinity : Number(flag("--max-spend"));
  if (Number.isNaN(maxSpend) || maxSpend < 0) throw new Error("--max-spend must be a non-negative number");
  // `--start <k> --append` CONTINUES a series: it runs attempts k..n (or
  // k..through) and appends to the same file. It never re-runs an attempt that
  // already has a record — continuation, not a retry.
  const start = flag("--start") === undefined ? 1 : Number(flag("--start"));
  if (!Number.isSafeInteger(start) || start < 1 || start > n) throw new Error("--start must be in 1..n");
  // `--through <k>` stops after attempt k and leaves k+1..n UNRECORDED, so the
  // A3 probe (G2 attempt 01) is attempt 01 of the one G2 series rather than a
  // sixth G2 attempt in a file of its own.
  const through = flag("--through") === undefined ? n : Number(flag("--through"));
  if (!Number.isSafeInteger(through) || through < start || through > n) {
    throw new Error("--through must be in start..n");
  }
  const append = args.includes("--append");
  if (!append && start !== 1) throw new Error("--start without --append would discard the earlier attempts");

  return {
    stages,
    model,
    endpoint,
    expectedName,
    verifierModel,
    verifierEndpoint,
    expectedVerifierName,
    caseName,
    diffPath,
    rulesPath,
    sourceRoot,
    n,
    out,
    maxSpend,
    start,
    through,
    append,
  };
}

/**
 * What makes two JSONL lines belong to the same series. Every line — the
 * `started` marker and the attempt record — carries all of it, so a
 * continuation can be checked against what was actually recorded rather than
 * against what the caller claims (impl-review-phase-1 F1: without `n` in the
 * file, `--n 6 --append` after a `--n 5` probe ran a sixth G2 attempt). The
 * stages and the verifier are part of it, so a CONTROL series can never be
 * continued as a MAIN one.
 */
export const seriesIdentity = ({ stages, model, endpoint, verifierModel, verifierEndpoint, caseName, n }) => ({
  stages,
  model,
  endpoint,
  verifierModel,
  verifierEndpoint,
  case: caseName,
  n,
});

const identityKey = (identity) => JSON.stringify(seriesIdentity({ ...identity, caseName: identity.case }));

/**
 * Reads a series file: one JSON object per line, either a `started` marker
 * (written BEFORE the paid call) or an attempt record (written after it). An
 * attempt with a marker and no record was interrupted — the process died
 * mid-attempt, after money may have been spent — and counts as a failed
 * attempt that is never re-run. Throws on a line it cannot parse: a corrupt
 * series must not be continued blind.
 */
export function readSeries(fileText) {
  const lines = fileText.split("\n").filter((line) => line !== "");
  const attempts = new Map();
  const identities = new Set();
  lines.forEach((line, index) => {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      throw new Error(`line ${String(index + 1)} is not JSON; refusing to continue a corrupt series`);
    }
    if (!Number.isSafeInteger(entry.attempt) || entry.attempt < 1) {
      throw new Error(`line ${String(index + 1)} has no attempt number; refusing to continue a corrupt series`);
    }
    identities.add(identityKey(entry));
    const state = attempts.get(entry.attempt) ?? { attempt: entry.attempt, started: false, completed: false };
    if (entry.kind === "started") state.started = true;
    else state.completed = true;
    attempts.set(entry.attempt, state);
  });
  const sorted = [...attempts.values()].sort((a, b) => a.attempt - b.attempt);
  return {
    lineCount: lines.length,
    identities: [...identities].map((key) => JSON.parse(key)),
    attempts: sorted,
    maxAttempt: sorted.length === 0 ? 0 : sorted[sorted.length - 1].attempt,
    interrupted: sorted.filter((a) => a.started && !a.completed).map((a) => a.attempt),
  };
}

/**
 * Throws unless the series file may be written, and returns the recorded
 * series state (empty for a fresh one) so the runner can report interrupted
 * attempts. A fresh series (no `--append`) goes only into a missing or empty
 * file — otherwise repeating, say, `--through 1` would silently overwrite and
 * re-run the A3 probe. A continuation must (1) be the same series: identical
 * model, endpoint, case AND n in every recorded line, so `--n 6` cannot add a
 * sixth attempt to a `--n 5` series and two series cannot share a file; and
 * (2) start exactly at max(recorded) + 1: lower would re-run a recorded or
 * interrupted attempt, higher would leave a gap no later run could fill.
 */
export function assertSeriesWritable({
  append,
  start,
  existingText,
  out,
  stages,
  model,
  endpoint,
  verifierModel,
  verifierEndpoint,
  caseName,
  n,
}) {
  const empty = { lineCount: 0, identities: [], attempts: [], maxAttempt: 0, interrupted: [] };
  if (!append) {
    if (existingText !== undefined && existingText !== "") {
      throw new Error(`${out} already holds a series; continue it with --start <k> --append, never overwrite it`);
    }
    return empty;
  }
  if (existingText === undefined) throw new Error(`--append needs an existing series file, ${out} does not exist`);
  const series = readSeries(existingText);
  if (series.lineCount === 0) throw new Error(`${out} is empty; start the series without --append`);

  const expected = seriesIdentity({ stages, model, endpoint, verifierModel, verifierEndpoint, caseName, n });
  const foreign = series.identities.filter((identity) => JSON.stringify(identity) !== JSON.stringify(expected));
  if (foreign.length > 0) {
    throw new Error(
      `${out} records a different series ${JSON.stringify(foreign[0])}, not ${JSON.stringify(expected)}; refusing to mix series`,
    );
  }

  const next = series.maxAttempt + 1;
  if (start < next) {
    const interrupted = series.interrupted.filter((attempt) => attempt >= start);
    const recorded = series.attempts.map((a) => a.attempt).filter((attempt) => attempt >= start);
    const detail =
      interrupted.length > 0
        ? `attempt ${interrupted.join(", ")} started and never finished — it counts as failed and is never re-run`
        : `attempts ${recorded.join(", ")} already recorded`;
    throw new Error(`${detail} in ${out}; refusing to re-run; continue with --start ${String(next)}`);
  }
  if (start > next) {
    throw new Error(
      `attempt ${String(next)} is unrecorded in ${out}; a continuation must start at ${String(next)}, not ${String(start)}`,
    );
  }
  return series;
}

export function reasoningTokensOf(step) {
  const sdk = step.usage?.outputTokenDetails?.reasoningTokens;
  const raw = step.providerMetadata?.openrouter?.usage?.completionTokensDetails?.reasoningTokens;
  return { sdk: typeof sdk === "number" ? sdk : null, openrouter: typeof raw === "number" ? raw : null };
}

// Matched by name, not instanceof, to keep this module free of the reviewer's
// import graph; output-repair.ts sets `name = "FinderOutputError"`.
export function classify(error) {
  if (error?.name === "FinderOutputError") return "FinderOutputError";
  if (error?.name === "TimeoutError" || error?.cause?.name === "TimeoutError") return "timeout";
  const status = error?.statusCode;
  return typeof status === "number" ? `APICallError-${String(status)}` : `error-${error?.name ?? typeof error}`;
}

/**
 * One request as the gate records it: the pass it belongs to, its serving
 * provider, cost and both reasoning channels. `null`, never a fabricated 0 or
 * a guessed provider, wherever the step reported nothing.
 */
export function describeRequest(pass, step) {
  const openrouter = step?.providerMetadata?.openrouter;
  const cost = openrouter?.usage?.cost;
  return {
    pass,
    // As asStepProvider / asStepCost (src/provider-metadata.ts): an empty name
    // or a non-finite cost is "not reported".
    provider: typeof openrouter?.provider === "string" && openrouter.provider !== "" ? openrouter.provider : null,
    finishReason: typeof step?.finishReason === "string" ? step.finishReason : null,
    cost: typeof cost === "number" && Number.isFinite(cost) ? cost : null,
    inputTokens: typeof step?.usage?.inputTokens === "number" ? step.usage.inputTokens : null,
    outputTokens: typeof step?.usage?.outputTokens === "number" ? step.usage.outputTokens : null,
    reasoningTokens: reasoningTokensOf(step ?? {}),
    reasoningTextChars: typeof step?.reasoningText === "string" ? step.reasoningText.length : 0,
  };
}

// The abort `runVerificationPass` throws under `requireVerification` when there
// is no usable source (R8; impl-review phase 1 F1). Matched by its message: the
// gate classifies it as a measurement error, never as a model failure.
const isVerificationAbort = (error) =>
  error instanceof Error && error.message.startsWith("Verification is required (--require-verification)");

/**
 * Runs ONE gate attempt and never throws: the outcome is data. Every pass is
 * built through a wrapped factory whose `onStepEnd` is chained, so each request
 * of each pass — both tries of a retried pass, the format repairs — lands in
 * `requests`; each CALL of a pass (one per try) lands in `calls` with its
 * outcome and duration, which is how a timeout that was then retried is still
 * counted (R3). The verifier's reader is always the one built from the source
 * root, and `requireVerification` is always true, so an attempt can never take
 * R8's local pass-through (plan-review re-run F3).
 *
 * `api` holds the production functions (see finder-gate.mjs); the tests pass
 * fakes. `stages` is one of STAGE_SETS.
 */
export async function runGateAttempt({
  stages,
  api,
  diff,
  rules,
  source,
  reader,
  finderModel,
  verifierModel,
  finderMaxSteps,
  timeouts = {},
  sleep,
}) {
  const requests = [];
  const calls = [];
  const retries = [];
  const repairs = { finder: 0, verifier: 0, judge: 0 };
  const onRetry = (pass) => (error, delayMs) => retries.push({ pass, class: classify(error), delayMs });

  // Wraps a production factory: chains its onStepEnd and onOutputRepair, and
  // times every call of the built pass.
  const wrap = (pass, factory, method) => (options) => {
    const built = factory({
      ...options,
      onStepEnd: (step) => {
        requests.push(describeRequest(pass, step));
        options.onStepEnd?.(step);
      },
      onOutputRepair: (detail) => {
        repairs[pass] += 1;
        options.onOutputRepair?.(detail);
      },
    });
    return {
      [method]: async (...args) => {
        const started = Date.now();
        try {
          const value = await built[method](...args);
          calls.push({ pass, outcome: "ok", ms: Date.now() - started });
          return value;
        } catch (error) {
          calls.push({ pass, outcome: classify(error), ms: Date.now() - started });
          throw error;
        }
      },
    };
  };
  const createFinder = wrap("finder", api.createReviewer, "review");
  const createVerifier = wrap("verifier", api.createVerifier, "verify");

  try {
    if (stages === "finder,verifier,judge") {
      const result = await api.runReviewPipeline({
        diff,
        projectReviewContext: rules,
        source,
        finderMaxSteps,
        reader,
        requireVerification: true,
        overrides: { reviewModel: finderModel, verifierModel },
        timeouts,
        onRetry: (pass, error, delayMs) => onRetry(pass)(error, delayMs),
        deps: {
          createFinder,
          createVerifier,
          createJudge: wrap("judge", api.createJudge, "judge"),
          ...(sleep === undefined ? {} : { retrySleep: sleep }),
        },
      });
      return {
        result: {
          published: result.findings,
          preVerificationFindingCount: result.preVerificationFindingCount,
          verification: result.verification,
          verdict: result.verdict,
          verdictReason: result.verdictReason,
          summary: result.summary,
        },
        requests,
        calls,
        retries,
        repairs,
      };
    }
    // `finder,verifier` (G2): the finder exactly as the pipeline builds and
    // calls it, then the pipeline's own verification pass.
    const finder = createFinder({
      model: finderModel,
      projectContext: api.capProjectContext(rules),
      source,
      maxSteps: source === undefined ? undefined : finderMaxSteps,
    });
    const { diff: capped } = api.capDiff(api.orderDiffForCap(diff));
    const review = await withOneRetry(
      () => finder.review({ kind: "diff", diff: capped }, { timeoutMs: timeouts.finderTimeoutMs }),
      { sleep, onRetry: onRetry("finder") },
    );
    const preVerification = api.assignFindingIds(api.mergeFindings(review.findings));
    const pass = await api.runVerificationPass({
      findings: preVerification,
      reader,
      requireVerification: true,
      model: verifierModel,
      createVerifier,
      timeoutMs: timeouts.verifierTimeoutMs,
      onRetry: onRetry("verifier"),
      sleep,
    });
    return {
      result: {
        published: pass.published,
        preVerificationFindingCount: preVerification.length,
        verification: pass.verification,
        summary: review.summary,
      },
      requests,
      calls,
      retries,
      repairs,
    };
  } catch (error) {
    return { error, requests, calls, retries, repairs };
  }
}

const PASSES = ["finder", "verifier", "judge"];
const sumBy = (items, pass, field) => items.filter((x) => x.pass === pass).reduce((t, x) => t + (x[field] ?? 0), 0);

/**
 * Judges one attempt from its requests and calls (plan.md Phase 2 §1;
 * Definitions: Valid attempt, Timeout, Incomplete cost, Measurement error).
 *
 * - GATED on the finder and the verifier: every request reports the expected
 *   provider (a missing or different name INVALIDATES the attempt), and no
 *   request carries reasoning tokens or text (A3).
 * - REPORTED ONLY for the judge: its providers and any reasoning. The judge is
 *   production's, unchanged and unpinned.
 * - Cost is complete when every request reported one AND every pass that was
 *   CALLED produced at least one request. A verifier that was never called
 *   (nothing to send) is complete; one that was called and left no priced
 *   request is not (owner, Phase 1 interpretation 6).
 * - A timeout is any verifier or judge CALL that hit its timeout, including one
 *   followed by a successful retry (R3).
 * - A verification status other than `verified` / `no-findings`, or the abort
 *   for an unusable source, is a MEASUREMENT ERROR: never a valid attempt and
 *   never a model failure.
 */
export function evaluateAttempt({ attempt, expected }) {
  const { requests, calls, error, result, repairs } = attempt;
  const gated = requests.filter((r) => r.pass === "finder" || r.pass === "verifier");
  const providerMismatch = gated
    .filter((r) => r.provider !== expected[r.pass])
    .map((r) => ({ pass: r.pass, provider: r.provider }));
  const leaks = (r) =>
    (r.reasoningTokens.sdk ?? 0) > 0 || (r.reasoningTokens.openrouter ?? 0) > 0 || r.reasoningTextChars > 0;
  const reasoningLeak = gated.some(leaks);
  const judgeRequests = requests.filter((r) => r.pass === "judge");
  const judge = {
    providers: judgeRequests.map((r) => r.provider),
    reasoning: judgeRequests.some(leaks),
  };

  const cost = { finder: 0, verifier: 0, judge: 0, total: 0 };
  for (const pass of PASSES) cost[pass] = sumBy(requests, pass, "cost");
  cost.total = cost.finder + cost.verifier + cost.judge;
  const calledPasses = [...new Set(calls.map((c) => c.pass))];
  const costComplete =
    requests.length > 0 &&
    requests.every((r) => r.cost !== null) &&
    calledPasses.every((pass) => requests.some((r) => r.pass === pass));
  const timeouts = {
    verifier: calls.filter((c) => c.pass === "verifier" && c.outcome === "timeout").length,
    judge: calls.filter((c) => c.pass === "judge" && c.outcome === "timeout").length,
  };
  const latencyMs = Object.fromEntries(
    PASSES.filter((pass) => calls.some((c) => c.pass === pass)).map((pass) => [pass, sumBy(calls, pass, "ms")]),
  );

  const status = result?.verification?.status;
  const measurementError =
    error !== undefined
      ? isVerificationAbort(error)
        ? "verification aborted: no usable source"
        : null
      : status === "verified" || status === "no-findings"
        ? null
        : `verification status ${JSON.stringify(status ?? null)}`;

  const failedCall = calls.findLast((c) => c.outcome !== "ok");
  const anyRepair = repairs.finder + repairs.verifier + repairs.judge > 0;
  const outcome =
    measurementError !== null
      ? "measurement-error"
      : error !== undefined
        ? `${failedCall?.pass ?? "pipeline"}:${classify(error)}`
        : anyRepair
          ? "valid-after-repair"
          : "valid";
  const invalidated = providerMismatch.length > 0;
  const g1Pass =
    measurementError === null &&
    error === undefined &&
    !invalidated &&
    !reasoningLeak &&
    repairs.finder <= 1 &&
    repairs.verifier <= 1;
  return {
    outcome,
    measurementError,
    g1Pass,
    invalidated,
    providerMismatch,
    reasoningLeak,
    judge,
    cost,
    costComplete,
    timeouts,
    latencyMs,
  };
}

/** Counts of the verification record by state, for the attempt record and the summary line. */
export function verificationCounts(verification) {
  const counts = {};
  for (const record of verification?.verdicts ?? []) {
    const key = record.reasonCode === undefined ? record.state : `${record.state}:${record.reasonCode}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)];
};

/**
 * The series summary over the evaluated attempts that ran (plan.md Phase 2
 * §1): G1 (valid attempts), G4b (median total cost per attempt; any incomplete
 * cost fails it), the verifier and judge timeout counts (any one fails R3's
 * clause), measurement errors, and the judge latency median and max (R13,
 * reported, not gated).
 */
export function summarizeSeries(evaluations) {
  const totals = evaluations.map((e) => e.cost.total);
  const incompleteCost = evaluations.filter((e) => !e.costComplete).length;
  const g4bMedian = median(totals);
  const timeouts = {
    verifier: evaluations.reduce((t, e) => t + e.timeouts.verifier, 0),
    judge: evaluations.reduce((t, e) => t + e.timeouts.judge, 0),
  };
  const judgeLatencies = evaluations.map((e) => e.latencyMs.judge).filter((v) => typeof v === "number");
  return {
    attempts: evaluations.length,
    valid: evaluations.filter((e) => e.g1Pass).length,
    measurementErrors: evaluations.filter((e) => e.measurementError !== null).length,
    g4b: {
      pass: evaluations.length > 0 && incompleteCost === 0 && g4bMedian !== null && g4bMedian <= G4B_CEILING,
      median: g4bMedian,
      ceiling: G4B_CEILING,
      incompleteCost,
    },
    timeouts: { ...timeouts, pass: timeouts.verifier === 0 && timeouts.judge === 0 },
    judgeLatencyMs:
      judgeLatencies.length === 0 ? null : { median: median(judgeLatencies), max: Math.max(...judgeLatencies) },
  };
}
