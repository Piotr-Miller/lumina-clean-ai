import { describe, expect, it } from "vitest";

import { reviewMustFail, scoreIssueRecall } from "./assertions.mjs";

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
