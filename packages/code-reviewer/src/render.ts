import { severityRank } from "./findings.js";
import { CRITERIA } from "./scorecard.js";
import type {
  IdentifiedImplFinding,
  ImplDimension,
  ImplGrade,
  ImplVerdict,
  IdentifiedFinding,
  PipelineResult,
} from "./schemas.js";

// Package-side sticky-comment markdown (testable): the composite action posts
// what this renders, it never assembles content itself.

export const STICKY_MARKER = "<!-- ai-cr:sticky -->";
export const MAX_RENDERED_FINDINGS = 5;

// Model-controlled fields are untrusted Markdown (impl-review-phase-1 F5):
// caps bound flooding, escaping keeps the scorecard/table/section structure
// author-owned, and the whole-comment ceiling respects GitHub's 65,536-char
// comment limit with headroom.
export const MAX_FIELD_CHARS = 1_000;
export const MAX_PATH_CHARS = 300;
export const MAX_COMMENT_CHARS = 60_000;

const flattenAndCap = (text: string, cap: number): string => {
  const flattened = text.replace(/\s+/gu, " ").trim();
  return flattened.length > cap ? `${flattened.slice(0, cap)}…` : flattened;
};

/**
 * Escape a model-controlled field for inline Markdown: no newlines (nothing
 * can open a heading, table row, fence, or quote), structural characters
 * backslash-escaped, mentions broken so the comment can never ping users.
 */
const sanitizeInline = (text: string, cap = MAX_FIELD_CHARS): string =>
  flattenAndCap(text, cap)
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("[", "\\[")
    .replaceAll("<", "\\<")
    .replaceAll("`", "\\`")
    .replace(/@(?=[A-Za-z0-9_])/gu, "@<!-- -->")
    .replace(/^([#>*+-])/u, "\\$1");

/** Code span whose backtick fence is longer than any run inside (CommonMark-safe). */
const codeSpan = (text: string): string => {
  const capped = flattenAndCap(text, MAX_PATH_CHARS);
  const longestRun = Math.max(0, ...(capped.match(/`+/gu) ?? []).map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  const padded = capped.startsWith("`") || capped.endsWith("`") ? ` ${capped} ` : capped;
  return `${fence}${padded}${fence}`;
};

// Display label only — the merge/dedup key (findingKey) is untouched. A
// file-level finding shows its path alone, never a fabricated `:0`.
const locationLabel = (finding: IdentifiedFinding): string =>
  finding.startLine === undefined ? finding.file : `${finding.file}:${String(finding.startLine)}`;

const renderFinding = (finding: IdentifiedFinding): string =>
  [
    `- **${finding.id}** [${finding.severity}/${finding.category}] ${codeSpan(locationLabel(finding))} — ${sanitizeInline(finding.description)}`,
    `  - fix: ${sanitizeInline(finding.suggestion)}`,
  ].join("\n");

// --- Implementation review section ---
//
// A deliberately DIFFERENT emoji vocabulary from the code review's ✅/❌: the
// two verdicts answer different questions ("is this code good" vs "does it
// match its plan") and a reader who conflates them will read a 🔴 plan verdict
// as a failed code review. Distinct glyphs make that misread impossible at a
// glance.
const IMPL_VERDICT_EMOJI: Record<ImplVerdict, string> = {
  APPROVED: "🟢",
  NEEDS_ATTENTION: "🟡",
  REJECTED: "🔴",
};

const IMPL_GRADE_EMOJI: Record<ImplGrade, string> = { PASS: "✔", WARNING: "▲", FAIL: "✘" };

const IMPL_DIMENSION_LABEL: Record<ImplDimension, string> = {
  plan_adherence: "Plan Adherence",
  scope_discipline: "Scope Discipline",
  safety_quality: "Safety & Quality",
  architecture: "Architecture",
  pattern_consistency: "Pattern Consistency",
  test_coverage: "Test Coverage",
  success_criteria: "Success Criteria",
};

/**
 * Location from the finding's locus, as an EXHAUSTIVE switch.
 *
 * No `default` and no fallback: the return type makes a new locus variant a
 * compile error here rather than a silently unlabelled finding. That is the
 * whole point of the union — the old code inferred location from two optional
 * fields, which is exactly the shape that let anchoring rot to 0/10.
 */
const implLocation = (finding: IdentifiedImplFinding): string => {
  switch (finding.locus) {
    case "code":
      return ` ${codeSpan(`${finding.file}:${String(finding.startLine)}`)}`;
    case "file":
      return ` ${codeSpan(finding.file)}`;
    case "absent":
      return "";
  }
};

/** Same shape as renderFinding, over the impl vocabulary (severity/impact, no category). */
const renderImplFinding = (finding: IdentifiedImplFinding): string => {
  const location = implLocation(finding);
  return [
    `- **${finding.id}** [${finding.severity}/${finding.impact}]${location} — ${sanitizeInline(finding.title)}`,
    `  - ${sanitizeInline(finding.detail)}`,
    `  - fix: ${sanitizeInline(finding.fix)}`,
  ].join("\n");
};

/**
 * Three states, one of which is the ABSENCE of `implReview` — a run with no
 * plan gets a neutral line telling the reader how to point at one, never
 * silence. Silence would be indistinguishable from a pass that ran and found
 * nothing, which is the exact misread this whole feature exists to prevent.
 */
function renderImplReviewSection(result: PipelineResult): string[] {
  const block = result.implReview;

  if (block === undefined) {
    return [
      "",
      "#### Implementation review — not run",
      "",
      "No plan found for this PR. Add a `Plan: context/changes/<change-id>/plan.md` line to the PR body, or place the change under a conventional path, to have the diff reviewed against its plan.",
    ];
  }

  if (block.status === "skipped") {
    return [
      "",
      "#### Implementation review — not run",
      "",
      `Skipped: ${sanitizeInline(block.reason)}. It runs once the code review above passes.`,
    ];
  }

  if (block.status === "failed") {
    return [
      "",
      "#### Implementation review — ⚠️ could not complete",
      "",
      `The implementation review failed and was skipped: ${sanitizeInline(block.error)}. The code review above is unaffected.`,
    ];
  }

  const lines = [
    "",
    `#### Implementation review — ${IMPL_VERDICT_EMOJI[block.verdict]} ${block.verdict.replace("_", " ")}`,
    "",
    // The plan path is untrusted (the PR body can name it) — codeSpan, never
    // raw interpolation.
    block.planPath === undefined
      ? "Reviewed against the supplied plan."
      : `Reviewed against ${codeSpan(block.planPath)}.`,
    // The footnote at the bottom of the comment is not enough on its own: a
    // reader scanning a red REJECTED verdict never gets that far, which is
    // exactly how PR #143's three fabricated "file missing" CRITICALs read as
    // real. The caveat has to sit with the verdict it qualifies.
    ...(result.diffTruncated
      ? [
          "",
          "⚠️ The diff was truncated at 100 KB, so this review saw only part of the change. Findings that claim work is missing may reflect the truncation rather than the PR.",
        ]
      : []),
    "",
    sanitizeInline(block.verdictReason),
  ];

  if (block.findings.length > 0) {
    const top = block.findings.slice(0, MAX_RENDERED_FINDINGS);
    lines.push("", ...top.map(renderImplFinding));
    const remaining = block.findings.length - top.length;
    if (remaining > 0) lines.push("", `…and ${String(remaining)} more finding(s) in review.json.`);
  }

  // The grade table is reference detail, not the headline — collapsed so the
  // section never doubles the comment's visual weight.
  lines.push(
    "",
    "<details><summary>Dimension grades</summary>",
    "",
    "| Dimension | Grade |",
    "| --- | --- |",
    ...Object.entries(IMPL_DIMENSION_LABEL).map(([key, label]) => {
      const grade = block.grades[key as ImplDimension];
      return `| ${label} | ${IMPL_GRADE_EMOJI[grade]} ${grade} |`;
    }),
    "",
    "</details>",
  );
  return lines;
}

export function renderStickyComment(result: PipelineResult, options: { runUrl?: string } = {}): string {
  const emoji = result.verdict === "passed" ? "✅" : "❌";
  const lines: string[] = [
    `### AI Code Review — ${emoji} ${result.verdict.toUpperCase()}`,
    "",
    sanitizeInline(result.verdictReason),
    "",
    sanitizeInline(result.summary),
    "",
    "| Criterion | Score | Findings |",
    "| --- | --- | --- |",
  ];
  for (const { key, label } of CRITERIA) {
    const criterion = result.scores[key];
    const refs = criterion.findingIds.length > 0 ? criterion.findingIds.join(", ") : "—";
    lines.push(`| ${label} | ${String(criterion.score)}/10 | ${refs} |`);
  }

  if (result.findings.length > 0) {
    // Stable sort: severity rank desc, merge order (file/line/category) as tiebreak.
    const bySeverity = [...result.findings].sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
    const top = bySeverity.slice(0, MAX_RENDERED_FINDINGS);
    lines.push("", `#### Top findings`, "", ...top.map(renderFinding));
    const remaining = result.findings.length - top.length;
    if (remaining > 0) lines.push("", `…and ${String(remaining)} more finding(s) in review.json.`);
  } else {
    lines.push("", "No findings.");
  }

  // Sits WITH the findings, not in the footnote list below: a reader scanning
  // a red verdict never reaches a footnote, and this caveat says the findings
  // themselves may not be about this PR. It is the signal that would have
  // caught PRs #175-#177 on the first one instead of the fourth — there a
  // generated fixture's payload crowded the cap window, the finder reviewed
  // that payload, and #177 filed seven findings against packages/fixturepkg/*,
  // paths in no version of this repository, then wore an ai-cr:failed label
  // earned by planted content.
  if (result.offDiffFindingPaths.length > 0) {
    lines.push(
      "",
      `⚠️ ${String(result.offDiffFindingPaths.length)} path(s) named above do not appear in this PR's diff at all: ` +
        `${result.offDiffFindingPaths.map(codeSpan).join(", ")}. Treat those findings as unreliable — the review ` +
        `may be describing content that is not this change.`,
    );
  }

  lines.push(...renderImplReviewSection(result));

  const notes: string[] = [];
  if (result.diffTruncated) notes.push("diff truncated at 100 KB — the review covers the truncated portion");
  if (result.bodyTruncated) notes.push("PR body truncated at 2,000 chars");
  // A partial plan review must never read as a complete one.
  if (result.planTruncated === true)
    notes.push("plan truncated at 80,000 chars — the implementation review covers the truncated portion");
  if (result.droppedFindingIdRefs > 0)
    notes.push(`${String(result.droppedFindingIdRefs)} unknown finding reference(s) dropped from scores`);
  if (notes.length > 0) lines.push("", `⚠️ ${notes.join("; ")}.`);

  lines.push(
    "",
    `<sub>finder: ${result.models.finder} · judge: ${result.models.judge}${
      options.runUrl ? ` · [run](${options.runUrl})` : ""
    }</sub>`,
    "",
    STICKY_MARKER,
  );

  // Whole-comment ceiling: sliced overflow still ends with the sticky marker
  // so the action's upsert anchor survives truncation.
  const comment = lines.join("\n");
  if (comment.length <= MAX_COMMENT_CHARS) return comment;
  const suffix = `\n\n⚠️ comment truncated — full details in review.json.\n\n${STICKY_MARKER}`;
  return comment.slice(0, MAX_COMMENT_CHARS - suffix.length) + suffix;
}
