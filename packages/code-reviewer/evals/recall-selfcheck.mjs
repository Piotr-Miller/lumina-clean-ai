// Zero-cost self-check of the eval grading surface: proves the recall gate's
// 2-of-3 boundary, the tool-loop gate (DELIVERY, not mere invocation) and the
// false-alarm boundary — all without an API call, so a broken grader is caught
// before any paid row is spent.
// Run from packages/code-reviewer: node evals/recall-selfcheck.mjs
//
// Same ground as evals/assertions.test.ts, deliberately: this one runs on bare
// node, so it stays available when the vitest gate is not the tool at hand.
import { countToolCalls, requireToolContext, reviewMustPass, scoreIssueRecall } from "./assertions.mjs";

let failures = 0;

function check(name, result, expectPass, expectReason) {
  const ok = result.pass === expectPass && (expectReason === undefined || String(result.reason).includes(expectReason));
  if (!ok) failures += 1;
  console.log(
    (ok ? "ok  " : "FAIL") + " - " + name + " (pass=" + String(result.pass) + ", score=" + result.score.toFixed(2) + ")",
  );
}

// --- Recall gate -------------------------------------------------------------

const threeIssues = [
  { label: "issue-a", patterns: ["alpha"] },
  { label: "issue-b", patterns: ["beta"] },
  { label: "issue-c", patterns: ["gamma"] },
];
const oneIssue = [{ label: "only-issue", patterns: ["alpha"] }];

const reviewMentioning = (...words) => JSON.stringify({ summary: words.join(" "), findings: [] });

const recallCases = [
  { name: "2 of 3 hits passes", issues: threeIssues, output: reviewMentioning("alpha", "beta"), expectPass: true },
  { name: "1 of 3 hits fails", issues: threeIssues, output: reviewMentioning("alpha"), expectPass: false },
  { name: "1 of 1 hits passes", issues: oneIssue, output: reviewMentioning("alpha"), expectPass: true },
  { name: "0 of 1 hits fails", issues: oneIssue, output: reviewMentioning("delta"), expectPass: false },
  {
    name: "malformed pattern fails without throwing",
    issues: [{ label: "bad-pattern", patterns: ["["] }],
    output: reviewMentioning("alpha"),
    expectPass: false,
    expectComponentReason: "invalid pattern for bad-pattern",
  },
];

for (const testCase of recallCases) {
  const result = scoreIssueRecall(testCase.output, { vars: { expectedIssues: testCase.issues } });
  const componentReason = result.componentResults?.[0]?.reason;
  if (testCase.expectComponentReason !== undefined && componentReason !== testCase.expectComponentReason) {
    failures += 1;
    console.log("FAIL - " + testCase.name + " (component reason: " + String(componentReason) + ")");
    continue;
  }
  check(testCase.name, result, testCase.expectPass);
}

// --- Tool-loop gate ----------------------------------------------------------

const REQUIRED_PATH = "src/lib/engines/canvas-helpers.ts";
const telemetry = (overrides) => ({
  toolEnabled: true,
  toolCalls: 0,
  requestedPaths: [],
  deliveredPaths: [],
  refusedPaths: [],
  ...overrides,
});
const withRequiredPath = (metadata) => ({ vars: { requiredContextPath: REQUIRED_PATH }, metadata });

check(
  "delivered context passes tool_required",
  requireToolContext(
    "",
    withRequiredPath(telemetry({ toolCalls: 2, requestedPaths: [REQUIRED_PATH], deliveredPaths: [REQUIRED_PATH] })),
  ),
  true,
);
check("zero tool calls fails tool_required", requireToolContext("", withRequiredPath(telemetry())), false);
check(
  "a refused call fails tool_required — an invocation is not evidence",
  requireToolContext(
    "",
    withRequiredPath(telemetry({ toolCalls: 1, requestedPaths: ["other.ts"], refusedPaths: ["other.ts"] })),
  ),
  false,
);
check("absent metadata fails tool_required closed", requireToolContext("", { vars: {} }), false);
check(
  "tool_calls scores the raw invocation count",
  countToolCalls("", { metadata: telemetry({ toolCalls: 3, refusedPaths: ["a.ts"] }) }),
  true,
);
check("absent metadata fails tool_calls closed", countToolCalls("", {}), false);

// --- False-alarm boundary ----------------------------------------------------

const reviewWith = (...severities) =>
  JSON.stringify({ summary: "s", findings: severities.map((severity) => ({ severity, file: "src/x.ts" })) });

check("no findings passes no_false_alarms", reviewMustPass(reviewWith()), true);
check("minor-only passes no_false_alarms", reviewMustPass(reviewWith("minor", "nit")), true);
check("a manufactured major fails no_false_alarms", reviewMustPass(reviewWith("minor", "major")), false);
check("a manufactured critical fails no_false_alarms", reviewMustPass(reviewWith("critical")), false);
check("a drifted bare array fails no_false_alarms", reviewMustPass(JSON.stringify([{ severity: "major" }])), false);

if (failures > 0) {
  console.error(String(failures) + " self-check case(s) violated the grading surface");
  process.exit(1);
}
console.log("grading surface self-check passed");
