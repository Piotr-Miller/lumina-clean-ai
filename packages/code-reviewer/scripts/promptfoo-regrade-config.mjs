// Builds the promptfoo config that re-grades the STORED finder output of the
// grader-error rows of one export, with no finder call (change
// `finder-model-swap`, gate.md Amendment A1 — a grader error is not a
// candidate failure; impl-review-phase-1 F3).
//
// Free: it reads files and writes one. The re-grade run it prepares is paid
// (grader only).
//
// How: promptfoo skips the provider for a test that carries `providerOutput`
// (its evaluator uses that output as the response), so each selected row
// becomes one test with the row's `response.output` as providerOutput, the
// row's id in `metadata.regradeOf`, and ONLY the assertions whose grading
// errored (plus defaultTest's schema check). The same `defaultTest` — the same
// grader — and the same case vars are copied from the matrix config, so the
// rubric and its vars are the ones that failed to grade, not a re-typed copy.
//
// Usage (from packages/code-reviewer):
//   node scripts/promptfoo-regrade-config.mjs --export <promptfoo -o file.json> \
//     --out evals/<slug>.regrade.json [--config evals/promptfooconfig.yaml]
//   npx promptfoo eval -c evals/<slug>.regrade.json -j 1 --no-cache -o <regrade.json>
//   node scripts/promptfoo-gate-rows.mjs --export <file.json> --regrade <regrade.json> ...
//
// The output must sit NEXT TO the matrix config: its `file://` references
// (fixtures, assertions, the schema, the rules) resolve against the config's
// own directory. Exit 0 with a config written; 1 when there is nothing to
// re-grade; 2 on a usage error.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { load } from "js-yaml";

import { exportRows, graderErrorsOf } from "./promptfoo-gate-rows.mjs";

/**
 * Metrics graded from the PROVIDER METADATA of a row (tool telemetry), not
 * from its output. A providerOutput row carries no metadata, so they cannot be
 * re-graded from a stored output; they are diagnostic, never required (gate.md
 * §4), and a whole-grading re-grade leaves them out and says so.
 */
export const TELEMETRY_METRICS = ["tool_calls", "tool_required"];

/** The export rows whose finder succeeded and whose grading errored. */
export function selectGraderErrorRows(rawRows) {
  return rawRows.filter((raw) => graderErrorsOf(raw).length > 0);
}

/**
 * The re-grade config: one test per selected row. Throws when a row's case is
 * not in the matrix config or its stored output is not a string — a re-grade
 * must never grade something other than what the finder produced.
 */
export function buildRegradeConfig(matrixConfig, rawRows, { exportPath }) {
  const tests = (matrixConfig?.tests ?? []).filter((t) => typeof t?.description === "string");
  const byDescription = new Map(tests.map((t) => [t.description, t]));
  const regradeTests = rawRows.map((raw) => {
    const description = raw?.testCase?.description;
    const test = byDescription.get(description);
    if (test === undefined)
      throw new Error(`row ${String(raw?.id)}: case ${JSON.stringify(description)} is not in the matrix config`);
    const output = raw?.response?.output;
    if (typeof output !== "string" || output.length === 0) {
      throw new Error(`row ${String(raw?.id)}: no stored finder output to re-grade`);
    }
    const erroredMetrics = new Set(graderErrorsOf(raw).map((e) => e.metric));
    // A whole-grading error (metric null) re-grades every assertion of the
    // case except the telemetry readers; otherwise only the ones the grader
    // failed to grade.
    const assert = erroredMetrics.has(null)
      ? (test.assert ?? []).filter((a) => !TELEMETRY_METRICS.includes(a?.metric))
      : (test.assert ?? []).filter((a) => erroredMetrics.has(a?.metric));
    if (assert.length === 0) {
      throw new Error(`row ${String(raw?.id)}: no assertion of the case carries the errored metric(s)`);
    }
    const notRegradable = erroredMetrics.has(null)
      ? (test.assert ?? []).map((a) => a?.metric).filter((m) => TELEMETRY_METRICS.includes(m))
      : [];
    return {
      ...test,
      assert,
      metadata: {
        ...(test.metadata ?? {}),
        regradeOf: raw.id,
        regradeOfTestIdx: raw.testIdx ?? null,
        ...(notRegradable.length === 0 ? {} : { notRegradable }),
      },
      providerOutput: output,
    };
  });
  return {
    description: `Re-grade of ${String(rawRows.length)} grader-error row(s) of ${exportPath} — stored finder output, no finder call (gate.md Amendment A1)`,
    ...(matrixConfig.env === undefined ? {} : { env: matrixConfig.env }),
    prompts: matrixConfig.prompts,
    // Never called: every test carries providerOutput. promptfoo still needs
    // a provider to be configured.
    providers: ["echo"],
    defaultTest: matrixConfig.defaultTest,
    tests: regradeTests,
  };
}

function main(args) {
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const exportPath = flag("--export");
  const out = flag("--out");
  const configPath = flag("--config") ?? "evals/promptfooconfig.yaml";
  if (exportPath === undefined || out === undefined) {
    console.error("usage: --export <file.json> --out evals/<slug>.regrade.json [--config evals/promptfooconfig.yaml]");
    return 2;
  }
  if (resolve(dirname(out)) !== resolve(dirname(configPath))) {
    console.error(`--out must be in the same directory as ${configPath}: its file:// references resolve against it`);
    return 2;
  }
  const rows = selectGraderErrorRows(exportRows(JSON.parse(readFileSync(exportPath, "utf8"))));
  if (rows.length === 0) {
    console.log("no grader-error rows in the export; nothing to re-grade");
    return 1;
  }
  const config = buildRegradeConfig(load(readFileSync(configPath, "utf8")), rows, { exportPath });
  writeFileSync(out, `${JSON.stringify(config, null, 2)}\n`);
  for (const test of config.tests) {
    const left = test.metadata.notRegradable ?? [];
    console.log(
      `re-grade ${test.metadata.regradeOf} (testIdx ${String(test.metadata.regradeOfTestIdx)}): ${test.assert.map((a) => a.metric).join(", ")}` +
        (left.length === 0
          ? ""
          : ` — not re-gradable from a stored output (telemetry, diagnostic): ${left.join(", ")}`),
    );
  }
  console.log(
    `wrote ${out}: ${String(config.tests.length)} test(s); run: npx promptfoo eval -c ${out} -j 1 --no-cache -o <regrade.json>`,
  );
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
