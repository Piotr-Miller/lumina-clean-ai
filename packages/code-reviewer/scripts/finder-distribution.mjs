// ⚠️ DEPRECATED for any new measurement — use fabrication-probe.mjs instead.
//
// Kept only as the documentation trail of the archived change
// `finder-security-vocabulary-bias` (its numbers were produced by THIS recipe).
// Four divergences from what CI's finder actually sees, found by
// `finder-fabrication-triggers` research (research.md §5):
//   1. two-dot `<sha>^1 <sha>` vs CI's three-dot `origin/master...HEAD`
//   2. missing CI's `**/results/*.json` exclusion (added in #146, after this
//      script's only commit)
//   3. missing CI's plan-path exclusion — on #127 this alone moves the 100 KB
//      cut by ~38 KB and removes ALL source files from the finder's view
//   4. re-implemented capDiff copy (capDiff is exported now — import it)
// It also captures no finding text, computes no cost, and resolves the model
// from the legacy OPENROUTER_MODEL env var that CI does not set.
//
// Research instrument for `finder-security-vocabulary-bias`.
//
// Question: does the finder's collapse to a uniform critical/security finding set
// reproduce OUTSIDE CI? If it only appears live, the change is much harder than
// one a promptfoo fixture can pin (lessons.md: an offline eval proves capability
// exists, not that it will be used).
//
// Design is a matched pair rather than a repeat of the failing case:
//
//   TREATMENT  7c9c12f (#127) — prompt-injection defence work. Measured 10/10
//              critical/security in CI, twice.
//   CONTROL    2ba0ce4 (#86)  — enhance UI refresh. Comparable size (+3777 vs
//              +4141), app-side, no security subject matter.
//
// The control is deliberately NOT another packages/code-reviewer diff: that
// package's own source is saturated with security vocabulary by nature (its
// prompts discuss injection, untrusted input, fencing), so using it as a control
// would confound subject matter with the thing under test.
//
// Reconstructs each diff the way review.yml does, including the 100KB cap, and
// runs the real finder tool-less — matching the observed CI behaviour, where the
// finder was offered getFileContext and made zero calls.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { DIFF_CAP_BYTES, DIFF_TRUNCATION_MARKER } from "../src/pipeline.js";
import { createReviewer } from "../src/reviewer.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const git = (...args) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 60 * 1024 * 1024 });

// capDiff is private to pipeline.ts and stays that way — widening a production
// export for a research script would be the wrong trade. Replicated here from the
// exported constants so the finder sees exactly what CI sends it.
const capDiff = (diff) => {
  const bytes = new TextEncoder().encode(diff);
  if (bytes.length <= DIFF_CAP_BYTES) return { diff, truncated: false };
  const capped = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, DIFF_CAP_BYTES))
    .replace(/�+$/u, "");
  return { diff: capped + DIFF_TRUNCATION_MARKER, truncated: true };
};

const CASES = [
  { label: "TREATMENT #127 security-hardening", sha: "7c9c12f" },
  { label: "CONTROL    #86  enhance UI refresh", sha: "2ba0ce4" },
];
const REPEATS = Number(process.env.REPEATS ?? "3");

// A/B arm. The trusted project rules are injected at the TAIL of the finder's
// system prompt (prompts.ts:54-56), uncapped in practice, and contain the ONLY
// occurrence of the word "critical" as an instruction anywhere the finder can see
// it (.github/ai-review-rules.md:54, "is a critical finding"), plus three
// security rules in positions 1/2/4 under the header "Hard rules (violations are
// findings)". That text is inert on an ordinary diff and token-activated on a
// security diff — the only candidate mechanism that explains topic-dependence.
//
// CONTEXT=none drops it. The flag is already optional in production
// (cli.ts --project-context-file), so this is a supported configuration rather
// than a hack, which makes it a clean A/B.
const useContext = (process.env.CONTEXT ?? "base") !== "none";
let projectContext = "";
if (useContext) {
  try {
    projectContext = git("show", "origin/master:.github/ai-review-rules.md");
  } catch {
    projectContext = "";
  }
}
console.log(`projectContext: ${useContext ? `${String(projectContext.length)} chars` : "NONE (A/B arm)"}`);

const summarise = (findings) => {
  const bySeverity = {};
  const byCategory = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  }
  const securityShare = findings.length === 0 ? 0 : (byCategory.security ?? 0) / findings.length;
  const criticalShare = findings.length === 0 ? 0 : (bySeverity.critical ?? 0) / findings.length;
  return {
    n: findings.length,
    categories: Object.keys(byCategory).length,
    severities: Object.keys(bySeverity).length,
    securityShare: Math.round(securityShare * 100),
    criticalShare: Math.round(criticalShare * 100),
    bySeverity,
    byCategory,
  };
};

const only = process.env.ONLY;
for (const { label, sha } of CASES.filter((c) => only === undefined || c.label.includes(only))) {
  const raw = git("diff", `${sha}^1`, sha, "--", ".", ":(exclude,glob)**/reviews/*.md");
  const { diff, truncated } = capDiff(raw);
  console.log(`\n${"=".repeat(78)}\n${label}  (${sha})`);
  console.log(`rawChars=${raw.length} sentChars=${diff.length} truncated=${truncated}`);

  for (let attempt = 1; attempt <= REPEATS; attempt += 1) {
    const { review } = createReviewer({ projectContext: projectContext || undefined });
    try {
      const result = await review({ kind: "diff", diff }, { timeoutMs: 300_000 });
      const s = summarise(result.findings);
      console.log(
        `  run ${attempt}: n=${String(s.n).padStart(2)} cats=${s.categories} sevs=${s.severities} ` +
          `security=${String(s.securityShare).padStart(3)}% critical=${String(s.criticalShare).padStart(3)}%  ` +
          `${JSON.stringify(s.byCategory)} ${JSON.stringify(s.bySeverity)}`,
      );
    } catch (error) {
      console.log(`  run ${attempt}: FAILED ${error?.name} - ${error?.message}`);
    }
  }
}
