import { z } from "zod";

// Shared zod vocabulary for the reviewer: lenses, review units, and the
// normalized findings shape. Every future agent/orchestrator/eval speaks this.

export const lensSchema = z.enum(["general", "security", "performance", "correctness", "style"]);
export type Lens = z.infer<typeof lensSchema>;

export const severitySchema = z.enum(["critical", "major", "minor", "nit"]);
export type Severity = z.infer<typeof severitySchema>;

// No "general" here: every finding attributes a concrete dimension, whichever
// lens produced it. The general lens may emit any category. `testing` and
// `documentation` exist so the finder can surface the gaps the judge's
// test-coverage and documentation criteria score — the judge only sees
// findings, never the diff.
export const categorySchema = z.enum([
  "security",
  "performance",
  "correctness",
  "style",
  "testing",
  "documentation",
]);
export type Category = z.infer<typeof categorySchema>;

// Line numbers use number+refine instead of .int().min(1) for provider
// compatibility: zod v4's .int() emits JSON Schema minimum/maximum bounds,
// which Anthropic's structured-output endpoint rejects — and the finder falls
// back to an Anthropic model when no review-model env is set.
const lineNumber = (description: string) =>
  z
    .number()
    .describe(description)
    .refine((value) => Number.isInteger(value) && value >= 1, {
      message: "line numbers are 1-based positive integers",
    })
    .optional();

export const findingSchema = z.object({
  file: z.string().min(1).describe("File path exactly as given in the review unit"),
  startLine: lineNumber(
    "Absolute 1-based line in the file where the issue starts; omit for file-level findings",
  ),
  endLine: lineNumber("Absolute 1-based line where the issue ends, if it spans a range"),
  severity: severitySchema.describe("How bad the issue is if left unfixed"),
  category: categorySchema.describe("Which review dimension the issue belongs to"),
  description: z.string().describe("What is wrong and why it matters"),
  suggestion: z.string().describe("Concrete fix or improvement"),
});
export type Finding = z.infer<typeof findingSchema>;

export const reviewResultSchema = z.object({
  summary: z.string().describe("One-sentence overall verdict on the reviewed code"),
  findings: z.array(findingSchema),
});
export type ReviewResult = z.infer<typeof reviewResultSchema>;

// --- Two-pass scorecard vocabulary (judge output; user decisions: named
// criterion fields, model-owned verdict) ---

export const criterionScoreSchema = z.object({
  // Integer + range live in a refine (parse-time enforced), NOT in .int()/
  // .min()/.max(): Anthropic's structured-output endpoint rejects JSON Schema
  // minimum/maximum on integer types, and zod v4's .int() alone already emits
  // safe-integer minimum/maximum bounds (live-run finding, Phase 1).
  score: z
    .number()
    .describe("Integer score from 1 (worst outcome) to 10 (best outcome)")
    .refine((value) => Number.isInteger(value) && value >= 1 && value <= 10, {
      message: "score must be an integer between 1 and 10",
    }),
  justification: z.string().describe("Why this score, grounded in the referenced findings"),
  findingIds: z
    .array(z.string())
    .describe("IDs of the findings supporting a deduction; empty when nothing applies"),
});
export type CriterionScore = z.infer<typeof criterionScoreSchema>;

// Named fields, never a positional array — models and evals both address
// criteria by name (user decision).
export const scoresSchema = z.object({
  implementation_correctness: criterionScoreSchema,
  idiomaticity: criterionScoreSchema,
  complexity: criterionScoreSchema,
  test_risk_coverage: criterionScoreSchema,
  documentation: criterionScoreSchema,
  security_safety: criterionScoreSchema,
});
export type Scores = z.infer<typeof scoresSchema>;

export const verdictSchema = z.enum(["passed", "failed"]);
export type Verdict = z.infer<typeof verdictSchema>;

// The judge owns the verdict (user decision): thresholds are rubric guidance
// in the prompt, not a code rule. The judge-authored summary is the scorecard
// summary; the finder's internal summary is not surfaced.
export const judgeOutputSchema = z.object({
  scores: scoresSchema,
  verdict: verdictSchema.describe("Overall verdict for the change, weighed from the findings"),
  // Non-emptiness via refine for the same provider-compat reason as `score`.
  verdictReason: z
    .string()
    .describe("1-2 sentences explaining the verdict")
    .refine((value) => value.length > 0, { message: "verdictReason must not be empty" }),
  summary: z.string().describe("One-paragraph overall assessment of the reviewed change"),
});
export type JudgeOutput = z.infer<typeof judgeOutputSchema>;

/** Judge result: validated judge output + reference-integrity metadata. */
export type JudgeResult = JudgeOutput & { droppedFindingIdRefs: number };

/** Finding with its per-run stable id (F1..Fn), assigned in code — never by the model. */
export type IdentifiedFinding = Finding & { id: string };

export interface DiffStats {
  files: number;
  additions: number;
  deletions: number;
}

/** Full result of the two-pass review pipeline (what review.json carries). */
export interface PipelineResult {
  summary: string;
  findings: IdentifiedFinding[];
  /**
   * The finder's normalized finding count before the dedup/merge — always
   * >= findings.length. Measurement only (the dedup-identity decision is
   * deferred to code-review-evals with live collapse data); nothing renders
   * it, it just rides along in review.json.
   */
  preDedupFindingCount: number;
  scores: Scores;
  verdict: Verdict;
  verdictReason: string;
  diffStats: DiffStats;
  diffTruncated: boolean;
  bodyTruncated: boolean;
  droppedFindingIdRefs: number;
  models: { finder: string; judge: string };
}

export const reviewUnitSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("diff"),
    diff: z.string().min(1).describe("Unified diff text"),
  }),
  z.object({
    kind: z.literal("file"),
    path: z.string().min(1),
    content: z.string().describe("Full file content"),
  }),
  z.object({
    kind: z.literal("hunk"),
    path: z.string().min(1),
    content: z.string().describe("The hunk's lines as they appear in the file"),
    startLine: z.number().int().min(1).describe("Absolute 1-based file line of the hunk's first line"),
  }),
]);
export type ReviewUnit = z.infer<typeof reviewUnitSchema>;
