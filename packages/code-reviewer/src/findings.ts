import type { Finding, Severity } from "./schemas.js";

// The mergeable-findings seam: stable identity + deterministic merge. Pure
// functions, no AI SDK imports — future multi-agent fan-out merges per-lens
// results through these without touching agent code.

const severityRank: Record<Severity, number> = { critical: 3, major: 2, minor: 1, nit: 0 };

/** Stable file+line identity. File-level findings (no startLine) key to line 0. */
export function findingKey(finding: Pick<Finding, "file" | "startLine">): string {
  return `${finding.file}:${finding.startLine ?? 0}`;
}

/**
 * Concatenate finding lists, dedup by key+category (keeping the higher
 * severity; first wins on ties), and return a deterministically ordered list
 * (file, then startLine, then category).
 */
export function mergeFindings(...lists: Finding[][]): Finding[] {
  const byIdentity = new Map<string, Finding>();
  for (const finding of lists.flat()) {
    const identity = `${findingKey(finding)}|${finding.category}`;
    const existing = byIdentity.get(identity);
    if (!existing || severityRank[finding.severity] > severityRank[existing.severity]) {
      byIdentity.set(identity, finding);
    }
  }
  return [...byIdentity.values()].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      (a.startLine ?? 0) - (b.startLine ?? 0) ||
      a.category.localeCompare(b.category),
  );
}
