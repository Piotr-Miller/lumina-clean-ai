import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { scoreIssueRecall } from "./assertions.mjs";

// Free hermetic cover for the eval CONFIG itself, not just the assertion code.
// The matrix is a paid instrument feeding a model decision, and its ground
// truth lives in this YAML — a pattern that is too broad, or a case that
// silently loses its gate, misreports model quality at $1-2 a run and is not
// caught by `promptfoo validate` (which checks shape, not meaning).

const assertionSchema = z.object({
  type: z.string(),
  value: z.string().optional(),
  metric: z.string().optional(),
});

const configSchema = z.object({
  defaultTest: z.object({ assert: z.array(assertionSchema) }),
  tests: z.array(
    z.object({
      description: z.string(),
      vars: z.object({
        fixtureRoot: z.string().optional(),
        requiredContextPath: z.string().optional(),
        expectedIssues: z.array(z.object({ label: z.string(), patterns: z.array(z.string()) })).optional(),
      }),
      assert: z.array(assertionSchema).optional(),
    }),
  ),
});

const config = configSchema.parse(load(readFileSync(resolve(import.meta.dirname, "promptfooconfig.yaml"), "utf8")));

/** Assertion function names a case grades with, e.g. "scoreIssueRecall". */
const gradersOf = (asserts: { value?: string }[] | undefined): string[] =>
  (asserts ?? []).map((entry) => entry.value?.split(":").at(-1) ?? "");

const findCase = (pattern: RegExp) => {
  const found = config.tests.find((test) => pattern.test(test.description));
  if (found === undefined) throw new Error(`No eval case matches ${pattern.source}`);
  return found;
};

const reviewSaying = (summary: string) => JSON.stringify({ summary, findings: [] });

describe("cross-hunk recall patterns", () => {
  const expectedIssues = findCase(/^Cross-hunk contract violation/u).vars.expectedIssues ?? [];
  const recallOf = (summary: string) => scoreIssueRecall(reviewSaying(summary), { vars: { expectedIssues } }).pass;

  it("is configured with ground truth at all", () => {
    expect(expectedIssues.length).toBeGreaterThan(0);
  });

  // A model that never fetched the file can still notice the literal. Awarding
  // recall for that turns issue_recall into a measure of nothing, because the
  // whole point of the case is that the VERDICT needs out-of-hunk context
  // (impl-review-phase-2 F2). The rubric fails these wordings explicitly.
  it.each([
    "The hardcoded 0.5 quality value should be extracted into a configurable option rather than inlined.",
    "0.5 seems low for uploaded photos; consider raising the JPEG quality or making it tunable.",
    "Avoid magic numbers: the literal 0.5 passed to toDataURL deserves a named value.",
  ])("misses generic criticism of the literal: %s", (summary) => {
    expect(recallOf(summary)).toBe(false);
  });

  // Each of these can only be written by a model that read outside the hunk.
  it.each([
    "flattenForUpload hardcodes 0.5 instead of the shared JPEG_QUALITY constant.",
    "This bypasses the module's single-source rule for re-encode quality.",
    "The literal duplicates the shared quality constant the module mandates.",
    "It violates the module's documented invariant that every re-encode path uses the constant.",
  ])("hits when the finding names the out-of-hunk contract: %s", (summary) => {
    expect(recallOf(summary)).toBe(true);
  });
});

describe("case wiring", () => {
  // promptfoo PREPENDS defaultTest assertions to every case, and scoreIssueRecall
  // fails when expectedIssues is absent — as a default it would fail the
  // clean-diff case by construction (plan Phase 2 section 3).
  it("keeps scoreIssueRecall off defaultTest", () => {
    expect(gradersOf(config.defaultTest.assert)).not.toContain("scoreIssueRecall");
  });

  it.each(config.tests.map((test) => [test.description, test] as const))(
    "grades %s consistently with its vars",
    (_description, test) => {
      const graders = gradersOf(test.assert);

      // Ground truth and the gate that reads it travel together, in both
      // directions: a defect-bearing case must not lose its recall gate, and a
      // case with nothing to find must not acquire one.
      expect(graders.includes("scoreIssueRecall")).toBe(test.vars.expectedIssues !== undefined);

      // Tool assertions fail closed on a tool-less row, so attaching one to a
      // case without a fixtureRoot would read as a model failure, not a config
      // error. tool_required additionally needs the path it checks delivery of.
      const toolGraders = graders.filter((grader) => grader === "countToolCalls" || grader === "requireToolContext");
      if (toolGraders.length > 0) expect(test.vars.fixtureRoot).toBeDefined();
      expect(graders.includes("requireToolContext")).toBe(test.vars.requiredContextPath !== undefined);
    },
  );
});
