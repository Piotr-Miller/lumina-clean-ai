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
 * Git quotes paths containing unusual bytes, and `computeFileSegments` keeps
 * the closing quote verbatim. Compare unquoted or a quoted path never matches
 * the same path as a model reports it.
 */
const unquotePath = (path: string): string => path.replace(/^"/, "").replace(/"$/, "");

/**
 * Paths a review's findings name that do not appear in the reviewed diff AT
 * ALL — sorted, deduped. Empty is the healthy case.
 *
 * WHY THIS EXISTS. A finding about a file the PR never touched is not a real
 * finding, and the failure it detects is otherwise silent. On PRs #175–#177 a
 * generated `ground-truth/fixture*.diff` sorted to the front of the cap window
 * (it is not `.md`, so `orderDiffForCap` classified the payload as source) and
 * the finder reviewed the fixture's CONTENTS instead of the pull request. #177
 * reported seven findings against `packages/fixturepkg/src/*` — paths that
 * exist only inside that payload — and the run was labelled `ai-cr:failed` on
 * their strength. Three reviews were spent that way before anyone noticed,
 * and reading the finding paths is what finally exposed it in seconds.
 *
 * PR #179 excluded the artifact that caused those three. This makes the CLASS
 * observable rather than silent: the `.md`-or-source split is still binary, so
 * some future generated artifact can crowd the window the same way, and when
 * it does this surfaces on the first PR instead of the fourth.
 *
 * Deliberately REPORTS rather than drops. A path can also be off-diff because
 * the model lightly mangled a real one, and silently discarding findings would
 * trade a visible reliability signal for an invisible loss of real ones.
 * Compared against the FULL diff, never the capped one, so an over-cap file is
 * not mistaken for a fabricated path.
 */
export function offDiffFindingPaths(diffPaths: Iterable<string>, findings: Finding[]): string[] {
  const known = new Set<string>();
  for (const path of diffPaths) known.add(unquotePath(path));
  const offDiff = new Set<string>();
  for (const finding of findings) {
    const file = unquotePath(finding.file);
    if (file !== "" && !known.has(file)) offDiff.add(file);
  }
  return [...offDiff].sort(compareStrings);
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
