// Diagnoses the AI_NoObjectGeneratedError that killed the judge on runs
// 31707888975 (+ its re-run). Reproduces review.yml's exact inputs, then dumps
// the RAW model text the SDK could not parse — the one thing the Actions log
// never shows.
//
// Findings are cached to disk so re-running the judge does not re-pay for the
// finder. Pass --judge-only to skip the finder entirely.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createJudge } from "../src/judge.ts";
import { createReviewer } from "../src/reviewer.ts";
import { mergeFindings } from "../src/findings.ts";
import { assignFindingIds } from "../src/scorecard.ts";
import { computeDiffStats } from "../src/pipeline.ts";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const HEAD = process.env.HEAD_SHA ?? "08f82f2";
const PLAN_PATH = "context/changes/impl-review-ci-agent/plan.md";
const CACHE = new URL("./judge-diagnose-findings.json", import.meta.url);

const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });

// Exactly review.yml's "Compute PR diff (three-dot vs merge-base)".
const diff = run("git", [
  "diff",
  `origin/master...${HEAD}`,
  "--",
  ".",
  ":(exclude,glob)**/reviews/*.md",
  `:(exclude)${PLAN_PATH}`,
]);

// Trusted rules come from the BASE branch, never the head.
let projectContext = "";
try {
  projectContext = run("git", ["show", "origin/master:.github/ai-review-rules.md"]);
} catch {
  projectContext = "";
}

const pr = JSON.parse(run("gh", ["pr", "view", "127", "--json", "title,body"]));
const diffStats = computeDiffStats(diff);

console.log(
  JSON.stringify(
    { head: HEAD, diffChars: diff.length, diffStats, rulesChars: projectContext.length, prTitle: pr.title },
    null,
    2,
  ),
);

let findings;
if (existsSync(fileURLToPath(CACHE))) {
  findings = JSON.parse(readFileSync(CACHE, "utf8"));
  console.log(`\n[cache] reusing ${String(findings.length)} findings — finder not re-run`);
} else {
  const { review } = createReviewer({ projectContext: projectContext || undefined });
  const result = await review({ kind: "diff", diff }, { timeoutMs: 300_000 });
  findings = assignFindingIds(mergeFindings(result.findings));
  writeFileSync(CACHE, JSON.stringify(findings, null, 2));
  console.log(`\n[finder] ${String(findings.length)} findings (cached for re-runs)`);
}

// What the judge actually receives, so a malformed value is visible even if the
// call somehow succeeds this time.
console.log("\n[judge input] findings:");
for (const f of findings) {
  console.log(
    `  ${f.id} [${f.severity}/${f.category}] ${f.file}:${String(f.startLine ?? "-")} ` +
      `desc=${String(f.description?.length)}ch sugg=${String(f.suggestion?.length)}ch`,
  );
}
const payloadChars = JSON.stringify(findings).length + (pr.body?.length ?? 0);
console.log(`\n[judge input] findings JSON + body = ${String(payloadChars)} chars`);

// The judge has NO output repair by explicit decision ("the judge runs the same
// sonnet model without it and has never needed it"). CI just produced four
// consecutive failures, so measure the real per-call failure rate on this exact
// input rather than reasoning about it.
const REPEATS = Number(process.env.JUDGE_REPEATS ?? "1");
let ok = 0;
let bad = 0;

for (let attempt = 1; attempt <= REPEATS; attempt += 1) {
try {
  const { judge } = createJudge();
  const verdict = await judge(
    { findings, prTitle: pr.title, prBody: pr.body, diffStats },
    { timeoutMs: Number(process.env.JUDGE_TIMEOUT_MS ?? "300000") },
  );
  ok += 1;
  console.log(`\n[judge ${String(attempt)}/${String(REPEATS)}] SUCCEEDED`);
  console.log(JSON.stringify({ verdict: verdict.verdict, reason: verdict.verdictReason }, null, 2));
} catch (error) {
  bad += 1;
  console.log(`\n[judge ${String(attempt)}/${String(REPEATS)}]`);
  // Duck-typed: this script lives outside the package, so `ai` is not
  // resolvable here for the real isInstance check.
  const isNoObject = String(error?.name).includes("NoObjectGenerated") || "text" in Object(error);
  console.log("\n[judge] FAILED");
  console.log("  isNoObjectGenerated:", isNoObject);
  console.log("  name   :", error?.name);
  console.log("  message:", error?.message);
  if (isNoObject) {
    console.log("  finishReason:", JSON.stringify(error.finishReason));
    console.log("  usage       :", JSON.stringify(error.usage));
    console.log("  cause       :", String(error.cause?.message ?? error.cause).slice(0, 600));
    const text = error.text;
    console.log(`\n===== RAW MODEL TEXT (${String(text?.length ?? 0)} chars) =====`);
    console.log(text === undefined ? "(undefined — the model returned no text at all)" : text.slice(0, 4000));
    console.log("===== END RAW TEXT =====");
  }
}
}

console.log(`\n===== judge: ${String(ok)} ok / ${String(bad)} failed of ${String(REPEATS)} =====`);
if (bad > 0) process.exitCode = 1;
