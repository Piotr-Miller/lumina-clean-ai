import { severityRank } from "./findings.js";
import { CRITERIA } from "./scorecard.js";
import type { IdentifiedFinding, PipelineResult } from "./schemas.js";

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
    const bySeverity = [...result.findings].sort(
      (a, b) => severityRank[b.severity] - severityRank[a.severity],
    );
    const top = bySeverity.slice(0, MAX_RENDERED_FINDINGS);
    lines.push("", `#### Top findings`, "", ...top.map(renderFinding));
    const remaining = result.findings.length - top.length;
    if (remaining > 0) lines.push("", `…and ${String(remaining)} more finding(s) in review.json.`);
  } else {
    lines.push("", "No findings.");
  }

  const notes: string[] = [];
  if (result.diffTruncated) notes.push("diff truncated at 100 KB — the review covers the truncated portion");
  if (result.bodyTruncated) notes.push("PR body truncated at 2,000 chars");
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
