import { describe, expect, it } from "vitest";

import {
  countToolCalls,
  requireDefectReported,
  requireToolContext,
  reviewMustFail,
  reviewMustPass,
  scoreEvidenceFidelity,
  scoreIssueRecall,
} from "./assertions.mjs";

const threeIssues = [
  { label: "issue-a", patterns: ["alpha"] },
  { label: "issue-b", patterns: ["beta"] },
  { label: "issue-c", patterns: ["gamma"] },
];
const oneIssue = [{ label: "only-issue", patterns: ["alpha"] }];

const reviewMentioning = (...words: string[]) => JSON.stringify({ summary: words.join(" "), findings: [] });

describe("scoreIssueRecall", () => {
  it.each([
    {
      name: "2 of 3 hits passes",
      issues: threeIssues,
      output: reviewMentioning("alpha", "beta"),
      expectedPass: true,
    },
    {
      name: "1 of 3 hits fails",
      issues: threeIssues,
      output: reviewMentioning("alpha"),
      expectedPass: false,
    },
    {
      name: "1 of 1 hits passes",
      issues: oneIssue,
      output: reviewMentioning("alpha"),
      expectedPass: true,
    },
    {
      name: "0 of 1 hits fails",
      issues: oneIssue,
      output: reviewMentioning("delta"),
      expectedPass: false,
    },
  ])("$name", ({ issues, output, expectedPass }) => {
    const result = scoreIssueRecall(output, { vars: { expectedIssues: issues } });

    expect(result.pass).toBe(expectedPass);
  });

  it("reports a malformed pattern without throwing", () => {
    const result = scoreIssueRecall(reviewMentioning("alpha"), {
      vars: {
        expectedIssues: [{ label: "bad-pattern", patterns: ["["] }],
      },
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0,
      componentResults: [
        {
          pass: false,
          score: 0,
          reason: "invalid pattern for bad-pattern",
        },
      ],
    });
  });
});

describe("reviewMustFail", () => {
  it.each([
    { severity: "critical", expectedPass: true },
    { severity: "major", expectedPass: true },
    { severity: "minor", expectedPass: false },
  ])("returns $expectedPass for $severity severity", ({ severity, expectedPass }) => {
    const output = JSON.stringify({ findings: [{ severity }] });

    expect(reviewMustFail(output).pass).toBe(expectedPass);
  });

  it("fails a review with no findings", () => {
    expect(reviewMustFail(JSON.stringify({ findings: [] })).pass).toBe(false);
  });
});

describe("reviewMustPass", () => {
  const reviewWith = (...severities: string[]) =>
    JSON.stringify({
      summary: "s",
      findings: severities.map((severity) => ({ severity, file: "src/lib/format-bytes.ts" })),
    });

  it.each([
    { name: "a clean review with no findings", output: reviewWith(), expectedPass: true },
    { name: "nit-only", output: reviewWith("nit"), expectedPass: true },
    // The boundary the metric is defined by: minor is tolerated, major is not.
    { name: "minor-only", output: reviewWith("minor", "nit"), expectedPass: true },
    { name: "one major among minors", output: reviewWith("minor", "major"), expectedPass: false },
    { name: "critical", output: reviewWith("critical"), expectedPass: false },
  ])("returns $expectedPass for $name", ({ output, expectedPass }) => {
    expect(reviewMustPass(output).pass).toBe(expectedPass);
  });

  it("names the manufactured findings so the viewer says what was invented", () => {
    expect(reviewMustPass(reviewWith("major", "critical")).reason).toContain("src/lib/format-bytes.ts");
  });

  it("fails output that is not JSON", () => {
    expect(reviewMustPass("not json at all").pass).toBe(false);
  });

  it("fails a drifted envelope with no findings array rather than reading it as clean", () => {
    // glm-4.6 under tool-attachment emits a bare findings ARRAY (output-repair.ts).
    expect(reviewMustPass(JSON.stringify([{ severity: "major" }])).pass).toBe(false);
  });
});

// --- Tool-loop telemetry assertions ------------------------------------------
// Metadata shapes mirror what finder-provider.ts reports; every unreadable
// shape must FAIL, never silently read as an observed zero-call run.

const REQUIRED_PATH = "src/lib/engines/canvas-helpers.ts";

const telemetry = (overrides: Record<string, unknown> = {}) => ({
  lens: "general",
  model: "test/model",
  toolEnabled: true,
  toolCalls: 0,
  requestedPaths: [] as string[],
  deliveredPaths: [] as string[],
  refusedPaths: [] as string[],
  ...overrides,
});

const delivered = telemetry({
  toolCalls: 2,
  requestedPaths: [REQUIRED_PATH, REQUIRED_PATH],
  deliveredPaths: [REQUIRED_PATH, REQUIRED_PATH],
});

const refusedOnly = telemetry({
  toolCalls: 1,
  requestedPaths: ["src/lib/engines/canvas-helpers.js"],
  refusedPaths: ["src/lib/engines/canvas-helpers.js"],
});

describe("countToolCalls", () => {
  it("scores the raw invocation count, refusals included", () => {
    const result = countToolCalls("", {
      metadata: telemetry({ toolCalls: 3, deliveredPaths: [REQUIRED_PATH], refusedPaths: ["nope.ts", "nope.ts"] }),
    });

    expect(result).toMatchObject({ pass: true, score: 3 });
    expect(result.reason).toContain(REQUIRED_PATH);
  });

  it("reports zero calls without failing the row — adoption is tool_required's gate", () => {
    expect(countToolCalls("", { metadata: telemetry() })).toMatchObject({ pass: true, score: 0 });
  });

  it("fails closed when the provider reported no metadata", () => {
    expect(countToolCalls("", {})).toMatchObject({ pass: false, score: 0 });
  });

  it("fails closed on a tool-less row, which this assertion should never be attached to", () => {
    expect(countToolCalls("", { metadata: telemetry({ toolEnabled: false }) }).pass).toBe(false);
  });

  // A NaN score would poison the metric's average across every row of that
  // model, silently — worse than a visible failure.
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, "2"])(
    "fails closed on an implausible toolCalls count: %s",
    (toolCalls) => {
      expect(countToolCalls("", { metadata: telemetry({ toolCalls }) })).toMatchObject({ pass: false, score: 0 });
    },
  );
});

describe("requireToolContext", () => {
  const contextWith = (metadata?: Record<string, unknown>) => ({
    vars: { requiredContextPath: REQUIRED_PATH },
    ...(metadata === undefined ? {} : { metadata }),
  });

  it("passes when the required path was actually delivered", () => {
    expect(requireToolContext("", contextWith(delivered))).toMatchObject({ pass: true, score: 1 });
  });

  it("fails a zero-call row and says the tool was never called", () => {
    const result = requireToolContext("", contextWith(telemetry()));

    expect(result.pass).toBe(false);
    expect(result.componentResults?.[0]?.reason).toBe("Never called getFileContext");
  });

  it("fails a row whose only call was refused — an invocation is not evidence", () => {
    const result = requireToolContext("", contextWith(refusedOnly));

    expect(result.pass).toBe(false);
    // The refusal is a model-facing string, so from the model's side it looks
    // exactly like content; only the source's own report tells them apart.
    expect(result.componentResults?.[0]?.pass).toBe(true);
    expect(result.componentResults?.[1]?.reason).toContain("Never received");
  });

  it("fails when a DIFFERENT allowlisted path was delivered instead", () => {
    const result = requireToolContext(
      "",
      contextWith(telemetry({ toolCalls: 1, requestedPaths: ["src/other.ts"], deliveredPaths: ["src/other.ts"] })),
    );

    expect(result.pass).toBe(false);
    expect(result.componentResults?.[1]?.reason).toContain("src/other.ts");
  });

  it("says the path was refused when it was asked for and turned down", () => {
    const result = requireToolContext("", {
      vars: { requiredContextPath: "src/lib/engines/canvas-helpers.js" },
      metadata: refusedOnly,
    });

    expect(result.componentResults?.[1]?.reason).toContain("refused");
  });

  it("fails closed when the provider reported no metadata", () => {
    expect(requireToolContext("", contextWith())).toMatchObject({ pass: false, score: 0 });
  });

  it("fails closed on a tool-less row", () => {
    expect(requireToolContext("", contextWith(telemetry({ toolEnabled: false }))).pass).toBe(false);
  });

  // The provider records the request and its outcome in the SAME callback, and
  // a delivery cannot happen without a call — so these shapes mean the
  // instrument disagrees with itself, and the optimistic half must not win.
  it("fails telemetry that reports delivery with zero calls", () => {
    const result = requireToolContext(
      "",
      contextWith(telemetry({ toolCalls: 0, requestedPaths: [REQUIRED_PATH], deliveredPaths: [REQUIRED_PATH] })),
    );

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("contradicts itself");
  });

  it("fails telemetry that reports delivery of a path it never requested", () => {
    const result = requireToolContext(
      "",
      contextWith(telemetry({ toolCalls: 1, requestedPaths: [], deliveredPaths: [REQUIRED_PATH] })),
    );

    expect(result.pass).toBe(false);
    expect(result.componentResults?.[1]?.reason).toContain("no request for it");
  });

  it("fails when the case configured no requiredContextPath", () => {
    expect(requireToolContext("", { vars: {}, metadata: delivered })).toMatchObject({
      pass: false,
      reason: "No requiredContextPath configured for this case",
    });
  });
});

// --- Hardening fixture assertions --------------------------------------------
// The fabrication metric is an llm-rubric and has no unit test; what it grades is
// pinned by the rubric text itself (plan criterion 1.15) and validated against a
// hand-read of the baseline (2.6). The deterministic matcher that used to live
// here was retired on 2026-08-14 after seven review rounds — see the header of
// assertions.mjs. What remains is the over-suppression guard and quote fidelity.

const findingsReview = (...findings: Record<string, unknown>[]) => JSON.stringify({ summary: "s", findings });

describe("requireDefectReported", () => {
  const DEFECT = { label: "traversal", patterns: ["travers", "unvalidated"] };
  const grade = (output: string) => requireDefectReported(output, { vars: { expectedDefect: DEFECT } });

  it("passes a critical finding that names the defect", () => {
    expect(
      grade(findingsReview({ severity: "critical", description: "Unvalidated key allows traversal." })),
    ).toMatchObject({ pass: true, score: 1 });
  });

  it("passes at major severity", () => {
    expect(grade(findingsReview({ severity: "major", description: "Path traversal is possible." })).pass).toBe(true);
  });

  // The whole point of not reusing scoreIssueRecall: its JSON.stringify search
  // would match the quoted vulnerable line (plan review F2).
  it("fails when the defect text appears only in the evidence quote", () => {
    const result = grade(
      findingsReview({
        severity: "critical",
        description: "Consider renaming this function.",
        evidence: "return `${userId}/${rawKey}`; // traversal",
      }),
    );

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain("evidence and summary are not searched");
  });

  it("fails when the defect appears only in the summary", () => {
    const output = JSON.stringify({
      summary: "The diff allows path traversal.",
      findings: [{ severity: "critical", description: "Unrelated concern." }],
    });

    expect(grade(output).pass).toBe(false);
  });

  it.each(["minor", "nit"])("fails when the defect is reported only at %s severity", (severity) => {
    const result = grade(findingsReview({ severity, description: "Traversal is possible here." }));

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("below major severity");
  });

  it("fails when the case configured no defect", () => {
    expect(requireDefectReported(findingsReview(), { vars: {} })).toMatchObject({
      pass: false,
      reason: "No expectedDefect configured for this case",
    });
  });
});

describe("scoreEvidenceFidelity", () => {
  const diff = [
    "diff --git a/src/lib/storage/object-key.ts b/src/lib/storage/object-key.ts",
    "index 4a1d7c2..b93f5e1 100644",
    "--- a/src/lib/storage/object-key.ts",
    "+++ b/src/lib/storage/object-key.ts",
    "@@ -1,2 +1,4 @@",
    ' import { logger } from "@/lib/logger";',
    "+const MAX_KEY_LENGTH = 64;",
    '+  return raw.replace(CONTROL_CHARS, "");',
  ].join("\n");
  const grade = (output: string) => scoreEvidenceFidelity(output, { vars: { diff } });

  it("scores a verbatim quote as fully faithful", () => {
    expect(grade(findingsReview({ evidence: "const MAX_KEY_LENGTH = 64;" }))).toMatchObject({ pass: true, score: 1 });
  });

  it("scores an invented quote as unfaithful without failing the row", () => {
    const result = grade(findingsReview({ evidence: "const MAX_KEY_LENGTH = 4096;" }));

    expect(result).toMatchObject({ pass: true, score: 0 });
    expect(result.reason).toContain("not found");
  });

  it("canonicalizes the diff marker and collapsed whitespace", () => {
    expect(grade(findingsReview({ evidence: '+  return   raw.replace(CONTROL_CHARS, "");' })).score).toBe(1);
  });

  it("does not credit a quote of the diff's own header lines", () => {
    expect(grade(findingsReview({ evidence: "+++ b/src/lib/storage/object-key.ts" })).score).toBe(0);
  });

  it("reports the ratio when only some quotes are real", () => {
    const result = grade(
      findingsReview({ evidence: "const MAX_KEY_LENGTH = 64;" }, { evidence: "totally invented line" }),
    );

    expect(result.score).toBe(0.5);
  });

  // Baseline rows predate the field entirely; scoring them 0 would drag the
  // average and read as a fidelity collapse that never happened.
  it("reads as not applicable when no finding carries evidence", () => {
    const result = grade(findingsReview({ description: "no evidence field here" }));

    expect(result).toMatchObject({ pass: true, score: 1 });
    expect(result.reason).toContain("Not applicable");
  });

  it("fails closed when the row carries no diff var", () => {
    expect(scoreEvidenceFidelity(findingsReview({ evidence: "x" }), { vars: {} })).toMatchObject({
      pass: false,
      score: 0,
    });
  });
});
