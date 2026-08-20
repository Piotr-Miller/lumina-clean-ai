import type { Finding, ReviewUnit, Severity } from "./schemas.js";

// The mergeable-findings seam: stable identity + deterministic merge. Pure
// functions, no AI SDK imports — future multi-agent fan-out merges per-lens
// results through these without touching agent code.

export const severityRank: Record<Severity, number> = { critical: 3, major: 2, minor: 1, nit: 0 };

// Locale-independent ordering: localeCompare would sort differently across
// host environments, breaking the deterministic-merge contract.
const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Stable file+line identity. File-level findings (no startLine) key to line 0. */
export function findingKey(finding: Pick<Finding, "file" | "startLine">): string {
  return `${finding.file}:${String(finding.startLine ?? 0)}`;
}

/**
 * Repair semantically invalid locations the schema alone cannot enforce:
 * coerce `file` to the unit's path for single-file units (file/hunk), and
 * drop `endLine` when it lacks a `startLine` or precedes it. Keeps stable
 * keys and dedup trustworthy without hard-failing on model sloppiness.
 */
export function normalizeFindings(unit: ReviewUnit, findings: Finding[]): Finding[] {
  return findings.map((finding) => {
    const normalized = { ...finding };
    if (unit.kind !== "diff") normalized.file = unit.path;
    if (
      normalized.endLine !== undefined &&
      (normalized.startLine === undefined || normalized.endLine < normalized.startLine)
    ) {
      delete normalized.endLine;
    }
    return normalized;
  });
}

/**
 * The pre-registered severity floor (finder-severity-structural-retry, Arm B):
 * a finding whose `crossUserAccess` answer is true cannot be filed below
 * `major`. Raises only, never lowers, never touches a `false` answer — a
 * repaired-in default of `false` therefore cannot manufacture severity.
 */
export function applySeverityFloor(findings: Finding[]): Finding[] {
  return findings.map((finding) =>
    finding.crossUserAccess && severityRank[finding.severity] < severityRank.major
      ? { ...finding, severity: "major" }
      : finding,
  );
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
      compareStrings(a.file, b.file) ||
      (a.startLine ?? 0) - (b.startLine ?? 0) ||
      compareStrings(a.category, b.category),
  );
}
