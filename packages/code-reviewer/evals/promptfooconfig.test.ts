import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { noFabricatedAbsence, requireDefectReported, scoreIssueRecall } from "./assertions.mjs";

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
        presentDefences: z.array(z.object({ label: z.string(), patterns: z.array(z.string()) })).optional(),
        expectedDefect: z.object({ label: z.string(), patterns: z.array(z.string()) }).optional(),
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

// The fabrication metric's real risk is the opposite of a miss: firing on a
// finding that mentions a defence APPROVINGLY, which would turn a healthy review
// into a recorded fabrication and corrupt the baseline the whole change rests on.
// These run the SHIPPING patterns, not stand-ins.
describe("hardening fabrication patterns", () => {
  const presentDefences = findCase(/^Hardening diff whose defences are present/u).vars.presentDefences ?? [];
  const reviewClaiming = (description: string) => JSON.stringify({ summary: "s", findings: [{ description }] });
  const fabricates = (description: string) =>
    !noFabricatedAbsence(reviewClaiming(description), { vars: { presentDefences } }).pass;

  it("is configured with declared defences at all", () => {
    expect(presentDefences.length).toBeGreaterThan(0);
  });

  it.each([
    "The object key is interpolated into the log message without sanitization.",
    "There is no validation of the object key before it is used as a storage path.",
    "Path traversal is not rejected, so ../ escapes the user's folder.",
    "The key length is unbounded, which allows a very large input to reach the regex.",
    "parseObjectKey fails to sanitize control characters before logging.",
  ])("catches the fabricated absence claim: %s", (description) => {
    expect(fabricates(description)).toBe(true);
  });

  it.each([
    "logSafeKey correctly strips control characters before the value reaches the log line.",
    "No need to sanitize further here — the anchored pattern already rejects traversal sequences.",
    "The allowlist pattern is anchored and the character classes are explicit, which is the right approach.",
    "Validation looks solid; there is no test covering the traversal rejection branch though.",
    "Consider extracting MAX_KEY_LENGTH into shared config so other modules reuse the same bound.",
    // Regression set from the Phase 1 manual review (1.14). Every one of these
    // uses NEGATIVE wording to APPROVE a defence, and the first cue-proximity
    // implementation scored all four as fabrications.
    "No control characters can reach the logger because logSafeKey strips them.",
    "No path traversal is possible because parseObjectKey rejects dot segments.",
    "The key length is not unbounded: MAX_KEY_LENGTH caps it before matching.",
    "The key is not unvalidated; OBJECT_KEY is an anchored allowlist.",
  ])("does not fire on approving or unrelated wording: %s", (description) => {
    expect(fabricates(description)).toBe(false);
  });

  // The pair the manual review asked the metric to separate: same attack noun,
  // opposite claims. Negating the ATTACK is approval; negating the MECHANISM is
  // the fabrication.
  it("separates a negated attack from a negated mechanism", () => {
    expect(fabricates("No traversal is possible because the check rejects it.")).toBe(false);
    expect(fabricates("No traversal check exists.")).toBe(true);
  });

  // A reversing noun AFTER the mechanism: template 1 stops matching at the
  // mechanism, so the head-noun neutralizer never sees the word that flips the
  // meaning. Found while summarizing, not by a review.
  it.each([
    "There is no validation problem here; OBJECT_KEY handles the shape.",
    "No sanitization issue — logSafeKey is applied at the interpolation site.",
    "I see no traversal-check gap in this diff.",
  ])("does not fire when a defect noun follows the mechanism: %s", (description) => {
    expect(fabricates(description)).toBe(false);
  });

  // Recall: a missed fabrication biases the baseline DOWN, which is the
  // direction that could wrongly trip Phase 2's does-not-reproduce gate.
  it.each([
    "The key is never canonicalized, so ../ survives into the storage path.",
    "There is no way to reject traversal sequences before the download call.",
    "Control characters reach the logger with no scrubbing at all.",
  ])("still catches an absence phrased outside the validation vocabulary: %s", (description) => {
    expect(fabricates(description)).toBe(true);
  });
});

// The guard exists because a "fix" that suppresses real findings would otherwise
// look like a win. Its failure mode after Phase 3 is passing on the vulnerable
// line quoted in `evidence` while the finding says nothing (plan review F2).
describe("hardening suppression guard patterns", () => {
  const expectedDefect = findCase(/^Hardening diff with one genuine traversal defect/u).vars.expectedDefect;
  const guard = (finding: Record<string, unknown>) =>
    requireDefectReported(JSON.stringify({ summary: "s", findings: [finding] }), { vars: { expectedDefect } }).pass;

  it("is configured with a defect at all", () => {
    expect(expectedDefect).toBeDefined();
  });

  it("passes when a critical finding names the defect", () => {
    expect(
      guard({
        severity: "critical",
        description: "resolveSourcePath joins an unvalidated key, so ../ reaches another user's object.",
      }),
    ).toBe(true);
  });

  it("fails when the defect appears only in the evidence quote", () => {
    expect(
      guard({
        severity: "critical",
        description: "This function could use a clearer name.",
        evidence: "  return `${userId}/${rawKey}`; // traversal via ../ is possible",
      }),
    ).toBe(false);
  });

  it("fails when the defect is reported below major severity", () => {
    expect(guard({ severity: "nit", description: "Unvalidated key allows path traversal." })).toBe(false);
  });
});

describe("case wiring", () => {
  // promptfoo PREPENDS defaultTest assertions to every case, and scoreIssueRecall
  // fails when expectedIssues is absent — as a default it would fail the
  // clean-diff case by construction (plan Phase 2 section 3).
  it("keeps scoreIssueRecall off defaultTest", () => {
    expect(gradersOf(config.defaultTest.assert)).not.toContain("scoreIssueRecall");
  });

  // Same trap for the hardening graders: each fails closed without its own var,
  // so as a default it would fail every unrelated case by construction.
  it.each(["noFabricatedAbsence", "requireDefectReported", "scoreEvidenceFidelity"])(
    "keeps %s off defaultTest",
    (grader) => {
      expect(gradersOf(config.defaultTest.assert)).not.toContain(grader);
    },
  );

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

      // The hardening pair, same rule in both directions: the fabrication gate
      // must not lose the defences it grades, and a case that declares defences
      // must not lose the gate.
      expect(graders.includes("noFabricatedAbsence")).toBe(test.vars.presentDefences !== undefined);
      expect(graders.includes("requireDefectReported")).toBe(test.vars.expectedDefect !== undefined);
    },
  );
});
