// Turns one candidate's promptfoo export into checked gate rows and the G3/G4
// verdicts (change `finder-model-swap`, plan.md Phase 1 §3; protocol in
// context/changes/finder-model-swap/gate.md §4). The predecessor did this by
// hand; this script makes the provider, A3, cost and arithmetic checks code.
//
// Free: it reads a file, it calls nothing.
//
// Usage (from packages/code-reviewer):
//   node scripts/promptfoo-gate-rows.mjs --export <promptfoo -o file.json> \
//     --expected-provider <OpenAI|Alibaba|Minimax> --out <gate-<slug>-promptfoo.jsonl>
//
// Exit code: 0 when G3 and G4 both pass, 1 when either fails or the run is
// not a gate result, 2 on a usage error. The printed summary says which.
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

// A metric passes in a row only when EVERY component assertion carrying it
// passed (issue_recall appears twice in the JS-loop case).
function metricsOf(gradingResult) {
  const metrics = {};
  for (const component of gradingResult?.componentResults ?? []) {
    const metric = component?.assertion?.metric;
    if (typeof metric !== "string") continue;
    metrics[metric] = (metrics[metric] ?? true) && component.pass === true;
  }
  return metrics;
}

/** One export row → one checked gate row. Missing telemetry fails closed. */
export function checkRow(raw, expectedProvider) {
  const metadata = raw?.response?.metadata ?? {};
  const description = raw?.testCase?.description ?? raw?.description ?? null;
  const stepProviders = Array.isArray(metadata.stepProviders) ? metadata.stepProviders : [];
  const stepCostReported = Array.isArray(metadata.stepCostReported) ? metadata.stepCostReported : [];
  const providerMismatch = stepProviders.filter((p) => p !== expectedProvider);
  const retries = Array.isArray(metadata.retries) ? metadata.retries : null;
  const error = raw?.error ?? raw?.response?.error ?? null;
  return {
    case: caseOf(description)?.key ?? null,
    description,
    provider: raw?.provider?.label ?? raw?.provider?.id ?? null,
    success: raw?.success === true,
    error,
    stepProviders,
    // No request at all cannot prove the pin either; the row has failed anyway.
    providerOk: stepProviders.length > 0 && providerMismatch.length === 0,
    invalidated: providerMismatch.length > 0,
    providerMismatch,
    stepCostReported,
    costComplete: stepCostReported.length > 0 && stepCostReported.every((reported) => reported === true),
    reasoningLeak: metadata.reasoningLeak !== false,
    retries,
    steps: metadata.steps ?? null,
    toolCalls: metadata.toolCalls ?? null,
    repairs: metadata.repairs ?? null,
    finderCost: typeof metadata.cost === "number" ? metadata.cost : null,
    latencyMs: raw?.latencyMs ?? null,
    metrics: metricsOf(raw?.gradingResult),
  };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)];
};

/**
 * G3 and G4 over the checked rows. A row that errored, leaked reasoning, or
 * was served by another provider fails every required metric of its case.
 * G4 fails on any row with incomplete cost or a provider mismatch — such a row
 * is never omitted from the median and never counted as free.
 */
export function summarizeRows(rows) {
  const problems = [];
  if (rows.length !== EXPECTED_ROWS) problems.push(`${String(rows.length)} rows, expected ${String(EXPECTED_ROWS)}`);
  const unknown = rows.filter((r) => r.case === null);
  if (unknown.length > 0) problems.push(`${String(unknown.length)} row(s) outside the four archived cases`);
  for (const c of CASES) {
    const count = rows.filter((r) => r.case === c.key).length;
    if (count !== REPEATS) problems.push(`case ${c.key}: ${String(count)} rows, expected ${String(REPEATS)}`);
  }
  const retryCount = rows.reduce((total, r) => total + (r.retries?.length ?? 0), 0);
  const missingRetryField = rows.filter((r) => r.retries === null).length;
  const invalidated = rows.filter((r) => r.invalidated).map((r) => ({ case: r.case, providers: r.stepProviders }));

  if (problems.length > 0) {
    return { failedRun: true, problems, rowCount: rows.length, retryCount, missingRetryField, invalidated };
  }

  const rowOk = (r) => r.success && r.error === null && !r.invalidated && !r.reasoningLeak;
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

  const incompleteCost = rows.filter((r) => !r.costComplete || r.finderCost === null).length;
  const costs = rows.map((r) => r.finderCost ?? 0);
  const g4Median = median(costs);
  const g4 = {
    pass: incompleteCost === 0 && invalidated.length === 0 && g4Median <= G4_CEILING,
    median: g4Median,
    max: Math.max(...costs),
    ceiling: G4_CEILING,
    ratio: g4Median / G4_CEILING,
    incompleteCost,
  };
  const latencies = rows.map((r) => r.latencyMs).filter((v) => typeof v === "number");
  return {
    failedRun: false,
    rowCount: rows.length,
    g3,
    g4,
    invalidated,
    reasoningLeaks: rows.filter((r) => r.reasoningLeak).length,
    retryCount,
    missingRetryField,
    latency: latencies.length === 0 ? null : { median: median(latencies), max: Math.max(...latencies) },
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
  if (exportPath === undefined || expectedProvider === undefined || out === undefined) {
    console.error("usage: --export <file.json> --expected-provider <name> --out <rows.jsonl>");
    return 2;
  }
  const rows = exportRows(JSON.parse(readFileSync(exportPath, "utf8"))).map((raw) => checkRow(raw, expectedProvider));
  writeFileSync(out, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : ""));
  const summary = summarizeRows(rows);
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
    console.log(
      `G4: ${summary.g4.pass ? "PASS" : "FAIL"} median $${summary.g4.median.toFixed(8)} max $${summary.g4.max.toFixed(8)} ` +
        `(ceiling $${String(G4_CEILING)}, ratio ${summary.g4.ratio.toFixed(3)}, incomplete cost ${String(summary.g4.incompleteCost)})`,
    );
  }
  if (summary.invalidated.length > 0) console.log(`INVALIDATED rows: ${JSON.stringify(summary.invalidated)}`);
  console.log(
    `retries: ${String(summary.retryCount)}${summary.missingRetryField > 0 ? ` (${String(summary.missingRetryField)} row(s) without the retries field)` : ""}`,
  );
  console.log(`SUMMARY ${JSON.stringify(summary)}`);
  return !summary.failedRun && summary.g3.pass && summary.g4.pass ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
