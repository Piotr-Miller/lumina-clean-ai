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
import { createHash } from "node:crypto";

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
  // Required (impl-review phase 2 F8): a paid series never starts without a
  // cap, and there is no unlimited default to fall back to. The cap covers the
  // WHOLE series: on a continuation the spend already recorded in the file
  // counts against it (F2).
  const maxSpend = Number(required("--max-spend"));
  if (flag("--max-spend").trim() === "" || !Number.isFinite(maxSpend) || maxSpend < 0) {
    throw new Error("--max-spend must be a non-negative number of USD");
  }
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
 *
 * So are the INPUTS (impl-review phase 2 F4): the sha256 of the diff and of the
 * rules as read, and the git tree of the source root (`inputs.sourceRootTree`,
 * see sourceRootTreeOf in finder-gate.mjs). A continuation fed a different diff,
 * rules file or source tree is a different series — the "input hash mismatch"
 * measurement error of gate.md §5 — and is refused.
 */
export const seriesIdentity = ({ stages, model, endpoint, verifierModel, verifierEndpoint, caseName, n, inputs }) => ({
  stages,
  model,
  endpoint,
  verifierModel,
  verifierEndpoint,
  case: caseName,
  n,
  diffSha256: inputs?.diffSha256 ?? null,
  rulesSha256: inputs?.rulesSha256 ?? null,
  sourceRootTree: inputs?.sourceRootTree ?? null,
});

const identityKey = (entry) =>
  JSON.stringify(
    seriesIdentity({
      ...entry,
      caseName: entry.case,
      inputs: { diffSha256: entry.diffSha256, rulesSha256: entry.rulesSha256, sourceRootTree: entry.sourceRootTree },
    }),
  );

/** sha256 (hex) of a text as the runner read it — the bytes the model is sent. */
export const sha256Hex = (text) => createHash("sha256").update(text, "utf8").digest("hex");

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
  const records = [];
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
    else {
      if (state.completed) {
        throw new Error(
          `line ${String(index + 1)} records attempt ${String(entry.attempt)} a second time; refusing to continue a corrupt series`,
        );
      }
      state.completed = true;
      records.push(entry);
    }
    attempts.set(entry.attempt, state);
  });
  const sorted = [...attempts.values()].sort((a, b) => a.attempt - b.attempt);
  return {
    lineCount: lines.length,
    identities: [...identities].map((key) => JSON.parse(key)),
    attempts: sorted,
    records: records.sort((a, b) => a.attempt - b.attempt),
    maxAttempt: sorted.length === 0 ? 0 : sorted[sorted.length - 1].attempt,
    interrupted: sorted.filter((a) => a.started && !a.completed).map((a) => a.attempt),
  };
}

/**
 * The evaluations a continuation inherits from the file (impl-review phase 2
 * F2): the SUMMARY is the verdict of the WHOLE series, not of one invocation.
 * Each recorded attempt contributes the evaluation it was recorded with; each
 * interrupted attempt counts as a FAILED attempt with INCOMPLETE cost (money
 * may have been spent and nothing reported it). `spend` is the reported spend of
 * the recorded attempts, which the series' `--max-spend` already covers.
 */
export function recordedEvaluations(series) {
  const noCost = () => ({ finder: 0, verifier: 0, judge: 0, total: 0 });
  const noTimeouts = () => ({ verifier: 0, judge: 0 });
  const evaluations = [];
  for (const record of series.records ?? []) {
    // A record missing a field it should carry is read fail-closed: no cost →
    // incomplete, never free; no g1Pass → not valid.
    const hasCost = typeof record.cost?.total === "number";
    evaluations.push({
      attempt: record.attempt,
      outcome: record.outcome ?? "unknown",
      measurementError: record.measurementError ?? null,
      g1Pass: record.g1Pass === true,
      cost: hasCost ? record.cost : noCost(),
      costComplete: hasCost && record.costComplete === true,
      timeouts: record.timeouts ?? noTimeouts(),
      latencyMs: record.latencyMs ?? {},
    });
  }
  for (const attempt of series.interrupted ?? []) {
    evaluations.push({
      attempt,
      outcome: "interrupted",
      measurementError: null,
      g1Pass: false,
      cost: noCost(),
      costComplete: false,
      timeouts: noTimeouts(),
      latencyMs: {},
    });
  }
  evaluations.sort((a, b) => a.attempt - b.attempt);
  const spend = evaluations.reduce((t, e) => t + (e.cost?.total ?? 0), 0);
  return { evaluations, spend };
}

/**
 * Throws unless the series file may be written, and returns the recorded
 * series state (empty for a fresh one) so the runner can report interrupted
 * attempts. A fresh series (no `--append`) goes only into a missing or empty
 * file — otherwise repeating, say, `--through 1` would silently overwrite and
 * re-run the A3 probe. A continuation must (1) be the same series: identical
 * stages, models, endpoints, case, n AND inputs (diff, rules, source tree) in
 * every recorded line, so `--n 6` cannot add a
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
  inputs,
}) {
  const empty = { lineCount: 0, identities: [], attempts: [], records: [], maxAttempt: 0, interrupted: [] };
  if (!append) {
    if (existingText !== undefined && existingText !== "") {
      throw new Error(`${out} already holds a series; continue it with --start <k> --append, never overwrite it`);
    }
    return empty;
  }
  if (existingText === undefined) throw new Error(`--append needs an existing series file, ${out} does not exist`);
  const series = readSeries(existingText);
  if (series.lineCount === 0) throw new Error(`${out} is empty; start the series without --append`);

  const expected = seriesIdentity({ stages, model, endpoint, verifierModel, verifierEndpoint, caseName, n, inputs });
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
    // Set from the call log once the call ends (runGateAttempt): true for every
    // request of a call that hit its timeout (impl-review phase 2 F1).
    timedOut: false,
  };
}

// An OpenRouter account error (401: key, 402: credits) is not produced by the
// model through the provider: gate.md §5 lists it as a MEASUREMENT ERROR
// (impl-review phase 2 F3), never a model failure counted against G1.
export const ACCOUNT_ERROR_STATUSES = [401, 402];
const accountErrorStatus = (error) => {
  const status = error?.statusCode ?? error?.cause?.statusCode;
  return ACCOUNT_ERROR_STATUSES.includes(status) ? status : undefined;
};

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
        // Calls inside one attempt run one after another, so the requests
        // recorded from here on belong to this call.
        const firstRequest = requests.length;
        try {
          const value = await built[method](...args);
          calls.push({ pass, outcome: "ok", ms: Date.now() - started });
          return value;
        } catch (error) {
          const outcome = classify(error);
          calls.push({ pass, outcome, ms: Date.now() - started });
          if (outcome === "timeout") {
            for (const r of requests.slice(firstRequest)) if (r.pass === pass) r.timedOut = true;
          }
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
    // calls it, then the pipeline's own verification pass. A test pins that the
    // finder's options and request equal runReviewPipeline's for the same
    // input (impl-review phase 2 F9), timeouts resolved the same way.
    const resolved = api.resolveTimeouts(timeouts);
    const finder = createFinder({
      model: finderModel,
      projectContext: api.capProjectContext(rules),
      source,
      maxSteps: source === undefined ? undefined : finderMaxSteps,
    });
    const { diff: capped } = api.capDiff(api.orderDiffForCap(diff));
    const review = await withOneRetry(
      () => finder.review({ kind: "diff", diff: capped }, { timeoutMs: resolved.finderTimeoutMs }),
      { sleep, onRetry: onRetry("finder") },
    );
    const preVerification = api.assignFindingIds(api.mergeFindings(review.findings));
    const pass = await api.runVerificationPass({
      findings: preVerification,
      reader,
      requireVerification: true,
      model: verifierModel,
      createVerifier,
      timeoutMs: resolved.verifierTimeoutMs,
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
 *   CALLED produced at least one request AND no call of any pass hit its
 *   timeout. A verifier that was never called (nothing to send) is complete;
 *   one that was called and left no priced request is not (owner, Phase 1
 *   interpretation 6). A timed-out request emits no step, so its cost is never
 *   reported — a timeout followed by a successful retry would otherwise leave a
 *   complete-looking, under-reported cost (impl-review phase 2 F1).
 * - A timeout is any verifier or judge CALL that hit its timeout, including one
 *   followed by a successful retry (R3).
 * - A verification status other than `verified` / `no-findings`, the abort
 *   for an unusable source, or an OpenRouter account error (401/402) is a
 *   MEASUREMENT ERROR: never a valid attempt and never a model failure.
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
    calledPasses.every((pass) => requests.some((r) => r.pass === pass)) &&
    !calls.some((c) => c.outcome === "timeout");
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
        : accountErrorStatus(error) !== undefined
          ? `OpenRouter account error (HTTP ${String(accountErrorStatus(error))})`
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
 * The series summary over EVERY attempt of the series — those recorded by an
 * earlier invocation (recordedEvaluations) and those run now (impl-review
 * phase 2 F2) — (plan.md Phase 2 §1): G1 (valid attempts), G4b (median total cost per attempt; any incomplete
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

const defaultErrorDetail = (error) => ({ message: error instanceof Error ? error.message : String(error) });

/**
 * Runs attempts `start..through` of a series and returns the SUMMARY (plan.md
 * Phase 2 §1). Moved out of finder-gate.mjs so the series rules are tested:
 *
 * - **The series, not the invocation** (impl-review phase 2 F2): a
 *   continuation starts from the evaluations and the spend already recorded in
 *   the file (recordedEvaluations), so `gates` is the series verdict and
 *   `--max-spend` caps the whole series. Interrupted attempts count as failed
 *   with incomplete cost.
 * - **Budget**: before each attempt, a series spend at or over `maxSpend` →
 *   `not-run (budget)`.
 * - **Measurement errors stop the series** (impl-review phase 2 F3; gate.md
 *   §5): after the first one — or at once, when the file already records one —
 *   every remaining attempt is `not-run (measurement error)`. The series is a
 *   failed run, re-run fresh after a fix; nothing more is spent on it.
 *
 * Every line carries `identity` (seriesIdentity, inputs included). A `started`
 * line is written BEFORE each paid call, so an attempt the process did not
 * survive stays visible as interrupted.
 */
export async function runSeries({
  identity,
  idPrefix,
  start,
  through,
  maxSpend,
  series,
  expected,
  hasJudge,
  runAttempt,
  appendLine,
  log,
  errorDetail = defaultErrorDetail,
  now = () => Date.now(),
}) {
  const recorded = recordedEvaluations(series);
  const evaluations = [...recorded.evaluations];
  let seriesSpend = recorded.spend;
  let seriesRetries = 0;
  let stoppedBy = evaluations.find((e) => e.measurementError !== null)?.measurementError ?? null;
  const summary = {
    ...identity,
    start,
    through,
    outcomes: {},
    notRun: { budget: 0, measurementError: 0 },
    recordedBefore: recorded.evaluations.length,
    interruptedBefore: series.interrupted ?? [],
  };
  for (const attempt of summary.interruptedBefore) {
    log(`attempt ${String(attempt)}: started and never finished in an earlier run — counts as failed`);
  }

  for (let i = start; i <= through; i += 1) {
    const id = `${idPrefix}-${String(i).padStart(2, "0")}`;
    if (stoppedBy !== null) {
      summary.notRun.measurementError += 1;
      log(`${id}: not-run (measurement error: ${stoppedBy})`);
      continue;
    }
    if (seriesSpend >= maxSpend) {
      summary.notRun.budget += 1;
      log(`${id}: not-run (budget: series spend $${seriesSpend.toFixed(6)} >= $${String(maxSpend)})`);
      continue;
    }
    const started = now();
    appendLine({ kind: "started", id, ...identity, attempt: i, at: new Date(started).toISOString() });
    const attempt = await runAttempt();
    const wallMs = now() - started;
    const evaluation = evaluateAttempt({ attempt, expected });
    evaluations.push({ attempt: i, ...evaluation });
    seriesSpend += evaluation.cost.total;
    seriesRetries += attempt.retries.length;
    if (evaluation.measurementError !== null) stoppedBy = evaluation.measurementError;

    const { result, error } = attempt;
    appendLine({
      kind: "attempt",
      id,
      ...identity,
      expectedProvider: expected,
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
    });
    summary.outcomes[evaluation.outcome] = (summary.outcomes[evaluation.outcome] ?? 0) + 1;
    const providers = (pass) =>
      attempt.requests
        .filter((r) => r.pass === pass)
        .map((r) => r.provider ?? "?")
        .join(",");
    log(
      `${id}: ${evaluation.outcome}${evaluation.measurementError === null ? "" : ` (${evaluation.measurementError})`}` +
        `${evaluation.invalidated ? " INVALIDATED" : ""}${evaluation.reasoningLeak ? " REASONING" : ""} ` +
        `retries=${String(attempt.retries.length)} requests=${String(attempt.requests.length)} ` +
        `finder=${providers("finder")} verifier=${providers("verifier") || "(not called)"}` +
        `${hasJudge ? ` judge=${providers("judge")}` : ""} ` +
        `findings=${result === undefined ? "-" : `${String(result.published.length)}/${String(result.preVerificationFindingCount)}`} ` +
        `cost=$${evaluation.cost.total.toFixed(6)}${evaluation.costComplete ? "" : " (cost incomplete)"} ${String(wallMs)}ms` +
        `${error === undefined ? "" : ` :: ${(error instanceof Error ? error.message : String(error)).slice(0, 160)}`}`,
    );
  }

  summary.unrecorded = identity.n - through;
  summary.seriesSpend = seriesSpend;
  summary.seriesRetries = seriesRetries;
  summary.stoppedBy = stoppedBy;
  // The verdict of the whole series: recorded attempts, interrupted ones and
  // this invocation's (F2). A measurement error makes it a failed run.
  summary.gates = { scope: "series", ...summarizeSeries(evaluations) };
  return summary;
}
