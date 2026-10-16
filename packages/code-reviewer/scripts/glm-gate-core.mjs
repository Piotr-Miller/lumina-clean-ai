// Pure core of the measurement runner for change `finder-glm-5-3-high`, built
// by change `finder-glm-5-3` (its plan.md Phase 3 §1 and §4). Everything here
// is a function of its arguments: no file, network or process access, so the
// series can be replayed and every rule tested hermetically.
// scripts/glm-gate.mjs does the I/O.
//
// The rules restate the predecessor's plan.md § Definitions and § Phase 4/5,
// as its sealed gate (its archived gate.md) fixed them, with the deltas of
// this change's plan.md § Definitions; this change's pre-registration
// (gate.md) seals them. References below to plan.md, gate.md, owner decisions
// and A1–A8 are the predecessor's unless they say otherwise. A change here is
// a change to the gate.
//
// This change's plan.md Phase 2 adds: the screening's pure state
// (`screeningState`, § "Screening"), the D2 decision per #269 run with its
// pause and early stop (owner decision 2026-10-16 (a)–(d)), D2 taken from the
// ledger at hand-read, Amendment 1's forbidden-variable rule, and the
// finder-pass timing (H11).

// --- What is measured ------------------------------------------------------------

/** The finder model this change configures (`DEFAULT_MODEL`); `review.json` `models.finder` must equal it. */
export const FINDER_MODEL = "z-ai/glm-5.3";

/**
 * Accepted model (§ Definitions, A3): the `model` the RAW OpenRouter response
 * reported is `z-ai/glm-5.3` or a dated canonical form. Never `-flash`,
 * `-flashx`, `-prime` or `:batch` — the anchored pattern admits none of them.
 */
export const ACCEPTED_MODEL = /^z-ai\/glm-5\.3(-\d{8})?$/u;

/** Listed providers (§ Definitions): the served names the finder's routing may reach. */
export const LISTED_PROVIDERS = Object.freeze(["Z.AI", "Fireworks", "Together"]);

/** The reasoning body every finder request carries (owner decision 2; effort `high` per change `finder-glm-5-3-high`). */
export const DECIDED_REASONING = Object.freeze({ enabled: true, effort: "high" });

/** The line the CLI prints once per run, from the constants its requests use (plan Phase 2 §6). */
export const EXPECTED_CONFIGURATION_LINE =
  "finder configuration: model=z-ai/glm-5.3 reasoning=high providers=z-ai,fireworks,together";

/**
 * Environment variables that would make a local run differ from production's
 * defaults (model, routing, step cap, timeouts). `npm run review` reads the
 * package's .env too, so the runner checks inherited env and .env together.
 * The plan names the first two; the rest change what a run measures as surely.
 */
export const FORBIDDEN_ENV = Object.freeze([
  "OPENROUTER_REVIEW_MODEL",
  "OPENROUTER_FINDER_PROVIDERS",
  "OPENROUTER_MODEL",
  "OPENROUTER_JUDGE_MODEL",
  "OPENROUTER_IMPL_REVIEW_MODEL",
  "OPENROUTER_REQUIRE_PARAMETERS",
  "REVIEW_FINDER_MAX_STEPS",
  "REVIEW_FINDER_TIMEOUT_MS",
  "REVIEW_JUDGE_TIMEOUT_MS",
  "REVIEW_IMPL_REVIEW_TIMEOUT_MS",
]);

/**
 * Names of FORBIDDEN_ENV present in `env` at all, whatever the value — empty
 * and whitespace-only included: the sealed gate's "may be set", as Amendment
 * 1's operator greps enforced it (this change's plan.md H8).
 */
export const forbiddenEnvSet = (env) => FORBIDDEN_ENV.filter((name) => typeof env[name] === "string");

// --- G3 --------------------------------------------------------------------------

/** The promptfoo provider label G3 runs, alone. */
export const G3_PROVIDER_LABEL = "candidate-glm-5.3";
export const G3_PROVIDER_FILTER = "^candidate-glm-5\\.3$";
/** The four registered cases (finder-model-swap gate.md §4), matched by description prefix. */
export const G3_CASE_FILTER = "^(Finds the material|React 16->19|Cross-hunk contract|Defect-free mechanical rename)";

/**
 * The exact G3 command (plan Phase 3 §1), as arguments to `npm`. The
 * screening's fixtures step is the same command with `{repeat: 1}` (this
 * change's plan.md Phase 2 §1).
 */
export const g3EvalArgs = (exportPath, { repeat = 3 } = {}) => [
  "run",
  "eval",
  "--",
  "--env-file",
  ".env",
  "--no-cache",
  "-j",
  "1",
  "--repeat",
  String(repeat),
  "--filter-providers",
  G3_PROVIDER_FILTER,
  "--filter-pattern",
  G3_CASE_FILTER,
  "--output",
  exportPath,
];

// --- Budget (§ Definitions "T (spend)", "P vs cap"; owner decision 7) ---------------

export const BUDGET = Object.freeze({ cap: 3.5, pause: 3.0, g5Reserve: 1.0, total: 4.5 });

/** First-step P per step kind (plan Phase 3 §1). Afterwards P = 2 × the largest settled cost of that kind. */
export const FIRST_STEP_ESTIMATE = Object.freeze({ clean: 0.05, pr247: 0.25, pr269: 0.45, g3: 0.6, regrade: 0.1 });

export const STEP_KINDS = Object.freeze(["clean", "pr247", "pr269", "g3", "regrade"]);
export const RUN_CASES = Object.freeze(["clean", "pr247", "pr269"]);

/** The two settlement reads are at least this far apart: the key counter lags. */
export const SETTLE_SECONDS = 180;

/** Tolerance between a settled counter delta and telemetry. */
export const reconcileTolerance = (telemetry) => Math.max(0.005, 0.02 * telemetry);

const EPSILON = 1e-9;

// --- Cost gate (§ Definitions "monthly cost"; owner decision 3, review F2) -----------

/** Impl-review cost of run 31735830016, the initial I. */
export const IMPL_REVIEW_COST = 0.19962;
export const COST_LIMIT = 10;
export const COST_WEIGHTS = Object.freeze({ pr247: 53, pr269: 8, implReview: 13 });

/** 53·m247 + 8·m269 + 13·I, every term reported. */
export function projectMonthly({ m247, m269, I }) {
  const terms = {
    pr247: COST_WEIGHTS.pr247 * m247,
    pr269: COST_WEIGHTS.pr269 * m269,
    implReview: COST_WEIGHTS.implReview * I,
  };
  return { m247, m269, I, terms, total: terms.pr247 + terms.pr269 + terms.implReview };
}

/** Rejects only ABOVE the limit: exactly $10.00 passes (review F2). */
export const exceedsLimit = (total) => total - COST_LIMIT > EPSILON;

/** A6: after both #247 runs, stop only when 53 × m247 alone exceeds the limit. */
export const a6Stops = (m247) => exceedsLimit(COST_WEIGHTS.pr247 * m247);

/** The pre-G5 lower bound: I at half its initial value, the lowest a G5 average can reach. */
export const preG5LowerBound = (m247, m269) => projectMonthly({ m247, m269, I: IMPL_REVIEW_COST / 2 });

/**
 * The final projection after G5: I is the mean of the initial cost and G5's
 * impl-review cost when that pass ran; a skipped pass keeps the initial I.
 */
export function finalProjection({ m247, m269, g5ImplReviewCost }) {
  const I = g5ImplReviewCost === null ? IMPL_REVIEW_COST : (IMPL_REVIEW_COST + g5ImplReviewCost) / 2;
  const projection = projectMonthly({ m247, m269, I });
  return { ...projection, implReviewSkipped: g5ImplReviewCost === null, pass: !exceedsLimit(projection.total) };
}

// --- CLI stderr ------------------------------------------------------------------

// `kind` (owner decision 2026-10-14) names the request, so a run without
// review.json still tells the finalization and the repair from a loop step.
// The lazy prefix finds the line's own `(tokens …)` group: a model-chosen path
// cannot fake it, because only the real tail matches the fields up to `$`.
const STEP_LINE =
  /^finder step (\d+): .*?(?:\(tokens in=\S+ out=(\S+) total=\S+\) )?kind=(step|finalization|repair) provider=(\S+) finish=(\S+) model=(\S+) reasoning=(\S+)$/u;
const RETRY_LINE = /^retrying (finder|judge|impl-review) after (\S+) in (\d+)ms$/u;
const FINDER_REJECTED = /Finder output rejected \(reason=([a-z-]+), (?:request=([a-z]+(?::\d+)?), )?/u;
const CONFIGURATION_PREFIX = "finder configuration: ";
// Owner decision 2026-10-14: a 401/402 is CONFIRMED only by the CLI's own
// `api error: status=<n>` line, which carries the typed APICallError status.
// Text alone is never confirmation: OpenRouter's auth/credit phrasings without
// that line make a run SUSPECTED (unsettled, still an ordinary invalid run).
const API_STATUS_LINE = /^api error: status=(\d{3})$/u;
const AUTH_CREDIT_STATUSES = Object.freeze([401, 402]);
const SUSPECTED_AUTH_OR_CREDIT =
  /Unauthorized|Payment Required|Insufficient credits|insufficient_quota|User not found|No auth credentials|requires more credits|can only afford/iu;
// A local configuration error, not an OpenRouter answer.
const MISSING_KEY = /OPENROUTER_API_KEY is missing/u;
// Model text the CLI may print on a rejected output; never scanned for suspicion.
const REJECTED_OUTPUT_PREFIX = "rejected output (";
const TIMEOUT = /TimeoutError|exceeded its \d+ ms budget|aborted due to timeout/iu;
const FINDER_REJECTED_PREFIX = "Finder output rejected (";

/**
 * What the CLI's stderr says about a run, metadata only: the configuration
 * line, one entry per finder step line, retries per pass, and the finder's
 * refusal reason. The CLI never prints model text for an inline-reasoning
 * refusal, and nothing here keeps a free-text line.
 */
export function parseCliStderr(stderr) {
  const lines = stderr.split("\n");
  const configurationLines = lines.filter((line) => line.startsWith(CONFIGURATION_PREFIX));
  const steps = [];
  const retries = [];
  for (const line of lines) {
    const step = STEP_LINE.exec(line);
    if (step) {
      steps.push({
        step: Number(step[1]),
        kind: step[3],
        provider: step[4] === "?" ? null : step[4],
        finishReason: step[5],
        model: step[6] === "missing" ? null : step[6],
        reasoningTokens: step[7] === "missing" ? null : Number(step[7]),
        // The request's output tokens, against the 16,384-token cap (H11); reasoning is only part of them.
        outputTokens: step[2] === undefined || step[2] === "?" ? null : Number(step[2]),
      });
    }
    const retry = RETRY_LINE.exec(line);
    if (retry) retries.push({ pass: retry[1], error: retry[2], delayMs: Number(retry[3]) });
  }
  const rejected = FINDER_REJECTED.exec(stderr);
  const apiStatuses = lines.flatMap((line) => {
    const match = API_STATUS_LINE.exec(line);
    return match ? [Number(match[1])] : [];
  });
  const scanned = lines.filter((line) => !line.startsWith(REJECTED_OUTPUT_PREFIX)).join("\n");
  // The run's own terminal timeout (stop rule (b) of the screening): the
  // pattern on every line except the retry lines, which name the error they
  // retried, and the lines that can carry model-chosen or model text.
  const terminal = lines
    .filter(
      (line) =>
        !line.startsWith("retrying ") &&
        !line.startsWith(REJECTED_OUTPUT_PREFIX) &&
        !line.startsWith(FINDER_REJECTED_PREFIX) &&
        !line.startsWith(CONFIGURATION_PREFIX) &&
        !STEP_LINE.test(line),
    )
    .join("\n");
  const authCredit = apiStatuses.some((status) => AUTH_CREDIT_STATUSES.includes(status))
    ? "confirmed"
    : SUSPECTED_AUTH_OR_CREDIT.test(scanned)
      ? "suspected"
      : null;
  return {
    configurationLines,
    steps,
    retries,
    finderRefusal: rejected ? { reason: rejected[1], request: rejected[2] ?? null } : null,
    apiStatuses,
    authCredit,
    missingKey: MISSING_KEY.test(scanned),
    timeout: TIMEOUT.test(stderr),
    terminalTimeout: TIMEOUT.test(terminal),
  };
}

// --- Finder-pass timing (this change's plan.md H11) --------------------------------

/**
 * What one stderr line is to the finder-pass timing, or null: the
 * configuration line, a finder step line (with its kind), or a `retrying
 * finder` line (with its delay). Metadata only: the line's text is not kept.
 */
export function timedLineOf(line) {
  if (line.startsWith(CONFIGURATION_PREFIX)) return { type: "configuration" };
  const step = STEP_LINE.exec(line);
  if (step) return { type: "step", kind: step[3] };
  const retry = RETRY_LINE.exec(line);
  if (retry && retry[1] === "finder") return { type: "retry", delayMs: Number(retry[3]) };
  return null;
}

/**
 * Each finder attempt's timing from the arrival offsets of its lines (H11).
 * Attempt 1 starts at the configuration line; a retried attempt starts at its
 * `retrying finder` line plus that line's delay, because the retry sleeps
 * first. An attempt ends at the next `retrying finder` line (failed); else at
 * its last step line when it reached a finalization step; else at the process
 * exit (failed). Informational: the code's own 300 s abort decides.
 */
export function finderTiming(timedLines, exitAtMs) {
  const startIndex = timedLines.findIndex((line) => line.type === "configuration");
  if (startIndex === -1) return { finderStepOffsetsMs: [[]], finderElapsedMs: [null], finderAttemptFailed: [true] };
  const attempts = [];
  const begin = (start) => ({ start, steps: [], lastStepAt: null, finalization: false });
  let current = begin(timedLines[startIndex].atMs);
  for (const line of timedLines.slice(startIndex + 1)) {
    if (line.type === "step") {
      current.steps.push(line.atMs - current.start);
      current.lastStepAt = line.atMs;
      if (line.kind === "finalization") current.finalization = true;
    } else if (line.type === "retry") {
      attempts.push({ ...current, end: line.atMs, failed: true });
      current = begin(line.atMs + line.delayMs);
    }
  }
  attempts.push(
    current.finalization
      ? { ...current, end: current.lastStepAt, failed: false }
      : { ...current, end: exitAtMs ?? null, failed: true },
  );
  return {
    finderStepOffsetsMs: attempts.map((attempt) => attempt.steps),
    finderElapsedMs: attempts.map((attempt) => (attempt.end === null ? null : attempt.end - attempt.start)),
    finderAttemptFailed: attempts.map((attempt) => attempt.failed),
  };
}

// --- Validity (§ Definitions "valid run") -------------------------------------------

const requestProblems = (requests) => {
  const reasons = [];
  if (requests.length === 0) reasons.push("no-finder-request-telemetry");
  for (const request of requests) {
    if (request.provider?.source !== "reported" || !LISTED_PROVIDERS.includes(request.provider.value)) {
      reasons.push("provider-mismatch");
    }
    if (request.model?.source !== "reported" || !ACCEPTED_MODEL.test(String(request.model.value))) {
      reasons.push("model-mismatch");
    }
    if (request.finishReason === "length") reasons.push("length");
  }
  return [...new Set(reasons)];
};

/** A completed judge verdict: findings, scores and a verdict, as the CLI writes them only after the judge returned. */
const completedReview = (review) =>
  typeof review === "object" &&
  review !== null &&
  Array.isArray(review.findings) &&
  typeof review.verdict === "string" &&
  typeof review.scores === "object" &&
  review.scores !== null;

/**
 * Classifies one CLI run. `review` is the parsed review.json, or undefined
 * when it is missing or unparsable. A completed `verdict: "failed"` is a
 * valid run when every other criterion holds (review F1); a technical judge
 * failure leaves no review.json and is invalid.
 */
export function classifyRun({ exitCode, signal, stderr, review }) {
  const log = parseCliStderr(stderr);
  const reasons = [];
  const configurationOk =
    log.configurationLines.length === 1 && log.configurationLines[0] === EXPECTED_CONFIGURATION_LINE;
  if (!configurationOk) reasons.push("configuration-mismatch");

  if (exitCode === 0 && review !== undefined) {
    if (!completedReview(review)) reasons.push("incomplete-review-json");
    if (review?.models?.finder !== FINDER_MODEL) reasons.push("finder-model-mismatch");
    const requests = Array.isArray(review?.finderTelemetry?.requests) ? review.finderTelemetry.requests : [];
    reasons.push(...requestProblems(requests));
    return {
      valid: reasons.length === 0,
      artifact: true,
      reasons: [...new Set(reasons)],
      requests,
      authCredit: null,
      log,
    };
  }

  // No artifact: the reasons come from stderr only.
  if (signal !== null && signal !== undefined) reasons.push(`signal-${String(signal)}`);
  if (exitCode !== 0 && exitCode !== 1) reasons.push(`cli-crash-exit-${String(exitCode)}`);
  if (exitCode === 0) reasons.push("no-review-json");
  for (const status of log.apiStatuses) reasons.push(`api-error:${String(status)}`);
  if (log.authCredit === "confirmed") reasons.push("auth-or-credit-confirmed");
  if (log.authCredit === "suspected") reasons.push("auth-or-credit-suspected");
  if (log.missingKey) reasons.push("local-config:missing-api-key");
  if (log.finderRefusal !== null) reasons.push(`finder-output:${log.finderRefusal.reason}`);
  if (log.timeout) reasons.push("timeout");
  if (log.finderRefusal === null && log.retries.some((retry) => retry.pass === "judge")) reasons.push("judge-error");
  for (const step of log.steps) {
    if (step.provider === null || !LISTED_PROVIDERS.includes(step.provider)) reasons.push("provider-mismatch");
    if (step.model === null || !ACCEPTED_MODEL.test(step.model)) reasons.push("model-mismatch");
  }
  if (reasons.length === 0) reasons.push(`exit-${String(exitCode)}`);
  return {
    valid: false,
    artifact: null,
    reasons: [...new Set(reasons)],
    requests: null,
    authCredit: log.authCredit,
    log,
  };
}

/**
 * The run's cost from telemetry, and whether that telemetry is complete:
 * every finder request priced, the judge priced, and no timeout-triggered
 * retry (an aborted request leaves no step, but the provider may bill it).
 */
export function runCost(review, log) {
  const requests = Array.isArray(review?.finderTelemetry?.requests) ? review.finderTelemetry.requests : [];
  const finder = typeof review?.finderTelemetry?.cost === "number" ? review.finderTelemetry.cost : null;
  const judge = typeof review?.judgeTelemetry?.cost === "number" ? review.judgeTelemetry.cost : null;
  const timeoutRetry = log.retries.some((retry) => /timeout/iu.test(retry.error));
  // A suspected auth/credit failure is never settled from telemetry: only the counter can say what it cost.
  const complete =
    log.authCredit === null &&
    review !== undefined &&
    requests.length > 0 &&
    requests.every((request) => typeof request.cost === "number") &&
    finder !== null &&
    judge !== null &&
    !timeoutRetry;
  return { finder, judge, total: complete ? finder + judge : null, complete };
}

/**
 * The G2-01 probe (plan Phase 4, run order 1): reasoning shape logged, every
 * request served by a listed provider and an accepted model — both reported —,
 * reasoning tokens reported, cost present, no inline reasoning. Anything else
 * stops the series for the owner.
 */
export function probeProblems(record) {
  const problems = [];
  if (!record.valid) problems.push(`invalid run (${record.reasons.join(", ")})`);
  if (!record.configurationOk) problems.push("configuration line missing or not the decided one");
  const requests = record.requests ?? [];
  if (requests.length === 0) problems.push("no finder request telemetry");
  requests.forEach((request, index) => {
    const at = `request ${String(index + 1)} (${request.kind})`;
    if (request.provider?.source !== "reported") problems.push(`${at}: provider not reported`);
    else if (!LISTED_PROVIDERS.includes(request.provider.value))
      problems.push(`${at}: provider ${request.provider.value}`);
    if (request.model?.source !== "reported") problems.push(`${at}: model not reported`);
    else if (!ACCEPTED_MODEL.test(request.model.value)) problems.push(`${at}: model ${request.model.value}`);
    if (request.reasoningTokens?.source !== "reported") problems.push(`${at}: reasoning tokens not reported`);
    if (typeof request.cost !== "number") problems.push(`${at}: cost not reported`);
  });
  if (!record.cost.complete) problems.push("cost telemetry incomplete");
  if (record.reasons.includes("finder-output:inline-reasoning")) problems.push("inline reasoning");
  return problems;
}

// --- Series replay ----------------------------------------------------------------

/** The preflight's counter: T0, read once. Later preflights never move it. */
export const seriesT0 = (series) =>
  series.find((line) => line.type === "preflight" && typeof line.counter === "number");

const startedSteps = (series) => series.filter((line) => line.type === "started");
const settledLine = (series, stepId) => series.findLast((line) => line.type === "settled" && line.stepId === stepId);

/** Started steps without a settled cost: they block the next paid step. */
export const unsettledSteps = (series) =>
  startedSteps(series)
    .filter((line) => settledLine(series, line.stepId) === undefined)
    .map((line) => line.stepId);

/** T = max(counter − T0, Σ settled costs). `counterNow` undefined → T from settlement alone. */
export function seriesSpend(series, counterNow) {
  const t0 = seriesT0(series);
  const settledTotal = startedSteps(series).reduce(
    (sum, line) => sum + (settledLine(series, line.stepId)?.cost ?? 0),
    0,
  );
  const counterDelta = t0 === undefined || counterNow === undefined ? undefined : counterNow - t0.counter;
  const t = counterDelta === undefined ? settledTotal : Math.max(counterDelta, settledTotal);
  return { t0: t0?.counter, settledTotal, counterDelta, t };
}

/** P: 2 × the largest settled cost of this kind so far, else the first-step estimate. */
export function stepEstimate(series, kind) {
  const costs = startedSteps(series)
    .filter((line) => line.kind === kind)
    .map((line) => settledLine(series, line.stepId)?.cost)
    .filter((cost) => typeof cost === "number");
  return costs.length === 0 ? FIRST_STEP_ESTIMATE[kind] : 2 * Math.max(...costs);
}

/**
 * A step stopped by a CONFIRMED OpenRouter 401/402 (owner decision
 * 2026-10-14): recorded, its cost counted toward T, but never a G2, #247 or
 * G1 sample and never a G3 result.
 */
export const authCreditStopped = (line) =>
  (line.type === "record" && line.authCredit === "confirmed") ||
  ((line.type === "g3" || line.type === "fixtures") && line.summary?.authCredit === true);

/** Sample runs of a case: every record except one stopped by a confirmed 401/402. */
const records = (series, kind) =>
  series.filter((line) => line.type === "record" && line.kind === kind && !authCreditStopped(line));
const g3Records = (series) => series.filter((line) => line.type === "g3" && !authCreditStopped(line));
const continued = (series, reason) => series.some((line) => line.type === "continue" && line.for === reason);

/**
 * Mean settled cost of the executed runs of a case; null while any is
 * unsettled or none ran. A run stopped by a confirmed 401/402 is not a sample
 * and stays out of the mean (its cost still counts toward T).
 */
export function meanSettledCost(series, kind) {
  const stopped = new Set(series.filter(authCreditStopped).map((line) => line.stepId));
  const steps = startedSteps(series).filter((line) => line.kind === kind && !stopped.has(line.stepId));
  if (steps.length === 0) return null;
  const costs = steps.map((line) => settledLine(series, line.stepId)?.cost);
  if (costs.some((cost) => typeof cost !== "number")) return null;
  return costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
}

// --- D2, decided per #269 run (owner decision 2026-10-16 (a)–(d)) ----------------

/** The file D2 lives in, and the terms that make a finding a D2 candidate (this change's plan.md § Definitions). */
export const D2_FILE = "bread-spike.ts";
export const D2_TERMS = Object.freeze([D2_FILE, "localInput", "deleteUpload", "urls.get", "uploadedFileId"]);

/**
 * A D2 candidate: its `file` contains `bread-spike.ts`, or its description or
 * suggestion mentions one of D2_TERMS. The one predicate behind `d2 --list`
 * and the sheet's `D2?` flag, so the two never disagree. Never a decision:
 * the agent lists every candidate and the owner decides.
 */
export function isD2Candidate(finding) {
  if (typeof finding !== "object" || finding === null) return false;
  if (typeof finding.file === "string" && finding.file.includes(D2_FILE)) return true;
  return [finding.description, finding.suggestion].some(
    (text) => typeof text === "string" && D2_TERMS.some((term) => text.includes(term)),
  );
}

/** The owner's `d2` line for one run, if any (at most one per run). */
export const d2LineFor = (series, stepId) => series.find((line) => line.type === "d2" && line.stepId === stepId);

/** The valid #269 sample runs, in ledger order. */
const valid269 = (series) => records(series, "pr269").filter((record) => record.valid === true);

/** The first valid #269 run the owner decided `no-match` for: the D2 early stop. */
export const firstD2NoMatch = (series) =>
  valid269(series).find((record) => d2LineFor(series, record.stepId)?.decision === "no-match");

/** What the D2 pause waits for, with the command that ends it. */
export function d2Wait(record, { screening = false } = {}) {
  const d2 = `d2${screening ? " --screening" : ""} --run ${record.stepId}`;
  return record.valid === true && !authCreditStopped(record)
    ? `the owner's d2 line for ${record.stepId} (\`${d2} --list\`, then \`${d2} --match <F-id>[,…] --note <text>\` or \`--none --note <text>\`)`
    : `the owner's d2 line for ${record.stepId} (an invalid run: \`${d2} --not-applicable --note <text>\`)`;
}

/** A `d2` line in words, for the outcome tables. */
export function describeD2(line) {
  if (line === undefined) return "pending";
  if (line.decision === "match") return `match (${line.matches.join(", ")})`;
  return line.decision;
}

/**
 * Where the sealed order stands (plan Phase 4 "Run order" and "Stops"):
 * G2-01 alone as the probe, G2-02..05, G3 (and its one re-grade), #247 × 2
 * and the A6 check, G1 (#269 × 10). The first decisive failure ends the
 * series. Pure: the same series always gives the same answer.
 *
 * Returns `{ next, ended, waitingFor }`: `next` is the step kind that may run
 * (`clean`, `g3`, `regrade`, `pr247`, `pr269`) or null; `ended` is the
 * series' terminal state (`FAIL (<gate>)` — `FAIL (D2)` included —, `INCOMPLETE (budget)`,
 * `INCOMPLETE (auth/credit)` until the owner resumes, or
 * `measured` when every step ran and settled); `waitingFor` names an owner action.
 */
export function scheduleState(series) {
  const budgetStop = series.find((line) => line.type === "budget_stop");
  if (budgetStop !== undefined) return { next: null, ended: "INCOMPLETE (budget)", waitingFor: null };
  // A step that ended above the cap ends the series too; its overshoot is in the outcome.
  if (seriesSpend(series).settledTotal - BUDGET.cap > EPSILON) {
    return { next: null, ended: "INCOMPLETE (budget)", waitingFor: null };
  }
  const blocking = startedSteps(series).find(
    (line) => !series.some((other) => (other.type === "record" || other.type === "g3") && other.stepId === line.stepId),
  );
  if (blocking !== undefined) {
    return { next: null, ended: null, waitingFor: `step ${blocking.stepId} started and has no record` };
  }
  // A confirmed OpenRouter 401/402 stops every further paid step until the
  // owner resumes under a dated amendment (`continue --for auth-credit`), one
  // resumption per stop. No automatic replacement.
  const stops = series.filter(authCreditStopped).length;
  const resumes = series.filter((line) => line.type === "continue" && line.for === "auth-credit").length;
  if (stops > resumes) return { next: null, ended: "INCOMPLETE (auth/credit)", waitingFor: null };

  // G2: clean × 5, all valid with findings: [].
  const clean = records(series, "clean");
  if (clean.some((record) => !record.valid || (record.findings ?? []).length > 0)) {
    return { next: null, ended: "FAIL (G2)", waitingFor: null };
  }
  if (clean.length === 1 && !continued(series, "probe")) {
    return { next: null, ended: null, waitingFor: "owner confirmation of the G2-01 probe (`continue --for probe`)" };
  }
  if (clean.length < 5) return { next: "clean", ended: null, waitingFor: null };

  // G3: one run, re-graded once on grader errors only.
  const g3 = g3Records(series);
  const lastG3 = g3.at(-1);
  if (lastG3 === undefined) return { next: "g3", ended: null, waitingFor: null };
  if (lastG3.summary?.failedRun === true) {
    if (lastG3.summary.graderError === true && !lastG3.regrade)
      return { next: "regrade", ended: null, waitingFor: null };
    // A failed run is not a gate result (finder-model-swap gate.md §4, A1): the owner decides.
    return {
      next: null,
      ended: null,
      waitingFor: `owner decision — G3 is not a gate result (${(lastG3.summary.problems ?? []).join("; ")})`,
    };
  }
  if (lastG3.summary?.pass !== true) return { next: null, ended: "FAIL (G3)", waitingFor: null };

  // #247 × 2, both valid (A5), then A6.
  const pr247 = records(series, "pr247");
  if (pr247.some((record) => !record.valid)) return { next: null, ended: "FAIL (reliability #247)", waitingFor: null };
  if (pr247.length < 2) return { next: "pr247", ended: null, waitingFor: null };
  const m247 = meanSettledCost(series, "pr247");
  if (m247 === null) return { next: null, ended: null, waitingFor: "settlement of the #247 runs (`reconcile`)" };
  if (a6Stops(m247)) return { next: null, ended: "FAIL (cost)", waitingFor: null };

  // G1: #269 × 10, ≥ 9 valid — decided as soon as a second run is invalid.
  const pr269 = records(series, "pr269");
  if (pr269.filter((record) => !record.valid).length >= 2) return { next: null, ended: "FAIL (G1)", waitingFor: null };
  // D2 per run (owner decision 2026-10-16 (a), (c), (d)): the first `no-match`
  // ends the series, and every #269 record waits for its d2 line — a decision
  // for a valid run, `not-applicable` for an invalid one — before any paid step.
  if (firstD2NoMatch(series) !== undefined) return { next: null, ended: "FAIL (D2)", waitingFor: null };
  const undecided = series.find(
    (line) => line.type === "record" && line.kind === "pr269" && d2LineFor(series, line.stepId) === undefined,
  );
  if (undecided !== undefined) return { next: null, ended: null, waitingFor: d2Wait(undecided) };
  if (pr269.length < 10) return { next: "pr269", ended: null, waitingFor: null };
  const unsettled = unsettledSteps(series);
  if (unsettled.length > 0)
    return {
      next: null,
      ended: null,
      waitingFor: `settlement of step(s) ${unsettled.join(", ")} (\`reconcile\`)`,
    };
  if (meanSettledCost(series, "pr269") === null)
    return { next: null, ended: null, waitingFor: "settlement of the #269 runs (`reconcile`)" };
  return { next: null, ended: "measured", waitingFor: null };
}

/**
 * Admission, common to every paid step (plan Phase 3 §1): refused while any
 * step is unsettled; refused at T ≥ $3.00 until the owner's `continue`;
 * a step whose T + P exceeds the $3.50 cap is not started and ends the series
 * INCOMPLETE (budget). The manifest check happens before this, in the runner.
 */
export function admit(series, kind, counterNow) {
  const unsettled = unsettledSteps(series);
  const spend = seriesSpend(series, counterNow);
  const p = stepEstimate(series, kind);
  const base = { kind, t: spend.t, p, cap: BUDGET.cap, counterDelta: spend.counterDelta, settled: spend.settledTotal };
  if (unsettled.length > 0) return { ...base, admit: false, refusal: `unsettled step(s) ${unsettled.join(", ")}` };
  if (spend.t >= BUDGET.pause - EPSILON && !continued(series, "pause")) {
    return {
      ...base,
      admit: false,
      refusal: "paused at T ≥ $3.00 — reconcile, then the owner's `continue --for pause`",
    };
  }
  if (spend.t + p - BUDGET.cap > EPSILON) return { ...base, admit: false, budgetStop: true };
  return { ...base, admit: true };
}

// --- Outcome ----------------------------------------------------------------------

/**
 * Bind saved resolver results to every current valid run and check their
 * per-run verdicts. A #269 run's D2 count must equal the owner's `d2` line in
 * the ledger: the full hand-read does not revisit D2 (owner decision
 * 2026-10-16 (a)).
 */
function checkHandRead(series, handRead) {
  const problems = [];
  const pending = () => ({ pass: null, problems });
  if (handRead === undefined) return pending();
  if (typeof handRead !== "object" || handRead === null || Array.isArray(handRead)) {
    problems.push("expected a resolver result object");
    return pending();
  }
  if (!Array.isArray(handRead.problems) || handRead.problems.length > 0)
    problems.push("resolver problems are missing or unresolved");
  const cases = handRead.cases;
  const kinds = ["pr247", "pr269"];
  if (typeof cases !== "object" || cases === null || Array.isArray(cases)) {
    problems.push("resolver case results are missing");
    return pending();
  }
  for (const kind of Object.keys(cases)) if (!kinds.includes(kind)) problems.push(`unexpected hand-read case ${kind}`);
  const passes = [];
  for (const kind of kinds) {
    const expected = records(series, kind).filter((record) => record.valid === true);
    const byId = new Map(expected.map((record) => [record.stepId, record]));
    if (expected.length === 0) problems.push(`${kind}: no valid runs to classify yet`);
    if (byId.size !== expected.length) problems.push(`${kind}: duplicate run IDs in the series`);
    const results = cases[kind];
    if (!Array.isArray(results)) {
      problems.push(`${kind}: case results missing`);
      continue;
    }
    const seen = new Set();
    for (const result of results) {
      const id = result?.stepId;
      const record = byId.get(id);
      if (record === undefined) {
        problems.push(`${kind}: result for a run outside the current valid set (${String(id)})`);
        continue;
      }
      if (seen.has(id)) problems.push(`${kind}: duplicate result for ${id}`);
      seen.add(id);
      if (!/^[a-f0-9]{64}$/u.test(String(record.reviewSha256)) || result.reviewSha256 !== record.reviewSha256)
        problems.push(`${id}: review.json sha256 missing or differs from the current series`);
      if (!Array.isArray(record.findings) || result.n !== record.findings.length)
        problems.push(`${id}: finding count differs from the published findings`);
      if (
        ![result.n, result.rejected, result.unresolved, result.allowed, result.d2].every(
          (value) => Number.isSafeInteger(value) && value >= 0,
        )
      ) {
        problems.push(`${id}: invalid hand-read counts`);
        continue;
      }
      if (
        result.allowed !== Math.ceil(0.05 * result.n) ||
        result.unresolved > result.rejected ||
        result.rejected + result.d2 > result.n ||
        (kind === "pr247" && result.d2 !== 0)
      )
        problems.push(`${id}: inconsistent hand-read counts`);
      if (kind === "pr269") {
        const d2 = d2LineFor(series, id);
        const approved = d2?.decision === "match" ? d2.matches.length : 0;
        if (d2 === undefined) problems.push(`${id}: no D2 decision in the ledger`);
        else if (result.d2 !== approved)
          problems.push(
            `${id}: D2 count ${String(result.d2)} differs from the ledger's ${String(approved)} approved match(es)`,
          );
      }
      const pass = result.rejected <= result.allowed && (kind !== "pr269" || result.d2 >= 1);
      if (result.pass !== pass) problems.push(`${id}: pass flag disagrees with rejection/D2 results`);
      passes.push(pass);
    }
    for (const id of byId.keys()) if (!seen.has(id)) problems.push(`${kind}: missing result for ${id}`);
  }
  const pass = passes.every(Boolean);
  if (handRead.pass !== pass) problems.push("overall pass flag disagrees with per-run results");
  return problems.length === 0 ? { pass, problems } : pending();
}

/**
 * The automatic outcome (plan Phase 5 §6, Phase 6 §4): each gate's verdict,
 * validity per run, m247, m269, the provisional projection and the pre-G5
 * lower bound, T against the caps. `handRead` is the resolver's result, when
 * the owner's verdicts exist. Never "ADMITTED" outright: G5 decides that.
 */
export function computeOutcome(series, { counterNow, handRead } = {}) {
  const state = scheduleState(series);
  const checkedHandRead = checkHandRead(series, handRead);
  const spend = seriesSpend(series, counterNow);
  const runs = series
    .filter((line) => line.type === "record")
    .map((line) => ({
      stepId: line.stepId,
      kind: line.kind,
      valid: line.valid,
      reasons: line.reasons,
      sample: !authCreditStopped(line),
      d2: line.kind === "pr269" ? describeD2(d2LineFor(series, line.stepId)) : null,
    }));
  const m247 = meanSettledCost(series, "pr247");
  const m269 = meanSettledCost(series, "pr269");
  const provisional = m247 !== null && m269 !== null ? projectMonthly({ m247, m269, I: IMPL_REVIEW_COST }) : null;
  const lowerBound = m247 !== null && m269 !== null ? preG5LowerBound(m247, m269) : null;
  const overshoot = spend.t - BUDGET.cap > EPSILON ? spend.t - BUDGET.cap : 0;

  const clean = records(series, "clean");
  const pr247 = records(series, "pr247");
  const pr269 = records(series, "pr269");
  const lastG3 = g3Records(series).at(-1);
  // The D2 early stop (owner decision 2026-10-16 (c)): the gates it leaves
  // undecided are `not measured`, never passed.
  const d2Stop = state.ended === "FAIL (D2)" ? firstD2NoMatch(series) : undefined;
  const gates = {
    G2:
      clean.length === 0
        ? "not run"
        : clean.every((r) => r.valid && (r.findings ?? []).length === 0)
          ? clean.length === 5
            ? "PASS"
            : `in progress (${String(clean.length)}/5)`
          : "FAIL",
    G3:
      lastG3 === undefined
        ? "not run"
        : lastG3.summary?.failedRun
          ? "not a gate result"
          : lastG3.summary?.pass
            ? "PASS"
            : "FAIL",
    "reliability #247":
      pr247.length === 0
        ? "not run"
        : pr247.every((r) => r.valid)
          ? pr247.length === 2
            ? "PASS"
            : "in progress"
          : "FAIL",
    A6: m247 === null || pr247.length < 2 ? "not decided" : a6Stops(m247) ? "FAIL" : "PASS",
    G1:
      pr269.length === 0
        ? "not run"
        : `${String(pr269.filter((r) => r.valid).length)}/${String(pr269.length)} valid — ${
            d2Stop !== undefined
              ? "stopped by D2"
              : pr269.filter((r) => !r.valid).length >= 2
                ? "FAIL"
                : pr269.length === 10
                  ? "PASS"
                  : "in progress"
          }`,
    "hand-read":
      d2Stop !== undefined
        ? `FAIL (no D2 match in ${d2Stop.stepId})`
        : checkedHandRead.pass === null
          ? checkedHandRead.problems.length > 0
            ? "pending (invalid evidence)"
            : "pending"
          : checkedHandRead.pass
            ? "PASS"
            : "FAIL",
    cost:
      d2Stop !== undefined
        ? "not measured"
        : lowerBound === null || state.ended !== "measured"
          ? "provisional"
          : exceedsLimit(lowerBound.total)
            ? "FAIL (pre-G5 lower bound)"
            : "provisional until G5",
  };

  let verdict;
  if (state.ended === "INCOMPLETE (budget)" || overshoot > 0) verdict = "INCOMPLETE (budget)";
  else if (state.ended === "INCOMPLETE (auth/credit)") verdict = "INCOMPLETE (auth/credit)";
  else if (state.ended === "FAIL (D2)") verdict = "NOT ADMITTED (hand-read)";
  else if (state.ended !== null && state.ended !== "measured") {
    verdict = `NOT ADMITTED (${state.ended.replace(/^FAIL \((.*)\)$/u, "$1")})`;
  } else if (state.ended === "measured" && lowerBound !== null && exceedsLimit(lowerBound.total)) {
    verdict = "NOT ADMITTED (cost)";
  } else if (state.ended === "measured" && checkedHandRead.pass !== null) {
    verdict = checkedHandRead.pass ? "ADMITTED (pending G5)" : "NOT ADMITTED (hand-read)";
  } else if (state.ended === "measured")
    verdict =
      checkedHandRead.problems.length > 0
        ? "measured — hand-read evidence invalid; regenerate with `resolve`"
        : "measured — hand-read pending";
  else verdict = `in progress — ${state.waitingFor ?? `next step: ${String(state.next)}`}`;
  // G5 runs only after ADMITTED (pending G5) (plan Phase 7): a verdict that rules it out leaves it unmeasured.
  gates.G5 = /^(NOT ADMITTED|INCOMPLETE \(budget\))/u.test(verdict) ? "not measured" : "pending (Phase 7)";

  return {
    verdict,
    gates,
    runs,
    m247,
    m269,
    provisional,
    lowerBound,
    spend: { ...spend, cap: BUDGET.cap, pause: BUDGET.pause, overshoot },
    state,
    handReadProblems: checkedHandRead.problems,
  };
}

const usd = (value) => (value === null || value === undefined ? "—" : `$${value.toFixed(6)}`);

/** The `gate.md` § Results block for an outcome. Markdown, no absolute paths. */
export function renderOutcome(outcome, { at }) {
  const lines = [
    `_Automatic outcome, written by \`scripts/glm-gate.mjs outcome\` at ${at}._`,
    "",
    `**Verdict:** ${outcome.verdict}`,
    "",
    "| Gate | Result |",
    "| ---- | ------ |",
    ...Object.entries(outcome.gates).map(([gate, result]) => `| ${gate} | ${result} |`),
    "",
    "| Run | Case | Valid | D2 | Reasons |",
    "| --- | ---- | ----- | -- | ------- |",
    ...outcome.runs.map(
      (run) =>
        `| ${run.stepId} | ${run.kind} | ${run.valid ? "yes" : run.sample ? "no" : "no — auth/credit stop, not a sample"} | ${run.d2 ?? "—"} | ${run.reasons.join(", ") || "—"} |`,
    ),
    "",
    `- m247 ${usd(outcome.m247)}, m269 ${usd(outcome.m269)}.`,
    `- Provisional projection (I = ${usd(IMPL_REVIEW_COST)}): ${usd(outcome.provisional?.total)}.`,
    `- Pre-G5 lower bound (I = ${usd(IMPL_REVIEW_COST / 2)}): ${usd(outcome.lowerBound?.total)}.`,
    `- T ${usd(outcome.spend.t)} (counter delta ${usd(outcome.spend.counterDelta)}, settled ${usd(outcome.spend.settledTotal)}) against the $${outcome.spend.pause.toFixed(2)} pause and the $${outcome.spend.cap.toFixed(2)} cap${outcome.spend.overshoot > 0 ? `; overshoot ${usd(outcome.spend.overshoot)}` : ""}.`,
    ...outcome.handReadProblems.map((problem) => `- Hand-read evidence: ${problem}.`),
  ];
  return lines.join("\n");
}

// --- Screening (this change's plan.md Phase 2 §1; owner decisions 2026-10-16) ------
//
// The paid screening before any pre-registration: G3's four fixture cases × 1
// (`sfix`), #247 × 1 (`s247-01`), #269 × 2 (`s269-01`, `s269-02`), in that
// order (H2), on its own ledger and T0 with the gate's classification and
// settlement. Screening runs are never gate samples.

export const SCREENING_KINDS = Object.freeze(["fixtures", "pr247", "pr269"]);

/** The screening's budget: T_s + P ≤ $0.75 (owner decision 4; H3). */
export const SCREENING_BUDGET = Object.freeze({ cap: 0.75 });

/** First-step P per kind (H3); afterwards P = the largest settled cost of that kind (1 ×, not the gate's 2 ×). */
export const SCREENING_FIRST_ESTIMATE = Object.freeze({ fixtures: 0.1, pr247: 0.15, pr269: 0.3 });

/** Stop rule (c): 53·m247 + 8·m269 above $10.00 − 13·$0.199620 = $7.404940 stops; equality does not. */
export const SCREENING_COST_BOUND = COST_LIMIT - COST_WEIGHTS.implReview * IMPL_REVIEW_COST;
const exceedsScreeningBound = (value) => value - SCREENING_COST_BOUND > EPSILON;

/** The #269 runs the screening executes (H2); a run stopped by a confirmed 401/402 is not replaced. */
export const SCREENING_PR269_RUNS = 2;

const screeningResults = (series) => series.filter((line) => line.type === "record" || line.type === "fixtures");
/** The #269 runs recorded so far, a confirmed-401/402 one included (it is not replaced). */
const pr269Done = (series) => series.filter((line) => line.type === "record" && line.kind === "pr269").length;
const pad2 = (n) => String(n).padStart(2, "0");

/**
 * The id the next step of a kind takes: `sfix`, then `sfix-02` after a
 * confirmed 401/402 (owner decision 2026-10-16); `s247-01`, `s247-02`;
 * `s269-01`, `s269-02`.
 */
export function screeningStepId(series, kind) {
  const done = startedSteps(series).filter((line) => line.kind === kind).length;
  if (kind === "fixtures") return done === 0 ? "sfix" : `sfix-${pad2(done + 1)}`;
  return `s${kind.slice(2)}-${pad2(done + 1)}`;
}

/** P for the screening (H3): the largest settled cost of this kind so far, else the first-step estimate. */
export function screeningEstimate(series, kind) {
  const costs = startedSteps(series)
    .filter((line) => line.kind === kind)
    .map((line) => settledLine(series, line.stepId)?.cost)
    .filter((cost) => typeof cost === "number");
  return costs.length === 0 ? SCREENING_FIRST_ESTIMATE[kind] : Math.max(...costs);
}

/**
 * Admission for a paid screening step (H3): refused while any step is
 * unsettled; a step whose T_s + P exceeds $0.75 is not started and ends the
 * screening INCOMPLETE (budget). Equality admits.
 */
export function admitScreening(series, kind, counterNow) {
  const unsettled = unsettledSteps(series);
  const spend = seriesSpend(series, counterNow);
  const p = screeningEstimate(series, kind);
  const base = {
    kind,
    t: spend.t,
    p,
    cap: SCREENING_BUDGET.cap,
    counterDelta: spend.counterDelta,
    settled: spend.settledTotal,
  };
  if (unsettled.length > 0) return { ...base, admit: false, refusal: `unsettled step(s) ${unsettled.join(", ")}` };
  if (spend.t + p - SCREENING_BUDGET.cap > EPSILON) return { ...base, admit: false, budgetStop: true };
  return { ...base, admit: true };
}

/**
 * The screened tree's baseline (owner decision 2026-10-16): the last
 * screening preflight before the first paid step. From that step on it is
 * frozen; a later preflight never moves it.
 */
export function screeningBaseline(series) {
  const firstStart = series.findIndex((line) => line.type === "started");
  const before = firstStart === -1 ? series : series.slice(0, firstStart);
  return before.findLast((line) => line.type === "preflight" && typeof line.treeSha256 === "string");
}

/** Stop rule (a): a finder request of the step ended `length` (a fixture row's included, H6). */
function lengthHit(line) {
  if (line.type === "fixtures") return (line.summary?.lengthRows ?? []).length > 0;
  const finishes = [...(line.requests ?? []), ...(line.steps ?? [])].map((request) => request?.finishReason);
  return (
    finishes.includes("length") || (line.reasons ?? []).some((r) => r === "length" || r === "finder-output:length")
  );
}

/**
 * Stop rule (b), on metadata only: an artifact-less CLI run with at least one
 * `retrying finder` line, no `retrying judge` line, no finder-output refusal,
 * and a timeout in its own terminal error; or a fixture row whose finder
 * timed out after the adapter's retry (H6).
 */
function timedOutAfterRetry(line) {
  if (line.type === "fixtures") return (line.summary?.timeoutRows ?? []).length > 0;
  const retries = line.retries ?? [];
  return (
    line.artifact !== true &&
    retries.some((retry) => retry.pass === "finder") &&
    !retries.some((retry) => retry.pass === "judge") &&
    !(line.reasons ?? []).some((reason) => reason.startsWith("finder-output:")) &&
    line.terminalTimeout === true
  );
}

/** A first-attempt finder timeout the retry recovered: a warning; its cost counts. */
function warningsOf(line) {
  if (line.type === "fixtures") {
    return (line.summary?.recoveredTimeoutRows ?? []).map(
      (row) =>
        `${line.stepId} testIdx ${String(row.testIdx)} (${String(row.case)}): a finder timeout recovered by the retry (its cost counts)`,
    );
  }
  const recovered = (line.retries ?? []).some((retry) => retry.pass === "finder" && /timeout/iu.test(retry.error));
  return recovered && !timedOutAfterRetry(line)
    ? [`${line.stepId}: a finder timeout recovered by the retry (its cost counts)`]
    : [];
}

const PAUSE_REASONS = Object.freeze(["auth-credit", "mismatch", "grader-error", "invalid-run"]);
const MISMATCH_REASONS = new Set(["provider-mismatch", "model-mismatch", "finder-model-mismatch"]);
const firstLine = (text) => String(text).split("\n")[0].slice(0, 120);
const rowCause = (row, cause) => `testIdx ${String(row.testIdx)} (${String(row.case)}): ${cause}`;

/**
 * The owner decision a step pauses for (owner decisions 2026-10-16), or
 * null: `{ reason, causes }`, the reason being the first of PAUSE_REASONS that
 * applies and `causes` every cause, so none is hidden. A fixtures step pauses
 * on a confirmed 401/402, a mismatch, a grader error, or an invalid row (a
 * failed export, a wrong reasoning shape, inline reasoning, any other finder
 * error); a missed metric alone is informational. A CLI run pauses when it is
 * invalid (H5).
 */
export function screeningPauseOf(line) {
  const causes = { "auth-credit": [], mismatch: [], "grader-error": [], "invalid-run": [] };
  if (line.type === "fixtures") {
    const summary = line.summary ?? {};
    for (const row of summary.authCreditRows ?? [])
      causes["auth-credit"].push(rowCause(row, `confirmed OpenRouter ${String(row.status)}`));
    for (const row of summary.invalidatedRows ?? [])
      causes.mismatch.push(rowCause(row, `providers ${JSON.stringify(row.providers)}`));
    for (const row of summary.modelRows ?? [])
      causes.mismatch.push(rowCause(row, `models ${JSON.stringify(row.models)}`));
    for (const row of summary.graderErrorRows ?? [])
      causes["grader-error"].push(
        rowCause(row, `grader error (${row.errors.map((e) => firstLine(e.reason)).join("; ")})`),
      );
    for (const row of summary.shapeRows ?? [])
      causes["invalid-run"].push(rowCause(row, "reasoning shape not the decided one"));
    for (const row of summary.inlineReasoningRows ?? []) causes["invalid-run"].push(rowCause(row, "inline reasoning"));
    const stopped = new Set((summary.authCreditRows ?? []).map((row) => row.testIdx));
    for (const row of summary.finderErrorRows ?? [])
      if (!stopped.has(row.testIdx)) causes["invalid-run"].push(rowCause(row, `finder error: ${firstLine(row.error)}`));
    if (summary.failedRun === true && summary.authCredit !== true && summary.graderError !== true)
      for (const problem of summary.problems ?? []) causes["invalid-run"].push(`failed export: ${firstLine(problem)}`);
  } else if (line.valid !== true) {
    if (line.authCredit === "confirmed") causes["auth-credit"].push("confirmed OpenRouter 401/402");
    const reasons = line.reasons ?? [];
    for (const reason of reasons) (MISMATCH_REASONS.has(reason) ? causes.mismatch : causes["invalid-run"]).push(reason);
    if (reasons.length === 0) causes["invalid-run"].push("invalid run");
  }
  const reason = PAUSE_REASONS.find((key) => causes[key].length > 0);
  if (reason === undefined) return null;
  return {
    reason,
    causes: PAUSE_REASONS.flatMap((key) => causes[key].map((cause) => (key === reason ? cause : `${cause} (${key})`))),
  };
}

const screeningContinued = (series, stepId, reason) =>
  series.some((line) => line.type === "continue" && line.stepId === stepId && line.for === reason);

/** Every stop rule that holds on `series`, one entry per rule: `{ rule, label, steps }`. */
function stopsHolding(series) {
  const holding = new Map();
  const add = (rule, label, stepId) => {
    const entry = holding.get(rule) ?? { rule, label, steps: [] };
    if (!entry.steps.includes(stepId)) entry.steps.push(stepId);
    holding.set(rule, entry);
  };
  for (const line of screeningResults(series)) {
    if (lengthHit(line)) add("a", "STOP (a: length)", line.stepId);
    if (timedOutAfterRetry(line)) add("b", "STOP (b: finder timeout after retry)", line.stepId);
  }
  // (c) from settled costs: after #247 settles, 53·m247 alone (H4); once both
  // #269 runs are recorded and settled, 53·m247 + 8·m269.
  const m247 = meanSettledCost(series, "pr247");
  if (m247 !== null) {
    const m269 = pr269Done(series) >= SCREENING_PR269_RUNS ? meanSettledCost(series, "pr269") : null;
    const total = COST_WEIGHTS.pr247 * m247 + (m269 === null ? 0 : COST_WEIGHTS.pr269 * m269);
    if (exceedsScreeningBound(total)) add("c", "STOP (c: cost)", m269 === null ? "53·m247 (H4)" : "53·m247 + 8·m269");
  }
  for (const record of valid269(series)) {
    if (d2LineFor(series, record.stepId)?.decision === "no-match")
      add("d", holding.has("d") ? holding.get("d").label : `STOP (d: no D2 in ${record.stepId})`, record.stepId);
  }
  return [...holding.values()];
}

/** Every stop rule that holds, in the order they first held; `ended` takes the first. */
function firedStops(series) {
  const firstHeld = new Map();
  for (let i = 1; i <= series.length; i += 1)
    for (const stop of stopsHolding(series.slice(0, i))) if (!firstHeld.has(stop.rule)) firstHeld.set(stop.rule, i);
  return stopsHolding(series).sort((x, y) => (firstHeld.get(x.rule) ?? Infinity) - (firstHeld.get(y.rule) ?? Infinity));
}

/**
 * Where the screening stands (plan Phase 2 §1). Pure.
 *
 * Returns `{ next, nextStepId, ended, fired, waitingFor, pause, warnings }`.
 * `ended`: a STOP label when any stop rule fired (the first to fire; `fired`
 * lists all), else `INCOMPLETE (budget)`, else `INCONCLUSIVE (no valid #269
 * run)` or `GO` once every step ran and settled, else null. `waitingFor`
 * names a D2 decision or a pause; `pause` is `{ stepId, reason, causes }`
 * for the step whose `continue` is due.
 */
export function screeningState(series) {
  const fired = firedStops(series);
  const warnings = screeningResults(series).flatMap(warningsOf);
  const base = { fired, warnings, next: null, nextStepId: null, ended: null, waitingFor: null, pause: null };
  if (fired.length > 0) return { ...base, ended: fired[0].label };
  if (
    series.some((line) => line.type === "budget_stop") ||
    seriesSpend(series).settledTotal - SCREENING_BUDGET.cap > EPSILON
  )
    return { ...base, ended: "INCOMPLETE (budget)" };
  const blocking = startedSteps(series).find(
    (line) => !screeningResults(series).some((result) => result.stepId === line.stepId),
  );
  if (blocking !== undefined) return { ...base, waitingFor: `step ${blocking.stepId} started and has no record` };

  for (const line of screeningResults(series)) {
    // After a #269 run the D2 line comes first, then any pause (owner decision 2026-10-16).
    if (line.type === "record" && line.kind === "pr269" && d2LineFor(series, line.stepId) === undefined)
      return { ...base, waitingFor: d2Wait(line, { screening: true }) };
    const pause = screeningPauseOf(line);
    if (pause !== null && !screeningContinued(series, line.stepId, pause.reason)) {
      const settle = unsettledSteps(series).includes(line.stepId) ? "`reconcile --screening`, then " : "";
      return {
        ...base,
        pause: { stepId: line.stepId, ...pause },
        waitingFor: `owner decision at ${line.stepId} (${pause.reason}: ${pause.causes.join("; ")}) — ${settle}\`continue --screening --for ${pause.reason} --note <text>\``,
      };
    }
  }

  // H2. A step stopped by a confirmed 401/402 is not a sample: `sfix` and
  // `s247-01` run once more after the owner's continue; #269 is not replaced.
  const fixtures = series.filter((line) => line.type === "fixtures" && !authCreditStopped(line));
  const step = (kind) => ({ ...base, next: kind, nextStepId: screeningStepId(series, kind) });
  if (fixtures.length === 0) return step("fixtures");
  if (records(series, "pr247").length === 0) return step("pr247");
  if (series.filter((line) => line.type === "record" && line.kind === "pr269").length < SCREENING_PR269_RUNS)
    return step("pr269");
  const unsettled = unsettledSteps(series);
  if (unsettled.length > 0)
    return { ...base, waitingFor: `settlement of step(s) ${unsettled.join(", ")} (\`reconcile --screening\`)` };
  if (valid269(series).length === 0) return { ...base, ended: "INCONCLUSIVE (no valid #269 run)" };
  return { ...base, ended: "GO" };
}

/**
 * The screening's outcome (plan Phase 2 §1 and Phase 3 §2). At `outcome` an
 * undecided D2 counts as no match (owner decision 2026-10-16, stop rule (d));
 * it is listed after every decided stop and named as undecided. A step that
 * ended with T_s above $0.75 gives INCOMPLETE (budget), its overshoot
 * recorded — unless a stop fired, which takes precedence.
 */
export function computeScreeningOutcome(series, { counterNow } = {}) {
  const state = screeningState(series);
  const fired = [...state.fired];
  const undecided = valid269(series).filter((record) => d2LineFor(series, record.stepId) === undefined);
  if (undecided.length > 0 && !fired.some((stop) => stop.rule === "d")) {
    fired.push({
      rule: "d",
      label: `STOP (d: no D2 in ${undecided[0].stepId})`,
      steps: undecided.map((record) => record.stepId),
      undecided: true,
    });
  }
  const spend = seriesSpend(series, counterNow);
  const overshoot = spend.t - SCREENING_BUDGET.cap > EPSILON ? spend.t - SCREENING_BUDGET.cap : 0;
  let verdict;
  if (fired.length > 0) verdict = fired[0].label;
  else if (state.ended === "INCOMPLETE (budget)" || overshoot > 0) verdict = "INCOMPLETE (budget)";
  else if (state.ended !== null) verdict = state.ended;
  else verdict = `in progress — ${state.waitingFor ?? `next step: ${String(state.nextStepId)}`}`;

  const m247 = meanSettledCost(series, "pr247");
  const m269 = meanSettledCost(series, "pr269");
  const steps = screeningResults(series).map((line) => {
    // Output tokens come off the stderr step lines: review.json's request telemetry carries none.
    const outputs = (line.steps ?? []).map((step) => step.outputTokens).filter((value) => typeof value === "number");
    return {
      stepId: line.stepId,
      kind: line.kind,
      valid: line.type === "record" ? line.valid : null,
      sample: !authCreditStopped(line),
      reasons: line.type === "record" ? line.reasons : [],
      pause: screeningPauseOf(line),
      d2: line.kind === "pr269" ? describeD2(d2LineFor(series, line.stepId)) : null,
      finderElapsedMs: line.finderElapsedMs ?? null,
      finderAttemptFailed: line.finderAttemptFailed ?? null,
      maxOutputTokens: outputs.length === 0 ? null : Math.max(...outputs),
      fixtures: line.type === "fixtures" ? line.summary : null,
    };
  });
  return {
    verdict,
    fired,
    warnings: state.warnings,
    state,
    steps,
    m247,
    m269,
    bound: {
      limit: SCREENING_COST_BOUND,
      total: m247 === null ? null : COST_WEIGHTS.pr247 * m247 + (m269 === null ? 0 : COST_WEIGHTS.pr269 * m269),
      // Stop rule (c) is decided on the mean of both #269 runs; on fewer, the total is information only.
      pr269Runs: series.filter((line) => line.type === "record" && line.kind === "pr269").length,
      decided: m247 !== null && m269 !== null && pr269Done(series) >= SCREENING_PR269_RUNS,
    },
    spend: { ...spend, cap: SCREENING_BUDGET.cap, overshoot },
  };
}

const fixturesInWords = (summary) => {
  if (summary === null || summary === undefined) return "—";
  if (summary.failedRun) return `not a result: ${(summary.problems ?? []).map(firstLine).join("; ")}`;
  return Object.entries(summary.g3?.cases ?? {})
    .map(
      ([key, c]) =>
        `${key} ${Object.entries(c.counts)
          .map(([metric, k]) => `${metric} ${String(k)}/${String(summary.repeats ?? 1)}`)
          .join(", ")}`,
    )
    .join("; ");
};

const elapsedInWords = (step) =>
  step.finderElapsedMs === null
    ? "—"
    : step.finderElapsedMs
        .map(
          (ms, i) =>
            `${ms === null ? "?" : `${String(Math.round(ms / 1000))} s`}${step.finderAttemptFailed?.[i] ? " (failed)" : ""}`,
        )
        .join("; ");

/** The `screening.md` § Results block for a screening outcome. Markdown, no absolute paths. */
export function renderScreeningOutcome(outcome, { at }) {
  const lines = [
    `_Automatic screening outcome, written by \`scripts/glm-gate.mjs outcome --screening\` at ${at}._`,
    "",
    `**Outcome:** ${outcome.verdict}`,
    "",
    `- Stop rules that hold: ${
      outcome.fired.length === 0
        ? "none"
        : outcome.fired
            .map(
              (stop) =>
                `${stop.label} — ${stop.steps.join(", ")}${stop.undecided ? " (D2 undecided: counted as no match)" : ""}`,
            )
            .join("; ")
    }.`,
    `- Warnings: ${outcome.warnings.length === 0 ? "none" : outcome.warnings.join("; ")}.`,
    ...(outcome.state.waitingFor === null ? [] : [`- Waiting for: ${outcome.state.waitingFor}.`]),
    "",
    "| Step | Kind | Valid | D2 | Finder attempts | Max output tokens | Reasons / pause |",
    "| ---- | ---- | ----- | -- | --------------- | ----------------- | --------------- |",
    ...outcome.steps.map((step) => {
      const valid =
        step.kind === "fixtures"
          ? "—"
          : step.valid
            ? "yes"
            : step.sample
              ? "no"
              : "no — auth/credit stop, not a sample";
      const why = [
        ...step.reasons,
        ...(step.pause === null ? [] : [`pause ${step.pause.reason}: ${step.pause.causes.join("; ")}`]),
      ];
      return `| ${step.stepId} | ${step.kind} | ${valid} | ${step.d2 ?? "—"} | ${elapsedInWords(step)} | ${step.maxOutputTokens === null ? "—" : `${String(step.maxOutputTokens)} / 16384`} | ${why.join(", ") || "—"} |`;
    }),
    "",
    `- m247 ${usd(outcome.m247)}, m269 ${usd(outcome.m269)}: ${
      outcome.bound.total === null
        ? "53·m247 + 8·m269 not computed yet"
        : outcome.m269 === null
          ? `53·m247 alone (H4) = ${usd(outcome.bound.total)}`
          : outcome.bound.decided
            ? `53·m247 + 8·m269 = ${usd(outcome.bound.total)}`
            : `53·m247 + 8·m269 = ${usd(outcome.bound.total)} on ${String(outcome.bound.pr269Runs)} of ${String(SCREENING_PR269_RUNS)} #269 runs (information only: stop rule (c) is decided on both)`
    } against ${usd(outcome.bound.limit)} (stop rule (c) above it).`,
    `- T_s ${usd(outcome.spend.t)} (counter delta ${usd(outcome.spend.counterDelta)}, settled ${usd(outcome.spend.settledTotal)}) against the $${outcome.spend.cap.toFixed(2)} cap${outcome.spend.overshoot > 0 ? `; overshoot ${usd(outcome.spend.overshoot)}` : ""}.`,
    ...outcome.steps
      .filter((step) => step.kind === "fixtures")
      .map((step) => `- Fixtures ${step.stepId} (informational): ${fixturesInWords(step.fixtures)}.`),
  ];
  return lines.join("\n");
}
