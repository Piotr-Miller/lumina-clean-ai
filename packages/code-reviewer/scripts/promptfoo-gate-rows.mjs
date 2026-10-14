// Turns the G3 promptfoo export of change `finder-glm-5-3` into checked gate
// rows and the G3 verdict (plan.md Phase 3 §2). Ported from `finder-model-swap`
// (commit 29b15b8) and amended:
//
// - A3's `reasoningLeak` is inverted. glm-5.3 reasons by design, so a row is
//   checked for the DECIDED reasoning shape — every outgoing finder request
//   body carried `reasoning: {enabled: true, effort: "low"}`, captured on the
//   wire by evals/finder-provider.ts — and for no inline reasoning (a
//   FinderOutputError with reason `inline-reasoning`). Owner decision
//   2026-10-13.
// - G4 (the per-attempt cost ceiling) is gone; the monthly projection replaces
//   it (owner decision 3). Row cost is still recorded, as information.
// - The expected provider is the set {Z.AI, Fireworks, Together}, read from
//   what each request's RAW response reported, and every request must also
//   report an accepted model (owner decision 2026-10-13, A3).
//
// Free: it reads files, it calls nothing.
//
// Usage (from packages/code-reviewer):
//   node scripts/promptfoo-gate-rows.mjs --export <promptfoo -o file.json> --out <g3-rows.json> \
//     [--regrade <promptfoo -o file.json of the re-grade run>]
//
// What fails a row: a FINDER error (`response.error` — a provider error, a
// timeout, a FinderOutputError), a request served by an unlisted or
// unreported provider, a request without a reported accepted model, a request
// body without the decided reasoning shape, or inline reasoning. promptfoo's
// row-level `success`/`error` are NOT used: a row whose grader failed one
// rubric has `success: false` and the grader's reason in `error`, and reading
// that as a dead row would fail every other metric of the row too. Metrics
// come from `componentResults`.
//
// A GRADER error is not a candidate failure (finder-model-swap Amendment A1):
// such a row keeps everything the finder produced, but the run is a FAILED
// RUN, not a gate result, until the stored finder output of those rows is
// re-graded once (scripts/promptfoo-regrade-config.mjs, then `--regrade`). A
// second grader error ends the run for an owner decision.
//
// Exit code: 0 when G3 passes and no row fails on its own, 1 when anything
// fails or the run is not a gate result, 2 on a usage error.
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

import { ACCEPTED_MODEL, DECIDED_REASONING, G3_PROVIDER_LABEL, LISTED_PROVIDERS } from "./glm-gate-core.mjs";

/**
 * The four registered cases, matched by description prefix (the promptfoo
 * filter), and the metrics G3 requires 3/3 on each (finder-model-swap gate.md
 * §4). Cross-hunk is diagnostic: recorded, never required.
 */
export const CASES = [
  { prefix: "Finds the material", key: "js-loop", required: ["issue_recall"] },
  {
    prefix: "React 16->19",
    key: "react",
    required: ["issue_recall", "review_fails", "flaw_stale_closure", "flaw_lost_cleanup", "flaw_unsafe_html"],
  },
  {
    prefix: "Cross-hunk contract",
    key: "cross-hunk",
    required: [],
    diagnostic: ["tool_required", "flaw_cross_hunk_contract"],
  },
  { prefix: "Defect-free mechanical rename", key: "clean", required: ["no_false_alarms"] },
];
export const REPEATS = 3;
export const EXPECTED_ROWS = CASES.length * REPEATS;

const caseOf = (description) => CASES.find((c) => typeof description === "string" && description.startsWith(c.prefix));

const componentsOf = (raw) => {
  const components = raw?.gradingResult?.componentResults;
  return Array.isArray(components) ? components : null;
};

const isGraderErrorComponent = (component) => component?.metadata?.graderError === true;

/**
 * The finder's own failure on a row, or null when it produced an output.
 * `response.error` is what the adapter returns on the error path; a row with
 * no response or no output at all is a finder failure too, never a free pass.
 */
export function finderErrorOf(raw) {
  const response = raw?.response;
  if (typeof response?.error === "string" && response.error.length > 0) return response.error;
  if (response?.output === undefined || response?.output === null) return "no finder output recorded";
  return null;
}

/**
 * Grader errors on a row whose finder succeeded: `[{metric, reason}]`, empty
 * when the grading is usable. A missing or empty component list is one error
 * with `metric: null`; a component tagged `metadata.graderError` is one error
 * per component.
 */
export function graderErrorsOf(raw) {
  if (finderErrorOf(raw) !== null) return [];
  const components = componentsOf(raw);
  if (components === null || components.length === 0) {
    const aborted = raw?.failureReason === 2 && typeof raw?.error === "string";
    return [{ metric: null, reason: aborted ? `grading aborted: ${raw.error}` : "no component results" }];
  }
  return components
    .filter(isGraderErrorComponent)
    .map((c) => ({ metric: c.assertion?.metric ?? null, reason: typeof c.reason === "string" ? c.reason : "" }));
}

// A metric passes in a row only when EVERY component assertion carrying it
// passed. Components that errored in the grader carry no verdict and are left
// out until the re-grade supplies them.
function metricsOf(components) {
  const metrics = {};
  for (const component of components ?? []) {
    if (isGraderErrorComponent(component)) continue;
    const metric = component?.assertion?.metric;
    if (typeof metric !== "string") continue;
    metrics[metric] = (metrics[metric] ?? true) && component.pass === true;
  }
  return metrics;
}

const reportedValue = (field) => (field?.source === "reported" ? field.value : null);

/** One export row → one checked gate row. Missing telemetry fails closed. */
export function checkRow(raw) {
  const metadata = raw?.response?.metadata ?? {};
  const description = raw?.testCase?.description ?? raw?.description ?? null;
  const requests = Array.isArray(metadata.requests) ? metadata.requests : [];
  const requestReasoning = Array.isArray(metadata.requestReasoning) ? metadata.requestReasoning : [];
  const providers = requests.map((request) => reportedValue(request?.provider));
  const models = requests.map((request) => reportedValue(request?.model));
  const providerMismatch = providers.filter((p) => !LISTED_PROVIDERS.includes(p));
  const modelMismatch = models.filter((m) => typeof m !== "string" || !ACCEPTED_MODEL.test(m));
  const retries = Array.isArray(metadata.retries) ? metadata.retries : null;
  const graderErrors = graderErrorsOf(raw);
  const regradeOf = raw?.testCase?.metadata?.regradeOf;
  return {
    id: typeof raw?.id === "string" ? raw.id : null,
    testIdx: Number.isInteger(raw?.testIdx) ? raw.testIdx : null,
    case: caseOf(description)?.key ?? null,
    description,
    provider: raw?.provider?.label ?? raw?.provider?.id ?? null,
    finderError: finderErrorOf(raw),
    // promptfoo's row-level verdict text: the grader's reason on an assertion
    // failure, the finder's error on a provider error. Information only.
    rowError: typeof raw?.error === "string" ? raw.error : null,
    providers,
    providerMismatch,
    invalidated: requests.length === 0 || providerMismatch.length > 0,
    models,
    modelMismatch,
    modelInvalid: requests.length === 0 || modelMismatch.length > 0,
    requestReasoning,
    // At least one request body, and every one carrying exactly the decided shape.
    reasoningShapeOk:
      requestReasoning.length > 0 && requestReasoning.every((value) => isDeepStrictEqual(value, DECIDED_REASONING)),
    inlineReasoning: metadata.finderFailureReason === "inline-reasoning",
    // A CONFIRMED auth/credit failure: the finder error's typed HTTP status,
    // recorded by the adapter from the APICallError — never read from message
    // text (owner decision 2026-10-14). A "401" in the error text alone is an
    // ordinary finder error.
    finderErrorStatus: typeof metadata.finderErrorStatus === "number" ? metadata.finderErrorStatus : null,
    authCredit:
      finderErrorOf(raw) !== null && (metadata.finderErrorStatus === 401 || metadata.finderErrorStatus === 402),
    retries,
    steps: metadata.steps ?? null,
    toolCalls: metadata.toolCalls ?? null,
    repairs: metadata.repairs ?? null,
    costComplete: requests.length > 0 && requests.every((request) => typeof request?.cost === "number"),
    finderCost: typeof metadata.cost === "number" ? metadata.cost : null,
    latencyMs: raw?.latencyMs ?? null,
    metrics: metricsOf(componentsOf(raw)),
    graderError: graderErrors.length > 0,
    graderErrors,
    graderErrorMetrics: [...new Set(graderErrors.map((e) => e.metric).filter((m) => m !== null))],
    regraded: false,
    regradeOf: typeof regradeOf === "string" ? regradeOf : null,
  };
}

/**
 * Applies a re-grade run (finder-model-swap Amendment A1) to the checked rows
 * of the original export. Only a grader-error row of the original may be
 * re-graded, each exactly once; the re-graded row keeps everything the finder
 * produced and takes ONLY the metrics the grader had failed to grade. Every
 * violation is a problem that makes the run a failed run.
 */
export function mergeRegrade(rows, regradeRows) {
  const problems = [];
  const byId = new Map(rows.filter((r) => r.graderError && r.id !== null).map((r) => [r.id, r]));
  const seen = new Set();
  const merged = new Map();
  for (const rr of regradeRows) {
    if (rr.regradeOf === null) {
      problems.push(`re-grade row ${rr.id ?? "?"} names no original row (regradeOf)`);
      continue;
    }
    const id = rr.regradeOf;
    if (seen.has(id)) {
      problems.push(`row ${id} re-graded more than once`);
      continue;
    }
    seen.add(id);
    const original = byId.get(id);
    if (original === undefined) {
      problems.push(`re-grade row for ${id}, which is not a grader-error row of this export`);
      continue;
    }
    if (rr.finderError !== null) {
      problems.push(`re-grade row for ${id} has no stored output to grade: ${rr.finderError}`);
      continue;
    }
    if (rr.description !== original.description) {
      problems.push(`re-grade row for ${id} belongs to another case: ${String(rr.description)}`);
      continue;
    }
    if (rr.graderError) {
      problems.push(`grader error again on ${id}: ${rr.graderErrors.map((e) => e.reason).join("; ")}`);
      continue;
    }
    const wanted = original.graderErrorMetrics.length > 0 ? original.graderErrorMetrics : Object.keys(rr.metrics);
    const missing = wanted.filter((metric) => rr.metrics[metric] === undefined);
    if (wanted.length === 0 || missing.length > 0) {
      problems.push(`re-grade of ${id} did not grade ${missing.length > 0 ? missing.join(", ") : "anything"}`);
      continue;
    }
    const metrics = { ...original.metrics };
    for (const metric of wanted) metrics[metric] = rr.metrics[metric];
    merged.set(id, {
      ...original,
      metrics,
      graderError: false,
      graderErrors: [],
      graderErrorMetrics: [],
      regraded: true,
      regradeOf: id,
      regradeRowError: rr.rowError,
    });
  }
  for (const original of byId.values()) {
    if (!seen.has(original.id)) {
      problems.push(`grader-error row ${original.id} (testIdx ${String(original.testIdx)}) was not re-graded`);
    }
  }
  return { rows: rows.map((r) => merged.get(r.id) ?? r), problems };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)];
};

const rowRef = (r) => ({ testIdx: r.testIdx, case: r.case });

/**
 * G3 over the checked rows, plus the per-row results that fail on their own.
 * A row with a finder error, a provider or model mismatch, a wrong reasoning
 * shape, inline reasoning or a grader error counts for none of its case's
 * metrics. Grader-error rows make the run a failed run.
 */
export function summarizeRows(rows, extraProblems = []) {
  const problems = [...extraProblems];
  if (rows.length !== EXPECTED_ROWS) problems.push(`${String(rows.length)} rows, expected ${String(EXPECTED_ROWS)}`);
  const unknown = rows.filter((r) => r.case === null);
  if (unknown.length > 0) problems.push(`${String(unknown.length)} row(s) outside the four registered cases`);
  const otherLabel = rows.filter((r) => r.provider !== G3_PROVIDER_LABEL);
  if (otherLabel.length > 0) problems.push(`${String(otherLabel.length)} row(s) not from ${G3_PROVIDER_LABEL}`);
  for (const c of CASES) {
    const count = rows.filter((r) => r.case === c.key).length;
    if (count !== REPEATS) problems.push(`case ${c.key}: ${String(count)} rows, expected ${String(REPEATS)}`);
  }

  const allRetries = rows.flatMap((r) => r.retries ?? []);
  const invalidatedRows = rows.filter((r) => r.invalidated).map((r) => ({ ...rowRef(r), providers: r.providers }));
  const modelRows = rows.filter((r) => r.modelInvalid).map((r) => ({ ...rowRef(r), models: r.models }));
  const shapeRows = rows
    .filter((r) => !r.reasoningShapeOk)
    .map((r) => ({ ...rowRef(r), requestReasoning: r.requestReasoning }));
  const inlineReasoningRows = rows.filter((r) => r.inlineReasoning).map(rowRef);
  const authCreditRows = rows.filter((r) => r.authCredit).map((r) => ({ ...rowRef(r), status: r.finderErrorStatus }));
  const finderErrorRows = rows
    .filter((r) => r.finderError !== null)
    .map((r) => ({ ...rowRef(r), error: r.finderError }));
  const graderErrorRows = rows
    .filter((r) => r.graderError)
    .map((r) => ({ ...rowRef(r), id: r.id, errors: r.graderErrors }));
  const regradedRows = rows.filter((r) => r.regraded).map((r) => ({ ...rowRef(r), id: r.id }));
  const costs = rows.map((r) => r.finderCost).filter((cost) => typeof cost === "number");
  const latencies = rows.map((r) => r.latencyMs).filter((v) => typeof v === "number");
  const base = {
    rowCount: rows.length,
    retryCount: allRetries.length,
    invalidatedRows,
    modelRows,
    shapeRows,
    inlineReasoningRows,
    authCreditRows,
    finderErrorRows,
    graderErrorRows,
    regradedRows,
    // Information only: G3 has no cost criterion; the monthly projection is the cost gate.
    cost: {
      total: costs.reduce((sum, cost) => sum + cost, 0),
      median: costs.length === 0 ? null : median(costs),
      max: costs.length === 0 ? null : Math.max(...costs),
      incompleteRows: rows.filter((r) => !r.costComplete).length,
    },
    latency: latencies.length === 0 ? null : { median: median(latencies), max: Math.max(...latencies) },
  };

  // A confirmed OpenRouter 401/402 on a finder row prevents the measurement:
  // not a gate result, and the series stops INCOMPLETE (auth/credit) for the
  // owner (owner decision 2026-10-14). It outranks every other problem.
  if (authCreditRows.length > 0) {
    return {
      failedRun: true,
      authCredit: true,
      problems: [
        `confirmed OpenRouter ${[...new Set(authCreditRows.map((r) => String(r.status)))].join("/")} on finder row(s) testIdx ${authCreditRows
          .map((r) => String(r.testIdx))
          .join(", ")} — INCOMPLETE (auth/credit), not a gate result`,
        ...problems,
      ],
      ...base,
    };
  }

  if (problems.length > 0) return { failedRun: true, problems, ...base };

  if (graderErrorRows.length > 0) {
    return {
      failedRun: true,
      graderError: true,
      problems: [
        `${String(graderErrorRows.length)} grader-error row(s) (testIdx ${graderErrorRows
          .map((r) => String(r.testIdx))
          .join(", ")}) — not a candidate failure; re-grade their stored output once (Amendment A1)`,
      ],
      ...base,
    };
  }

  const rowOk = (r) =>
    r.finderError === null && !r.invalidated && !r.modelInvalid && r.reasoningShapeOk && !r.inlineReasoning;
  const g3 = { pass: true, cases: {} };
  for (const c of CASES) {
    const caseRows = rows.filter((r) => r.case === c.key);
    const counts = {};
    for (const metric of [...c.required, ...(c.diagnostic ?? [])]) {
      counts[metric] = caseRows.filter((r) => rowOk(r) && r.metrics[metric] === true).length;
    }
    const failed = c.required.filter((metric) => counts[metric] !== REPEATS);
    if (failed.length > 0) g3.pass = false;
    g3.cases[c.key] = { counts, failed, diagnostic: c.diagnostic ?? [] };
  }

  return {
    failedRun: false,
    pass:
      g3.pass &&
      finderErrorRows.length === 0 &&
      invalidatedRows.length === 0 &&
      modelRows.length === 0 &&
      shapeRows.length === 0 &&
      inlineReasoningRows.length === 0,
    ...base,
    g3,
  };
}

/** The export's rows: `results.results` in promptfoo's `-o` JSON. */
export function exportRows(exportJson) {
  const rows = exportJson?.results?.results;
  if (!Array.isArray(rows)) throw new Error("not a promptfoo export: results.results is missing");
  return rows;
}

/** Checked rows (merged with a re-grade when given) and their summary. */
export function checkExport(exportJson, regradeJson) {
  let rows = exportRows(exportJson).map((raw) => checkRow(raw));
  let problems = [];
  if (regradeJson !== undefined) {
    ({ rows, problems } = mergeRegrade(
      rows,
      exportRows(regradeJson).map((raw) => checkRow(raw)),
    ));
  }
  return { rows, summary: summarizeRows(rows, problems) };
}

/** The human-readable lines for one checked export. */
export function describeSummary(summary) {
  const lines = [];
  if (summary.failedRun) {
    lines.push(`FAILED RUN, not a gate result: ${summary.problems.join("; ")}`);
  } else {
    for (const [key, c] of Object.entries(summary.g3.cases)) {
      const counts = Object.entries(c.counts)
        .map(
          ([metric, k]) =>
            `${metric} ${String(k)}/${String(REPEATS)}${c.diagnostic.includes(metric) ? " (diagnostic)" : ""}`,
        )
        .join(", ");
      lines.push(`G3 ${key}: ${counts || "-"}`);
    }
    lines.push(`G3: ${summary.pass ? "PASS" : "FAIL"}`);
  }
  const lists = [
    ["PROVIDER-MISMATCH rows (fail on their own)", summary.invalidatedRows],
    ["MODEL rows (no reported accepted model; fail on their own)", summary.modelRows],
    ["REASONING-SHAPE rows (fail on their own)", summary.shapeRows],
    ["INLINE-REASONING rows (fail on their own)", summary.inlineReasoningRows],
    ["AUTH/CREDIT rows (confirmed 401/402; INCOMPLETE)", summary.authCreditRows],
    ["finder-error rows", summary.finderErrorRows],
    ["GRADER-ERROR rows", summary.graderErrorRows],
    ["re-graded rows (once, Amendment A1)", summary.regradedRows],
  ];
  for (const [label, list] of lists) if (list.length > 0) lines.push(`${label}: ${JSON.stringify(list)}`);
  lines.push(
    `retries: ${String(summary.retryCount)}; finder cost total $${summary.cost.total.toFixed(6)} (rows without complete cost: ${String(summary.cost.incompleteRows)}; information only)`,
  );
  return lines;
}

function main(args) {
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const exportPath = flag("--export");
  const out = flag("--out");
  const regradePath = flag("--regrade");
  if (exportPath === undefined || out === undefined) {
    console.error("usage: --export <file.json> --out <g3-rows.json> [--regrade <file.json>]");
    return 2;
  }
  const read = (path) => JSON.parse(readFileSync(path, "utf8"));
  const { rows, summary } = checkExport(read(exportPath), regradePath === undefined ? undefined : read(regradePath));
  writeFileSync(out, `${JSON.stringify({ rows, summary }, null, 2)}\n`);
  for (const line of describeSummary(summary)) console.log(line);
  return !summary.failedRun && summary.pass ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
