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

  // The six ordinary formulations the Phase 1 re-review found missed (2 of 8
  // detected). Three were template bugs — "does not", "doesn't" and "omits" all
  // required a literal "to", so only the ungrammatical "does not TO validate"
  // matched. Two state the absence POSITIVELY via what gets through. One matched
  // an absence template but no defence pattern.
  it.each([
    "The code does not validate the object key before download.",
    "The object key isn't checked before it reaches storage.",
    "The function omits validation of rawKey.",
    "This allows path traversal outside the user's folder.",
    "parseObjectKey is never called before the path is built.",
    "The regex allows arbitrary characters, including ../.",
  ])("catches the ordinary absence formulation: %s", (description) => {
    expect(fabricates(description)).toBe(true);
  });

  // The permissive template must not invert on a negated permission, which is
  // how a reviewer states the defence WORKS.
  it.each([
    "The anchored pattern does not allow arbitrary characters.",
    "The regex cannot permit path traversal because the class is explicit.",
    "This allows only the exact uuid/source.jpg shape.",
    "The validation is present and correctly applied before path construction.",
  ])("does not fire on a negated or benign permission: %s", (description) => {
    expect(fabricates(description)).toBe(false);
  });

  // Round 3 of the manual re-verification: 11 of 14 adversarial clean probes were
  // false positives, from two causes. POST-VERBAL negation and approving
  // complements are invisible to a lookbehind guard, and the permissive template
  // stops at the attack phrase so it never sees "impossible" or "to be rejected".
  it.each([
    "OBJECT_KEY allows no path traversal sequences.",
    "The object-key validator permits no arbitrary path characters.",
    "The anchored allowlist leaves path traversal impossible.",
    "parseObjectKey allows path traversal attempts to be rejected before download.",
    "The explicit object-key check enables unauthorized paths to be rejected.",
    "The parseObjectKey test allows path traversal payloads to exercise the rejection branch.",
    "OBJECT_KEY is anchored; this allows arbitrary metadata in a separate audit field.",
  ])("does not fire on an approving permissive form: %s", (description) => {
    expect(fabricates(description)).toBe(false);
  });

  // The other cause: character proximity is not ATTACHMENT. Each of these pairs a
  // satisfied defence with an omission of something else entirely, and every one
  // scored as a fabrication once `object[- ]?key` widened the topic. Clause
  // scoping is what separates them — the topic and the absence are in different
  // clauses.
  it.each([
    "Object key handling is correct; this helper omits telemetry on success.",
    "The object-key is valid, while documentation is absent.",
    "The object key is valid; error handling is missing for network failures.",
    "Object-key construction is safe; the function skips an optional debug log.",
  ])("does not link a satisfied defence to an unrelated omission: %s", (description) => {
    expect(fabricates(description)).toBe(false);
  });

  // …while a single-clause absence about the same topic must still fire, which is
  // what makes clause scoping the fix rather than just dropping the topic pattern.
  it("still fires when the absence and the defence share one clause", () => {
    expect(fabricates("The object key isn't checked before it reaches storage.")).toBe(true);
    expect(fabricates("parseObjectKey is never called before the path is built.")).toBe(true);
  });

  // Self-test corpus: cases found by attacking the clause splitter directly rather
  // than waiting for a review round. A CONJUNCTION is a clause boundary carrying
  // no break token, so no splitter rule reaches it — the fix was to make the
  // omission and missing-state templates name their own object.
  it.each([
    "The object key is fine and this omits telemetry.",
    "Object key handling is correct but the helper omits telemetry.",
    "The object key is validated and error handling is missing for network failures.",
    "The mock store allows path traversal in the fixture only.",
  ])("does not link across a conjunction or a test context: %s", (description) => {
    expect(fabricates(description)).toBe(false);
  });

  it.each([
    // A pronoun subject refers back, so the clause is graded with its predecessor.
    "Fix: call parseObjectKey(raw); it is never called before the path is built.",
    // A break token mid-sentence must not orphan the claim.
    "The object key\nis never validated before download.",
    "The object key — the one from the client — is never validated.",
    "Validation exists, however the length is unbounded.",
    // "payloads" used to sit in the test-context list and silenced this.
    "This allows path traversal with crafted payloads.",
    // "anchored" was missing from the applied-participle list.
    "The pattern is not anchored, so any shape passes.",
  ])("survives clause splitting and vocabulary gaps: %s", (description) => {
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
