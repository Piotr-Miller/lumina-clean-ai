// Zero-cost self-check of the recall gate: proves 2-of-3 passes while 1-of-3
// fails (and 1-of-1 / 0-of-1 for the single-issue canary case) without any
// API call. Run from packages/code-reviewer: node evals/recall-selfcheck.mjs
import { scoreIssueRecall } from "./assertions.mjs";

const threeIssues = [
  { label: "issue-a", patterns: ["alpha"] },
  { label: "issue-b", patterns: ["beta"] },
  { label: "issue-c", patterns: ["gamma"] },
];
const oneIssue = [{ label: "only-issue", patterns: ["alpha"] }];

const reviewMentioning = (...words) => JSON.stringify({ summary: words.join(" "), findings: [] });

const cases = [
  { name: "2 of 3 hits passes", issues: threeIssues, output: reviewMentioning("alpha", "beta"), expectPass: true },
  { name: "1 of 3 hits fails", issues: threeIssues, output: reviewMentioning("alpha"), expectPass: false },
  { name: "1 of 1 hits passes", issues: oneIssue, output: reviewMentioning("alpha"), expectPass: true },
  { name: "0 of 1 hits fails", issues: oneIssue, output: reviewMentioning("delta"), expectPass: false },
];

let failures = 0;
for (const testCase of cases) {
  const result = scoreIssueRecall(testCase.output, { vars: { expectedIssues: testCase.issues } });
  const ok = result.pass === testCase.expectPass;
  if (!ok) failures += 1;
  console.log(
    (ok ? "ok  " : "FAIL") +
      " - " +
      testCase.name +
      " (pass=" +
      String(result.pass) +
      ", score=" +
      result.score.toFixed(2) +
      ")",
  );
}

if (failures > 0) {
  console.error(String(failures) + " self-check case(s) violated the recall gate");
  process.exit(1);
}
console.log("recall gate self-check passed");
