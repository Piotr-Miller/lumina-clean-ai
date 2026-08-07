import { findingKey, severityRank } from "./findings.js";
import { CRITERIA } from "./scorecard.js";
import type { IdentifiedFinding, PipelineResult } from "./schemas.js";

// Package-side sticky-comment markdown (testable): the composite action posts
// what this renders, it never assembles content itself.

export const STICKY_MARKER = "<!-- ai-cr:sticky -->";
export const MAX_RENDERED_FINDINGS = 5;

const renderFinding = (finding: IdentifiedFinding): string =>
  [
    `- **${finding.id}** [${finding.severity}/${finding.category}] \`${findingKey(finding)}\` — ${finding.description}`,
    `  - fix: ${finding.suggestion}`,
  ].join("\n");

export function renderStickyComment(result: PipelineResult, options: { runUrl?: string } = {}): string {
  const emoji = result.verdict === "passed" ? "✅" : "❌";
  const lines: string[] = [
    `### AI Code Review — ${emoji} ${result.verdict.toUpperCase()}`,
    "",
    result.verdictReason,
    "",
    result.summary,
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
  return lines.join("\n");
}
