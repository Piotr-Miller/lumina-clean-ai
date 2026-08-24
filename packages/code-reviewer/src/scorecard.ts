import type { Finding, IdentifiedFinding, JudgeOutput, Scores } from "./schemas.js";

// Pure scorecard plumbing: criteria metadata, per-run finding IDs, and
// judge-reference integrity. No verdict rule lives here — the verdict is
// model-owned (user decision); the thresholds are rubric guidance in
// prompts.ts. No AI SDK imports: everything is hermetically unit-testable.

/** The six scorecard criteria: schema key + human label, in render order. */
export const CRITERIA: readonly { key: keyof Scores; label: string }[] = [
  { key: "implementation_correctness", label: "Implementation correctness" },
  { key: "idiomaticity", label: "Idiomaticity" },
  { key: "complexity", label: "Complexity" },
  { key: "test_risk_coverage", label: "Test / risk coverage" },
  { key: "documentation", label: "Documentation" },
  { key: "security_safety", label: "Security & safety" },
];

/**
 * Assign per-run stable IDs (F1..Fn) by input position. Callers must pass a
 * deterministically ordered list — the pipeline routes findings through
 * `mergeFindings` (dedup + file/line/category sort) first, so identical
 * findings get identical IDs regardless of model output order.
 */
export function assignFindingIds(findings: Finding[]): IdentifiedFinding[] {
  return findings.map((finding, index) => ({ ...finding, id: `F${String(index + 1)}` }));
}

export interface ValidatedJudgeOutput {
  output: JudgeOutput;
  droppedFindingIdRefs: number;
}

/**
 * Strip judge `findingIds` references that don't match a known finding ID and
 * count the drops — the judge can never mint findings. Pure: the input output
 * object is not mutated.
 */
export function validateJudgeReferences(output: JudgeOutput, knownIds: readonly string[]): ValidatedJudgeOutput {
  const known = new Set(knownIds);
  let droppedFindingIdRefs = 0;
  const scores = { ...output.scores };
  for (const { key } of CRITERIA) {
    const criterion = scores[key];
    const kept = criterion.findingIds.filter((id) => known.has(id));
    droppedFindingIdRefs += criterion.findingIds.length - kept.length;
    scores[key] = { ...criterion, findingIds: kept };
  }
  return { output: { ...output, scores }, droppedFindingIdRefs };
}
