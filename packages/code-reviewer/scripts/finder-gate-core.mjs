// Pure logic of the finder gate runner (change `finder-model-swap`, plan.md
// Phase 1; protocol in context/changes/finder-model-swap/gate.md). Split out of
// finder-gate.mjs so it can be tested without a network or an API key: the
// runner itself only wires these functions to the real reviewer.
//
// The only package import is retry.ts, which plain `node` can load (type
// stripping, no relative `.js` imports), so the runner can reject a bad
// command line before it loads the reviewer.
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
};

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

  const model = required("--model");
  const endpoint = required("--endpoint");
  const expectedName = ENDPOINT_NAMES[endpoint];
  if (expectedName === undefined) throw new Error(`unknown endpoint slug ${JSON.stringify(endpoint)}`);
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
    model,
    endpoint,
    expectedName,
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
 * Attempt numbers of an existing series file that `start` would collide with.
 * A non-empty result means the run must refuse: a recorded attempt is never
 * re-run.
 */
export function recordedClashes(fileText, start) {
  return fileText
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line).attempt)
    .filter((attempt) => attempt >= start);
}

/**
 * Throws unless the series file may be written: a fresh series (no
 * `--append`) only into a missing or empty file — otherwise repeating, say,
 * `--through 1` would silently overwrite and re-run the A3 probe — and a
 * continuation only past the attempts already recorded.
 */
export function assertSeriesWritable({ append, start, existingText, out }) {
  if (!append) {
    if (existingText !== undefined && existingText !== "") {
      throw new Error(`${out} already holds a series; continue it with --start <k> --append, never overwrite it`);
    }
    return;
  }
  if (existingText === undefined) throw new Error(`--append needs an existing series file, ${out} does not exist`);
  const clash = recordedClashes(existingText, start);
  if (clash.length > 0)
    throw new Error(`attempts ${clash.join(", ")} already recorded in ${out}; refusing to re-run them`);
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
 * One gate attempt = one production pass, including production's single
 * transient retry (owner, 2026-10-03; gate.md §4 "Retries as in production"):
 * `fn` runs inside `withOneRetry` from src/retry.ts — the same classifier and
 * the same header-aware delay, not a copy. Each retry is recorded with its
 * error class and delay. Never throws: the outcome is data.
 */
export async function runAttempt(fn, { sleep, random } = {}) {
  const retries = [];
  try {
    const result = await withOneRetry(fn, {
      sleep,
      random,
      onRetry: (error, delayMs) => retries.push({ class: classify(error), delayMs }),
    });
    return { result, retries };
  } catch (error) {
    return { error, retries };
  }
}

/**
 * Judges one attempt from its requests (both tries, when it was retried):
 * every request must report the pinned endpoint's name (a missing or different
 * name INVALIDATES the attempt); any reasoning token or reasoning text on any
 * request is an A3 leak; a request without a reported cost leaves the cost
 * incomplete, which G4 treats as a failure, never as free.
 */
export function evaluateAttempt({ requests, outcome, expectedName }) {
  const providerMismatch = requests.filter((r) => r.provider !== expectedName).map((r) => r.provider);
  const reasoningLeak = requests.some(
    (r) => (r.reasoningTokens.sdk ?? 0) > 0 || (r.reasoningTokens.openrouter ?? 0) > 0 || r.reasoningTextChars > 0,
  );
  const cost = requests.reduce((total, r) => total + (r.cost ?? 0), 0);
  const costComplete = requests.length > 0 && requests.every((r) => r.cost !== null);
  const invalidated = providerMismatch.length > 0;
  const g1Pass = !invalidated && !reasoningLeak && (outcome === "valid" || outcome === "valid-after-repair");
  return { providerMismatch, invalidated, reasoningLeak, cost, costComplete, g1Pass };
}
