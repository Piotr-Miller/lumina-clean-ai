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

/**
 * Cost summary of the finder's agent loop, accumulated across BOTH attempts
 * of a retried run — it measures real spend, so `steps` counts generations
 * across attempts and MAY exceed the per-attempt maxSteps cap. Token fields
 * are absent when the provider reported no usage.
 */
export interface FinderTelemetry {
  steps: number;
  toolCalls: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /**
   * Provider-reported spend, accumulated across every observed step. Absent
   * (never 0) when the provider reported none — a fabricated 0 reads as "free".
   *
   * This existed per-step in describeFinderStep from the start but was never
   * accumulated here, so review.json carried finder tokens and no finder cost.
   * That is what made criterion 4.8's ratio uncomputable: the numerator was
   * instrumented and the denominator was not.
   */
  cost?: number;
}

/**
 * Judge spend, accumulated across BOTH attempts of a retried run.
 *
 * The judge had no telemetry at all until 4.8 needed it — it was the one pass
 * whose cost was never observable, and it is also the pass that reaches for the
 * expensive model.
 */
export interface JudgeTelemetry {
  attempts: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
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
  /**
   * Whether the plan was truncated at PLAN_CAP_CHARS. Present only when the
   * run actually carried a plan — absent (not `false`) otherwise, so a
   * plan-less review.json is byte-identical to the pre-feature shape.
   */
  planTruncated?: boolean;
  droppedFindingIdRefs: number;
  models: { finder: string; judge: string };
  /**
   * Present only when the pipeline constructed the real finder and observed
   * at least one loop step — absent with an injected deps.finder. Nothing
   * renders it; it rides along in review.json as the per-run cost record.
   */
  finderTelemetry?: FinderTelemetry;
  /**
   * Present only when the pipeline constructed the real judge and observed at
   * least one generation — absent with an injected deps.judge. Same convention
   * as finderTelemetry and implReviewTelemetry.
   */
  judgeTelemetry?: JudgeTelemetry;
  /**
   * The implementation-review pass's outcome — see ImplReviewBlock. Absent
   * (not a `skipped` variant) when the run carried no plan.
   */
  implReview?: ImplReviewBlock;
  /**
   * Provider spend of the implementation-review pass. Present only when the
   * pipeline constructed the real reviewer and observed at least one
   * generation — absent with an injected deps.implReviewer, and absent when
   * the pass did not run at all. Same convention as finderTelemetry.
   */
  implReviewTelemetry?: ImplReviewTelemetry;
}

/**
 * Provider spend of the implementation-review pass, accumulated across BOTH
 * attempts of a retried run so it measures the run's real cost rather than the
 * surviving attempt's. `cost` is the provider-reported figure and stays absent
 * (never 0) when the provider reported none — a fabricated 0 would read as
 * "this pass was free".
 */
export interface ImplReviewTelemetry {
  /** Generations observed; 2 on a retried run, since the pass is tool-less. */
  attempts: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
}

/**
 * Exactly TWO shapes — reviewed, or failed.
 *
 * There is deliberately no `skipped` variant: absence of the whole key IS the
 * no-plan signal (plan-review F5), matching the finderTelemetry convention so
 * `in` checks and review.json stay clean, and leaving one canonical
 * representation of "no plan" rather than two competing ones. The renderer
 * reads absence as the neutral no-plan section.
 *
 * `planPath` is display metadata and UNTRUSTED — the PR body can name it — so
 * it is escaped at render time, never interpolated.
 */
export type ImplReviewBlock =
  | ({ status: "reviewed"; planPath?: string } & ImplReviewResult)
  | { status: "failed"; error: string };

// --- Implementation review (third pass) ---
// Judges the PR against the plan it claims to implement. The vocabulary is
// ported from the 10x-impl-review-ci criteria layer; typing it here means
// grades and findings are validated rather than parsed out of prose.

export const implDimensionSchema = z.enum([
  "plan_adherence",
  "scope_discipline",
  "safety_quality",
  "architecture",
  "pattern_consistency",
  "test_coverage",
  "success_criteria",
]);
export type ImplDimension = z.infer<typeof implDimensionSchema>;

export const implGradeSchema = z.enum(["PASS", "WARNING", "FAIL"]);
export type ImplGrade = z.infer<typeof implGradeSchema>;

/** How bad if ignored — orthogonal to impact, which is how hard it is to decide. */
export const implSeveritySchema = z.enum(["CRITICAL", "WARNING", "OBSERVATION"]);
export type ImplSeverity = z.infer<typeof implSeveritySchema>;

/** How much reviewer attention the decision needs — orthogonal to severity. */
export const implImpactSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type ImplImpact = z.infer<typeof implImpactSchema>;

export const implVerdictSchema = z.enum(["APPROVED", "NEEDS_ATTENTION", "REJECTED"]);
export type ImplVerdict = z.infer<typeof implVerdictSchema>;

// The four-verdict drift model (MATCH / DRIFT / MISSING / EXTRA) informs the
// instructions but is deliberately NOT a schema field: only deviations
// surface, as findings under plan_adherence. A per-planned-change verdict
// table would dominate the comment for no added signal.
export const implFindingSchema = z.object({
  dimension: implDimensionSchema.describe("Which of the seven dimensions this finding belongs to"),
  severity: implSeveritySchema.describe("How bad this is if left unaddressed"),
  impact: implImpactSchema.describe("How much reviewer attention the decision needs"),
  title: z.string().describe("One short line naming the problem"),
  file: z.string().optional().describe("Repo-relative path, omitted when the issue is something missing"),
  startLine: lineNumber("Absolute 1-based line the finding anchors to, when it has one"),
  detail: z
    .string()
    .describe("What is wrong, with evidence: plan quote vs actual behavior, or code excerpt vs expected"),
  fix: z.string().describe("The concrete fix, or the tradeoff between two options when one genuinely exists"),
});
export type ImplFinding = z.infer<typeof implFindingSchema>;

// Named fields over the seven dimensions, never a positional array — the same
// decision scoresSchema records: models and renderers both address dimensions
// by name, and a positional array silently misaligns when one is reordered.
export const implGradesSchema = z.object({
  plan_adherence: implGradeSchema,
  scope_discipline: implGradeSchema,
  safety_quality: implGradeSchema,
  architecture: implGradeSchema,
  pattern_consistency: implGradeSchema,
  test_coverage: implGradeSchema,
  success_criteria: implGradeSchema,
});
export type ImplGrades = z.infer<typeof implGradesSchema>;

const implReviewOutputShape = z.object({
  grades: implGradesSchema,
  verdict: implVerdictSchema.describe("Overall verdict weighed from the dimension grades"),
  verdictReason: z
    .string()
    .describe("1-2 sentences explaining the verdict")
    .refine((value) => value.length > 0, { message: "verdictReason must not be empty" }),
  findings: z.array(implFindingSchema),
});

/**
 * Post-parse consistency rules (impl-review-phase-2 F4).
 *
 * The vocabulary checks above prove the model used our words; they cannot tell
 * whether the words agree with each other. All-PASS grades next to a CRITICAL
 * finding is not a judgment call — it is self-contradictory output, and
 * rendering it downstream publishes a scorecard that argues against its own
 * findings.
 *
 * The set is deliberately MINIMAL, and every rule restates a threshold
 * `buildImplReviewInstructions` already gives the model — the validator never
 * enforces something the prompt did not say. Everything the rubric leaves to
 * judgment (how many warnings still allow APPROVED, whether an issue is
 * CRITICAL at all) stays the model's to decide. The rules also run in one
 * direction only: they catch a run understating what it found, never one
 * grading itself more harshly than its findings require.
 *
 * A violation fails validation like any other schema mismatch — the pipeline's
 * single re-roll, then a reported failure.
 */
const checkImplReviewConsistency = (output: z.infer<typeof implReviewOutputShape>, ctx: z.RefinementCtx): void => {
  for (const [index, finding] of output.findings.entries()) {
    if (finding.startLine !== undefined && finding.file === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["findings", index, "startLine"],
        message: "a line number is meaningless without the file it indexes into",
      });
    }
    const grade = output.grades[finding.dimension];
    if (finding.severity === "CRITICAL" && grade !== "FAIL") {
      ctx.addIssue({
        code: "custom",
        path: ["grades", finding.dimension],
        message: `a CRITICAL ${finding.dimension} finding requires that dimension to be graded FAIL, not ${grade}`,
      });
    }
    if (finding.severity === "WARNING" && grade === "PASS") {
      ctx.addIssue({
        code: "custom",
        path: ["grades", finding.dimension],
        message: `a WARNING ${finding.dimension} finding contradicts a PASS grade on that dimension`,
      });
    }
  }
  if (output.verdict === "APPROVED" && Object.values(output.grades).includes("FAIL")) {
    ctx.addIssue({ code: "custom", path: ["verdict"], message: "APPROVED contradicts a FAIL grade" });
  }
  if (output.verdict !== "REJECTED" && output.findings.some((finding) => finding.severity === "CRITICAL")) {
    ctx.addIssue({
      code: "custom",
      path: ["verdict"],
      message: `a CRITICAL finding requires the REJECTED verdict, not ${output.verdict}`,
    });
  }
};

export const implReviewOutputSchema = implReviewOutputShape.superRefine(checkImplReviewConsistency);
export type ImplReviewOutput = z.infer<typeof implReviewOutputSchema>;

/** Implementation-review finding with its per-run stable id (P1..Pn), assigned in code — never by the model. */
export type IdentifiedImplFinding = ImplFinding & { id: string };

/** Validated implementation-review output with ids assigned and the finding list capped. */
export type ImplReviewResult = Omit<ImplReviewOutput, "findings"> & {
  findings: IdentifiedImplFinding[];
};

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
