// Zero-cost self-check of the eval grading surface: proves the recall gate's
// 2-of-3 boundary, the tool-loop gate (DELIVERY, not mere invocation) and the
// false-alarm boundary — all without an API call, so a broken grader is caught
// before any paid row is spent.
// Run from packages/code-reviewer: node evals/recall-selfcheck.mjs
//
// Same ground as evals/assertions.test.ts, deliberately: this one runs on bare
// node, so it stays available when the vitest gate is not the tool at hand.
import {
  countToolCalls,
  noFabricatedAbsence,
  requireDefectReported,
  requireToolContext,
  reviewMustPass,
  scoreEvidenceFidelity,
  scoreIssueRecall,
} from "./assertions.mjs";

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
  "delivery with zero calls is a self-contradiction, not adoption",
  requireToolContext(
    "",
    withRequiredPath(telemetry({ toolCalls: 0, requestedPaths: [REQUIRED_PATH], deliveredPaths: [REQUIRED_PATH] })),
  ),
  false,
  "contradicts itself",
);
check(
  "a non-finite call count fails closed",
  requireToolContext("", withRequiredPath(telemetry({ toolCalls: Number.NaN }))),
  false,
);
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


// --- Hardening precision -----------------------------------------------------
// The fabrication metric decides a pre-registered bar, so its two boundaries get
// bare-node cover too: the absence claim it must catch, and the approving
// mention it must NOT read as a fabrication.

const defences = [
  { label: "sanitization", patterns: ["sanitiz", "control[- ]char"] },
  { label: "validation", patterns: ["validat"] },
  { label: "traversal rejection", patterns: ["travers"] },
];
const claiming = (description) => JSON.stringify({ summary: "s", findings: [{ description }] });
const withDefences = (output) => noFabricatedAbsence(output, { vars: { presentDefences: defences } });

check("an absence claim about a present defence scores 0", withDefences(claiming("There is no validation.")), false);
check(
  "an approving mention is not a fabrication",
  withDefences(claiming("logSafeKey strips control characters correctly.")),
  true,
);
check(
  "a neutralized negation is not a fabrication",
  withDefences(claiming("No need to sanitize further; the pattern already rejects it.")),
  true,
);
check(
  "one finding matching three defences counts once",
  withDefences(claiming("No validation, no sanitization, traversal not rejected.")),
  false,
  "1 of 1 finding(s)",
);
check("a review with no findings scores 1", withDefences(JSON.stringify({ summary: "s", findings: [] })), true);
check(
  "evidence is not searched for absence claims",
  withDefences(JSON.stringify({ summary: "s", findings: [{ description: "Naming.", evidence: "not validated" }] })),
  true,
);
check("a broken envelope fails closed", withDefences(JSON.stringify([{ description: "x" }])), false);

const defect = { label: "traversal", patterns: ["travers", "unvalidated"] };
const guard = (finding) =>
  requireDefectReported(JSON.stringify({ summary: "s", findings: [finding] }), { vars: { expectedDefect: defect } });

check(
  "a critical finding naming the defect passes the guard",
  guard({ severity: "critical", description: "Unvalidated key allows traversal." }),
  true,
);
check(
  "the defect quoted only in evidence fails the guard",
  guard({ severity: "critical", description: "Rename this.", evidence: "traversal via ../" }),
  false,
);
check(
  "the defect reported as a nit fails the guard",
  guard({ severity: "nit", description: "Traversal is possible." }),
  false,
  "below major severity",
);

const fidelityDiff = ["@@ -1,1 +1,2 @@", "+const MAX_KEY_LENGTH = 64;"].join("\n");
const fidelity = (evidence) =>
  scoreEvidenceFidelity(JSON.stringify({ summary: "s", findings: [{ evidence }] }), {
    vars: { diff: fidelityDiff },
  });

check("a verbatim quote scores full fidelity", fidelity("const MAX_KEY_LENGTH = 64;"), true, "1 of 1");
check("an invented quote scores zero without failing the row", fidelity("const MAX_KEY_LENGTH = 4096;"), true, "0 of 1");
check(
  "a run with no evidence reads as not applicable",
  scoreEvidenceFidelity(JSON.stringify({ summary: "s", findings: [{ description: "x" }] }), {
    vars: { diff: fidelityDiff },
  }),
  true,
  "Not applicable",
);
if (failures > 0) {
  console.error(String(failures) + " self-check case(s) violated the grading surface");
  process.exit(1);
}
console.log("grading surface self-check passed");
