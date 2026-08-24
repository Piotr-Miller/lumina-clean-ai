// Backtest `offDiffFindingPaths` against REAL archived reviews.
//
// WHY THIS IS A COMMITTED SCRIPT AND NOT A ONE-OFF. The detector's whole claim
// is "a finding naming a path outside the diff is unreliable". Unit tests pin
// the mechanics against a fixture; only real model output can show whether it
// FALSE-POSITIVES on legitimate path variance. The evidence for that lives in
// `ai-review-output` artifacts, which GitHub deletes after **14 days** — so the
// sample must be harvested on a deadline, repeatedly, not once. Re-run this
// after a batch of merges to keep the claim current.
//
// No model calls, no API key, no spend: it replays a shipped pure function.
//
// Usage (from the repo root):
//   1. Collect the merged-PR map and the surviving runs:
//        gh pr list --state merged --limit 80 --json number,headRefName,mergeCommit \
//          --jq '.[] | select(.mergeCommit != null) | "\(.headRefName)\t\(.number)\t\(.mergeCommit.oid[0:10])"' > prmap.tsv
//        gh run list --workflow review.yml --limit 60 --json databaseId,headBranch,conclusion \
//          --jq '.[] | select(.conclusion=="success") | "\(.headBranch)\t\(.databaseId)"' | awk -F'\t' '!seen[$1]++' > runs.tsv
//   2. For each row, `gh run download <id> -n ai-review-output -D <artifactDir>/<pr>`
//   3. Write one `<pr>|<sha>` line per downloaded PR into cases.txt
//   4. npx tsx packages/code-reviewer/scripts/offdiff-backtest.mjs <artifactDir> cases.txt
//
// Last run 2026-08-24: 42 PRs, 96 real findings, 7 flagged — all 7 on PR #177,
// the known-bad review. 89 findings across 41 healthy PRs, ZERO false positives.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { offDiffFindingPaths } from "../src/findings.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

// review.yml's EXCLUDES. `**/ground-truth/*` shipped in PR #179.
const BASE_EXCLUDES = [":(exclude,glob)**/reviews/*.md", ":(exclude,glob)**/results/*.json"];
const GROUND_TRUTH_EXCLUDE = ":(exclude,glob)**/ground-truth/*";
const GROUND_TRUTH_EXCLUDE_FROM_PR = 179;

/**
 * THE METHODOLOGICAL POINT, and the easiest thing to get wrong here.
 *
 * Each PR is replayed under the exclusions that were LIVE AT THE TIME, not
 * today's. Applying `ground-truth/*` retroactively to PRs #175-#177 would
 * delete the very payload that starved those reviews, so the detector would
 * score a clean sheet on the exact cases it exists to catch — a backtest that
 * proves the opposite of what it appears to prove.
 */
export const excludesForPr = (pr) => [
  ...BASE_EXCLUDES,
  ...(pr >= GROUND_TRUTH_EXCLUDE_FROM_PR ? [GROUND_TRUTH_EXCLUDE] : []),
];

/** Paths in a merge commit's diff, read the same way computeFileSegments does. */
export function diffPathsFor(sha, pr) {
  try {
    const out = execFileSync("git", ["diff", `${sha}^...${sha}`, "--", ".", ...excludesForPr(pr)], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 600,
      encoding: "utf8",
    });
    return [...out.matchAll(/^diff --git .* b\/(.+)$/gmu)].map((match) => match[1]);
  } catch {
    // Commit not in this clone (branch pruned, shallow fetch) — reported as
    // unresolved rather than silently scored as a clean pass.
    return null;
  }
}

function main() {
  const [artifactDir, casesFile] = process.argv.slice(2);
  if (!artifactDir || !casesFile) {
    throw new Error("usage: offdiff-backtest.mjs <artifactDir> <casesFile>  (see the header for how to build both)");
  }

  const cases = readFileSync(casesFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [pr, sha] = line.split("|");
      return { pr: Number(pr), sha };
    })
    .sort((a, b) => a.pr - b.pr);

  let prs = 0;
  let findingsTotal = 0;
  let offTotal = 0;
  const flagged = [];
  const unresolved = [];

  for (const { pr, sha } of cases) {
    const path = `${artifactDir}/${String(pr)}/review.json`;
    if (!existsSync(path)) continue;
    const findings = JSON.parse(readFileSync(path, "utf8")).findings ?? [];
    const paths = diffPathsFor(sha, pr);
    if (paths === null) {
      unresolved.push(pr);
      continue;
    }
    prs += 1;
    findingsTotal += findings.length;
    const off = offDiffFindingPaths(paths, findings);
    offTotal += off.length;
    if (off.length > 0) flagged.push({ pr, findings: findings.length, off });
  }

  console.log(`PRs replayed .............. ${String(prs)}`);
  console.log(`real findings examined .... ${String(findingsTotal)}`);
  console.log(`off-diff paths flagged .... ${String(offTotal)}`);
  console.log(`PRs with any flag ......... ${String(flagged.length)}`);
  if (unresolved.length > 0) console.log(`unresolved commits ........ ${unresolved.join(", ")}`);
  for (const entry of flagged) {
    console.log("");
    console.log(`  #${String(entry.pr)}: ${String(entry.off.length)} off-diff of ${String(entry.findings)} findings`);
    for (const path of entry.off.slice(0, 8)) console.log(`      ${path}`);
    if (entry.off.length > 8) console.log(`      …+${String(entry.off.length - 8)}`);
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) main();
