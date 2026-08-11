import { describe, expect, it } from "vitest";

import { countToolCalls, requireToolContext, reviewMustFail, reviewMustPass, scoreIssueRecall } from "./assertions.mjs";

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

  it("fails when the case configured no requiredContextPath", () => {
    expect(requireToolContext("", { vars: {}, metadata: delivered })).toMatchObject({
      pass: false,
      reason: "No requiredContextPath configured for this case",
    });
  });
});
