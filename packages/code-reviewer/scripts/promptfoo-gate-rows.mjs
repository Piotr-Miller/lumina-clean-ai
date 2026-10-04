// Turns one candidate's promptfoo export into checked gate rows and the G3/G4
// verdicts (change `finder-model-swap`, plan.md Phase 1 §3; protocol in
// context/changes/finder-model-swap/gate.md §4 and Amendment A1). The
// predecessor did this by hand; this script makes the provider, A3, cost and
// arithmetic checks code.
//
// Free: it reads files, it calls nothing.
//
// Usage (from packages/code-reviewer):
//   node scripts/promptfoo-gate-rows.mjs --export <promptfoo -o file.json> \
//     --expected-provider <OpenAI|Alibaba|Minimax> --out <gate-<slug>-promptfoo.jsonl> \
//     [--expected-verifier-provider <OpenAI|Anthropic>] \
//     [--regrade <promptfoo -o file.json of the re-grade run>]
//
// What fails a row (impl-review-phase-1 F2): a FINDER error (`response.error`
// — a provider error, a timeout, a FinderOutputError), a provider-name
// mismatch, or an A3 leak. promptfoo's row-level `success`/`error` are NOT
// used: a row whose grader failed one rubric has `success: false` and the
// grader's reason in `error`, and reading that as a dead row would fail every
// other metric of the row too. Metrics come from `componentResults`.
//
// A GRADER error is not a candidate failure (F3, Amendment A1): a row whose
// finder succeeded but whose grading has no component results, was aborted,
// or carries a component tagged `metadata.graderError` (promptfoo marks a
// grader transport/parse failure that way) is `graderError`. Such a row keeps
// everything the finder produced — provider and A3 checks, cost for G4 — but
// the run is a FAILED RUN, not a gate result, until the stored finder output
// of those rows is re-graded once (scripts/promptfoo-regrade-config.mjs, then
// `--regrade`). A second grader error ends the run for an owner decision.
//
// A provider mismatch or an A3 leak on ANY row — cross-hunk included, which
// has no required metric — is its own failing result (`invalidatedRows`,
// `leakRows`), printed apart from G3 and G4 (F4). G4 is cost only.
//
// VERIFIER ROWS (change `finder-verification`, plan.md Phase 2 §2): with
// `--expected-verifier-provider`, every row must also carry the verifier's
// record. Per row: the verifier's provider (a mismatch INVALIDATES the row, as
// the finder's does), A3 on its requests (a leak fails the row), and its cost
// completeness — "not called, nothing sent" is complete, "called, no priced
// request" is not (owner, Phase 1 interpretation 6), and an incomplete verifier
// cost fails the result as a COST failure (`FAIL (cost)`, like G4), never a
// G3f quality failure, so it cannot trigger MAIN. A row whose verification did not run
// (`verification.status` other than `verified` / `no-findings`, e.g.
// `skipped-no-source`) is a MEASUREMENT ERROR: the run is a failed run, never a
// gate result (gate.md §5). G4 stays finder-only; the verifier's cost is
// printed beside it.
//
// Exit code: 0 when G3 and G4 pass and no row is invalidated, leaks or (on
// verifier rows) has an incomplete verifier cost, 1 when any of those fails or
// the run is not a gate result, 2 on a usage error.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** G4 ceiling: 3 × the matched baseline median $0.00100551 (gate.md §4). */
export const G4_CEILING = 0.00301653;

/**
 * The four archived cases, matched by description prefix (the promptfoo
 * filter in gate.md), and the metrics G3 requires 3/3 on each. Cross-hunk is
 * diagnostic: recorded, never required.
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
 * `response.error` is what the adapter returns on the error path (a provider
 * error, a timeout, a FinderOutputError); a row with no response or no
 * output at all is a finder failure too, never a free pass.
 */
export function finderErrorOf(raw) {
  const response = raw?.response;
  if (typeof response?.error === "string" && response.error.length > 0) return response.error;
  if (response?.output === undefined || response?.output === null) return "no finder output recorded";
  return null;
}

/**
 * Grader errors on a row whose finder succeeded: `[{metric, reason}]`, empty
 * when the grading is usable. A missing or empty component list (grading
 * never ran, or was aborted — promptfoo then sets `failureReason` 2 with no
 * provider error) is one error with `metric: null`; a component tagged
 * `metadata.graderError` (promptfoo's `graderFail`: the grader provider
 * errored or returned something unparsable) is one error per component.
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
// passed (issue_recall appears twice in the JS-loop case). Components that
// errored in the grader carry no verdict and are left out: their metric is
// neither passed nor failed until the re-grade supplies it.
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

/**
 * The verifier's part of a row (verifier rows only), from the adapter's
 * `metadata.verifier` and `metadata.verification`. Missing telemetry fails
 * closed: no record means no proof of the provider, the A3 state or the cost.
 */
export function verifierChecksOf(raw, expectedVerifierProvider) {
  const metadata = raw?.response?.metadata ?? {};
  const verifier = metadata.verifier;
  const status = typeof metadata.verification?.status === "string" ? metadata.verification.status : null;
  const requests = Array.isArray(verifier?.requests) ? verifier.requests : [];
  const providers = requests.map((r) => (typeof r?.provider === "string" ? r.provider : null));
  const mismatch = providers.filter((p) => p !== expectedVerifierProvider);
  const called = verifier?.called === true;
  const reported = typeof verifier?.called === "boolean";
  const costs = requests.map((r) => (typeof r?.cost === "number" ? r.cost : null));
  return {
    verificationStatus: status,
    verifierReported: reported,
    verifierCalled: called,
    verifierProviders: providers,
    verifierMismatch: mismatch,
    verifierLeak: verifier?.reasoningLeak !== false,
    verifierCostComplete: reported && (!called || (costs.length > 0 && costs.every((c) => c !== null))),
    verifierCost: costs.reduce((total, c) => total + (c ?? 0), 0),
  };
}

/** One export row → one checked gate row. Missing telemetry fails closed. */
export function checkRow(raw, expectedProvider, expectedVerifierProvider) {
  const metadata = raw?.response?.metadata ?? {};
  const description = raw?.testCase?.description ?? raw?.description ?? null;
  const stepProviders = Array.isArray(metadata.stepProviders) ? metadata.stepProviders : [];
  const stepCostReported = Array.isArray(metadata.stepCostReported) ? metadata.stepCostReported : [];
  const providerMismatch = stepProviders.filter((p) => p !== expectedProvider);
  const retries = Array.isArray(metadata.retries) ? metadata.retries : null;
  const graderErrors = graderErrorsOf(raw);
  const regradeOf = raw?.testCase?.metadata?.regradeOf;
  const finderError = finderErrorOf(raw);
  const v = expectedVerifierProvider === undefined ? null : verifierChecksOf(raw, expectedVerifierProvider);
  // A row whose verification did not run is a measurement error — unless the
  // finder already failed, in which case there was nothing to verify.
  const measurementError =
    v === null || finderError !== null || v.verificationStatus === "verified" || v.verificationStatus === "no-findings"
      ? null
      : `verification status ${JSON.stringify(v.verificationStatus)}`;
  const verifierInvalidated = v !== null && v.verifierMismatch.length > 0;
  const verifierLeak = v !== null && finderError === null && v.verifierLeak;
  return {
    id: typeof raw?.id === "string" ? raw.id : null,
    testIdx: Number.isInteger(raw?.testIdx) ? raw.testIdx : null,
    case: caseOf(description)?.key ?? null,
    description,
    provider: raw?.provider?.label ?? raw?.provider?.id ?? null,
    finderError,
    // promptfoo's row-level verdict text: the grader's reason on an assertion
    // failure, the finder's error on a provider error. Information only.
    rowError: typeof raw?.error === "string" ? raw.error : null,
    stepProviders,
    // No request at all cannot prove the pin either; the row has failed anyway.
    providerOk: stepProviders.length > 0 && providerMismatch.length === 0,
    invalidated: providerMismatch.length > 0 || verifierInvalidated,
    providerMismatch,
    stepCostReported,
    costComplete: stepCostReported.length > 0 && stepCostReported.every((reported) => reported === true),
    // Fails closed: a row that did not report its A3 state cannot pass.
    reasoningLeak: metadata.reasoningLeak !== false || verifierLeak,
    reasoningReported: typeof metadata.reasoningLeak === "boolean",
    retries,
    steps: metadata.steps ?? null,
    toolCalls: metadata.toolCalls ?? null,
    repairs: metadata.repairs ?? null,
    finderCost: typeof metadata.cost === "number" ? metadata.cost : null,
    latencyMs: raw?.latencyMs ?? null,
    metrics: metricsOf(componentsOf(raw)),
    graderError: graderErrors.length > 0,
    graderErrors,
    graderErrorMetrics: [...new Set(graderErrors.map((e) => e.metric).filter((m) => m !== null))],
    regraded: false,
    regradeOf: typeof regradeOf === "string" ? regradeOf : null,
    measurementError,
    // Verifier rows only; null on a finder-only export.
    verifier: v,
  };
}

/**
 * Applies a re-grade run (Amendment A1) to the checked rows of the original
 * export. Only a grader-error row of the original may be re-graded, each
 * exactly once; the re-graded row keeps everything the finder produced and
 * takes ONLY the metrics the grader had failed to grade from the re-grade.
 * Every violation is a problem that makes the run a failed run — never a
 * silent merge.
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
    // A grader error on named metrics → only those come from the re-grade;
    // a whole-grading error (no component results) → every metric does.
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

const retryClassOf = (retry) => retry?.class ?? retry?.error ?? null;

/**
 * G3 and G4 over the checked rows, plus the per-row results that fail on
 * their own. A row with a finder error, a provider mismatch, an A3 leak or a
 * grader error counts for none of its case's metrics. G4 (cost) fails on any
 * row with incomplete cost — never omitted, never counted as free — or a
 * median above the ceiling. Grader-error rows make the run a failed run.
 */
export function summarizeRows(rows, extraProblems = []) {
  const problems = [...extraProblems];
  if (rows.length !== EXPECTED_ROWS) problems.push(`${String(rows.length)} rows, expected ${String(EXPECTED_ROWS)}`);
  const unknown = rows.filter((r) => r.case === null);
  if (unknown.length > 0) problems.push(`${String(unknown.length)} row(s) outside the four archived cases`);
  for (const c of CASES) {
    const count = rows.filter((r) => r.case === c.key).length;
    if (count !== REPEATS) problems.push(`case ${c.key}: ${String(count)} rows, expected ${String(REPEATS)}`);
  }

  const allRetries = rows.flatMap((r) => r.retries ?? []);
  const retryCount = allRetries.length;
  // A request aborted by a timeout emits no step, so its cost is not in the
  // telemetry even though the provider may bill it (impl-review-phase-1 F5).
  // Reported, not gated: the key's usage counter governs the budget (gate.md
  // §7); such a row is "possibly under-costed", and G4 is not failed by it.
  const timeoutRetries = allRetries.filter((retry) => retryClassOf(retry) === "timeout").length;
  const missingRetryField = rows.filter((r) => r.retries === null).length;
  const invalidatedRows = rows
    .filter((r) => r.invalidated)
    .map((r) => ({
      ...rowRef(r),
      providers: r.stepProviders,
      ...((r.verifier ?? null) === null ? {} : { verifierProviders: r.verifier.verifierProviders }),
    }));
  const leakRows = rows.filter((r) => r.reasoningLeak).map((r) => ({ ...rowRef(r), reported: r.reasoningReported }));
  const finderErrorRows = rows
    .filter((r) => r.finderError !== null)
    .map((r) => ({ ...rowRef(r), error: r.finderError }));
  const graderErrorRows = rows
    .filter((r) => r.graderError)
    .map((r) => ({ ...rowRef(r), id: r.id, errors: r.graderErrors }));
  const regradedRows = rows.filter((r) => r.regraded).map((r) => ({ ...rowRef(r), id: r.id }));
  // Verifier rows: a row whose verification did not run makes the run a FAILED
  // RUN (a measurement error, gate.md §5), never a gate result.
  const measurementErrorRows = rows
    .filter((r) => (r.measurementError ?? null) !== null)
    .map((r) => ({ ...rowRef(r), error: r.measurementError }));
  if (measurementErrorRows.length > 0) {
    problems.push(
      `${String(measurementErrorRows.length)} row(s) whose verification did not run (testIdx ${measurementErrorRows
        .map((r) => String(r.testIdx))
        .join(", ")}) — a measurement error, not a gate result`,
    );
  }
  const verifierRows = rows.filter((r) => (r.verifier ?? null) !== null);
  const verifier =
    verifierRows.length === 0
      ? null
      : {
          rows: verifierRows.length,
          called: verifierRows.filter((r) => r.verifier.verifierCalled).length,
          incompleteCost: verifierRows.filter((r) => !r.verifier.verifierCostComplete).length,
          cost: verifierRows.reduce((total, r) => total + r.verifier.verifierCost, 0),
          medianCost: median(verifierRows.map((r) => r.verifier.verifierCost)),
        };
  // An incomplete verifier cost is a COST failure, like G4 — never a G3f
  // quality failure, so it can never trigger MAIN: the arm ends `FAIL (cost)`
  // and the owner decides (owner, 2026-10-04; gate.md §4–§5, R3).
  if (verifier !== null) {
    verifier.failure =
      verifier.incompleteCost === 0 ? null : { label: "FAIL (cost)", kind: "cost", triggersMain: false };
  }
  const base = {
    rowCount: rows.length,
    retryCount,
    timeoutRetries,
    missingRetryField,
    invalidatedRows,
    leakRows,
    finderErrorRows,
    graderErrorRows,
    regradedRows,
    measurementErrorRows,
    verifier,
  };

  if (problems.length > 0) return { failedRun: true, problems, ...base };

  // G4 is cost only, over every row; computed before the grader-error check
  // so a failed run still shows what the finder cost (Amendment A1).
  const incompleteCost = rows.filter((r) => !r.costComplete || r.finderCost === null).length;
  const costs = rows.map((r) => r.finderCost ?? 0);
  const g4Median = median(costs);
  const g4 = {
    pass: incompleteCost === 0 && g4Median <= G4_CEILING,
    median: g4Median,
    max: Math.max(...costs),
    ceiling: G4_CEILING,
    ratio: g4Median / G4_CEILING,
    incompleteCost,
    timeoutRetries,
  };
  const latencies = rows.map((r) => r.latencyMs).filter((v) => typeof v === "number");
  const latency = latencies.length === 0 ? null : { median: median(latencies), max: Math.max(...latencies) };

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
      g4,
      latency,
    };
  }

  const rowOk = (r) => r.finderError === null && !r.invalidated && !r.reasoningLeak && !r.graderError;
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
      g4.pass &&
      invalidatedRows.length === 0 &&
      leakRows.length === 0 &&
      (verifier === null || verifier.incompleteCost === 0),
    ...base,
    g3,
    g4,
    latency,
  };
}

/** The export's rows: `results.results` in promptfoo's `-o` JSON. */
export function exportRows(exportJson) {
  const rows = exportJson?.results?.results;
  if (!Array.isArray(rows)) throw new Error("not a promptfoo export: results.results is missing");
  return rows;
}

function main(args) {
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const exportPath = flag("--export");
  const expectedProvider = flag("--expected-provider");
  const out = flag("--out");
  const regradePath = flag("--regrade");
  const expectedVerifierProvider = flag("--expected-verifier-provider");
  if (exportPath === undefined || expectedProvider === undefined || out === undefined) {
    console.error(
      "usage: --export <file.json> --expected-provider <name> --out <rows.jsonl> " +
        "[--expected-verifier-provider <name>] [--regrade <file.json>]",
    );
    return 2;
  }
  const readExport = (path) =>
    exportRows(JSON.parse(readFileSync(path, "utf8"))).map((raw) =>
      checkRow(raw, expectedProvider, expectedVerifierProvider),
    );
  let rows = readExport(exportPath);
  let problems = [];
  if (regradePath !== undefined) ({ rows, problems } = mergeRegrade(rows, readExport(regradePath)));
  writeFileSync(out, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : ""));
  const summary = summarizeRows(rows, problems);

  if (summary.failedRun) {
    console.log(`FAILED RUN, not a gate result: ${summary.problems.join("; ")}`);
  } else {
    for (const [key, c] of Object.entries(summary.g3.cases)) {
      const counts = Object.entries(c.counts)
        .map(
          ([metric, k]) =>
            `${metric} ${String(k)}/${String(REPEATS)}${c.diagnostic.includes(metric) ? " (diagnostic)" : ""}`,
        )
        .join(", ");
      console.log(`G3 ${key}: ${counts || "-"}`);
    }
    console.log(`G3: ${summary.g3.pass ? "PASS" : "FAIL"}`);
  }
  if (summary.g4 !== undefined) {
    console.log(
      `G4: ${summary.g4.pass ? "PASS" : "FAIL"} median $${summary.g4.median.toFixed(8)} max $${summary.g4.max.toFixed(8)} ` +
        `(ceiling $${String(G4_CEILING)}, ratio ${summary.g4.ratio.toFixed(3)}, incomplete cost ${String(summary.g4.incompleteCost)}; ` +
        `timeout-triggered retries ${String(summary.g4.timeoutRetries)} — possibly under-costed telemetry, does not fail G4)`,
    );
  }
  if (summary.verifier !== null) {
    const v = summary.verifier;
    console.log(
      `verifier: called on ${String(v.called)}/${String(v.rows)} row(s), cost $${v.cost.toFixed(8)} ` +
        `(median $${v.medianCost.toFixed(8)} per row), incomplete verifier cost ${String(v.incompleteCost)} ` +
        `(G4 above is finder-only)`,
    );
  }
  if (summary.verifier?.failure) {
    console.log(
      `VERIFIER COST: ${summary.verifier.failure.label} — a cost failure like G4, NOT a G3f quality failure; ` +
        "it cannot trigger MAIN, and the owner decides",
    );
  }
  if (summary.measurementErrorRows.length > 0) {
    console.log(`MEASUREMENT-ERROR rows: ${JSON.stringify(summary.measurementErrorRows)}`);
  }
  if (summary.invalidatedRows.length > 0) {
    console.log(`INVALIDATED rows (provider mismatch, fails on its own): ${JSON.stringify(summary.invalidatedRows)}`);
  }
  if (summary.leakRows.length > 0) {
    console.log(`A3 LEAK rows (reasoning on a request, fails on its own): ${JSON.stringify(summary.leakRows)}`);
  }
  if (summary.finderErrorRows.length > 0) console.log(`finder-error rows: ${JSON.stringify(summary.finderErrorRows)}`);
  if (summary.graderErrorRows.length > 0) console.log(`GRADER-ERROR rows: ${JSON.stringify(summary.graderErrorRows)}`);
  if (summary.regradedRows.length > 0)
    console.log(`re-graded rows (once, Amendment A1): ${JSON.stringify(summary.regradedRows)}`);
  console.log(
    `retries: ${String(summary.retryCount)} (timeout-triggered: ${String(summary.timeoutRetries)})${summary.missingRetryField > 0 ? ` (${String(summary.missingRetryField)} row(s) without the retries field)` : ""}`,
  );
  console.log(`SUMMARY ${JSON.stringify(summary)}`);
  return !summary.failedRun && summary.pass ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
