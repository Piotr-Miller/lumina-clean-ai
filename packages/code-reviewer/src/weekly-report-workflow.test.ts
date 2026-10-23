import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { load } from "js-yaml";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

// Hermetic cover for .github/workflows/ai-review-weekly-report.yml itself.
// The dispatch boolean reaches the shell as a string, and a schedule run has
// no inputs at all, so one careless conversion (`[[ $DRY_RUN ]]`, an unquoted
// expansion) silently disables publishing or splits a path. These tests run
// the workflow's ACTUAL report-step block — extracted from the YAML, not a
// copy of it — under bash with npm stubbed out: nothing contacts GitHub and
// the real CLI never runs.

const WORKFLOW_PATH = resolve(import.meta.dirname, "../../../.github/workflows/ai-review-weekly-report.yml");

const stepSchema = z.object({
  name: z.string().optional(),
  run: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const workflowSchema = z.object({
  on: z.object({
    schedule: z.array(z.object({ cron: z.string() })),
    workflow_dispatch: z.object({
      inputs: z.object({
        week: z.object({ type: z.string(), required: z.boolean().optional() }),
        "dry-run": z.object({ type: z.string(), default: z.boolean() }),
      }),
    }),
  }),
  permissions: z.record(z.string(), z.string()),
  // strict(): exactly one job, so the permissions asserted below are all there are.
  jobs: z
    .object({
      "weekly-report": z.object({
        if: z.string().optional(),
        permissions: z.record(z.string(), z.string()),
        steps: z.array(stepSchema),
      }),
    })
    .strict(),
});

const workflow = workflowSchema.parse(load(readFileSync(WORKFLOW_PATH, "utf8")));
const job = workflow.jobs["weekly-report"];
const reportStep = job.steps.find((step) => step.name === "Generate weekly report");

const tempRoot = mkdtempSync(join(tmpdir(), "weekly-report-workflow-"));
afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

const CALL_MARKER = "__npm_stub_call__";

/**
 * Runs the report step's run: block the way GitHub does for a step with no
 * `shell:` (bash -e), behind a stub `npm` function that records each
 * invocation's argv NUL-separated. Returns one argv array per npm call.
 */
function runReportStep(env: Record<string, string>): { status: number | null; stderr: string; calls: string[][] } {
  const block = reportStep?.run;
  if (block === undefined) throw new Error("the Generate weekly report step has no run: block");
  const dir = mkdtempSync(join(tempRoot, "case-"));
  const log = join(dir, "npm-argv");
  writeFileSync(log, "");
  const script = join(dir, "step.sh");
  writeFileSync(script, `npm() { printf '%s\\0' ${CALL_MARKER} "$@" >> "$NPM_ARGV_LOG"; }\n${block}`);
  const result = spawnSync("bash", ["--noprofile", "--norc", "-e", script], {
    // Only what the test sets: an inherited WEEK or DRY_RUN must not leak in.
    env: { PATH: process.env.PATH ?? "", NPM_ARGV_LOG: log, ...env },
    encoding: "utf8",
  });
  const fields = readFileSync(log, "utf8").split("\0").slice(0, -1);
  const calls: string[][] = [];
  for (const field of fields) {
    if (field === CALL_MARKER) calls.push([]);
    else calls.at(-1)?.push(field);
  }
  return { status: result.status, stderr: result.stderr, calls };
}

const RUNNER_TEMP = join(tempRoot, "runner temp with spaces");
const BASE_ENV = {
  GITHUB_REPOSITORY: "Piotr-Miller/lumina-clean-ai",
  OWNER: "Piotr Miller",
  RUNNER_TEMP,
};
const BASE_ARGS = [
  "run",
  "weekly-report",
  "--",
  "--repo",
  "Piotr-Miller/lumina-clean-ai",
  "--owner",
  "Piotr Miller",
  "--out-dir",
  `${RUNNER_TEMP}/weekly-report`,
];

describe("ai-review-weekly-report.yml — triggers and permissions", () => {
  it("runs every Monday at 06:00 UTC and on dispatch with optional week and dry-run inputs", () => {
    expect(workflow.on.schedule).toEqual([{ cron: "0 6 * * 1" }]);
    expect(workflow.on.workflow_dispatch.inputs.week.type).toBe("string");
    expect(workflow.on.workflow_dispatch.inputs.week.required ?? false).toBe(false);
    expect(workflow.on.workflow_dispatch.inputs["dry-run"]).toEqual({ type: "boolean", default: false });
  });

  it("grants nothing at the top level and only the four job scopes it needs", () => {
    expect(workflow.permissions).toEqual({});
    expect(job.permissions).toEqual({
      contents: "read",
      actions: "read",
      issues: "write",
      "pull-requests": "read",
    });
    expect(job.if).toBe("github.event.repository.fork == false");
  });

  it("feeds every input to the report step through env:, never interpolated into run:", () => {
    expect(reportStep?.env).toEqual({
      GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
      OWNER: "${{ github.repository_owner }}",
      WEEK: "${{ inputs.week }}",
      DRY_RUN: "${{ inputs.dry-run }}",
      AI_REVIEW_WEEKLY_ALARM_USD: "${{ vars.AI_REVIEW_WEEKLY_ALARM_USD }}",
      AI_REVIEW_WEEKLY_ALARM_UNREPORTED: "${{ vars.AI_REVIEW_WEEKLY_ALARM_UNREPORTED }}",
    });
    expect(reportStep?.run).not.toContain("${{");
  });
});

describe("ai-review-weekly-report.yml — the Generate weekly report command", () => {
  it.each<{ label: string; env: Record<string, string>; dryRun: boolean }>([
    { label: "true", env: { DRY_RUN: "true" }, dryRun: true },
    { label: "false", env: { DRY_RUN: "false" }, dryRun: false },
    { label: "empty", env: { DRY_RUN: "" }, dryRun: false },
    { label: "absent (schedule run)", env: {}, dryRun: false },
    { label: "True (not the literal)", env: { DRY_RUN: "True" }, dryRun: false },
    { label: "1 (not the literal)", env: { DRY_RUN: "1" }, dryRun: false },
  ])("DRY_RUN $label → --dry-run present: $dryRun", ({ env, dryRun }) => {
    const result = runReportStep({ ...BASE_ENV, ...env });
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toEqual([[...BASE_ARGS, ...(dryRun ? ["--dry-run"] : [])]]);
  });

  it.each<{ label: string; env: Record<string, string>; week: string[] }>([
    { label: "set", env: { WEEK: "2026-W43" }, week: ["--week", "2026-W43"] },
    { label: "empty", env: { WEEK: "" }, week: [] },
    { label: "absent (schedule run)", env: {}, week: [] },
    { label: "with a space, kept as one value", env: { WEEK: "2026 W43" }, week: ["--week", "2026 W43"] },
  ])("WEEK $label → week arguments $week", ({ env, week }) => {
    const result = runReportStep({ ...BASE_ENV, ...env });
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toEqual([[...BASE_ARGS, ...week]]);
  });

  it("combines a week and a dry run in one npm invocation, in a fixed order", () => {
    const result = runReportStep({ ...BASE_ENV, WEEK: "2026-W43", DRY_RUN: "true" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toEqual([[...BASE_ARGS, "--week", "2026-W43", "--dry-run"]]);
  });
});
