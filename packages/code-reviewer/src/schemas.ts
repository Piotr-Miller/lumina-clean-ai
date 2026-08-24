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
export const categorySchema = z.enum(["security", "performance", "correctness", "style", "testing", "documentation"]);
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
  startLine: lineNumber("Absolute 1-based line in the file where the issue starts; omit for file-level findings"),
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

/**
 * WIRE shape for one criterion. `score` is a STRING ENUM, not a number.
 *
 * The integer-1-to-10 rule used to live in a `.refine()`, which emits nothing
 * into the JSON Schema — so all the model ever saw was
 * `{"type":"number","description":"Integer score from 1 … to 10 …"}` and the
 * constraint was carried by prose alone. That was forced: `.int()/.min()/.max()`
 * emit `minimum`/`maximum`, which this provider rejects (Phase 1 live finding).
 *
 * The cost of that displacement was real. A model returning `7.5`, `0`, or an
 * `85` on a 0-100 scale produces valid JSON that then fails validation as
 * `AI_NoObjectGeneratedError: response did not match schema` — observed on PR
 * #137's run — and the judge's envelope repair cannot help, because the JSON was
 * never malformed, only out of range.
 *
 * An enum puts the constraint back where the model can SEE it, and emits
 * `enum: ["1", … "10"]` rather than the rejected numeric bounds. `absent` of any
 * `anyOf`, so it stays inside the provider's subset. Strings because a numeric
 * enum in zod requires a literal union, which renders as `anyOf` — the exact
 * construct proven unusable in lessons.md #26.
 *
 * The trusted type is a NUMBER, produced once by `normalizeJudgeOutput`.
 */
export const criterionScoreWireSchema = z.object({
  score: z
    .enum(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"])
    .describe("Score from 1 (worst outcome) to 10 (best outcome), as a string"),
  justification: z.string().describe("Why this score, grounded in the referenced findings"),
  findingIds: z.array(z.string()).describe("IDs of the findings supporting a deduction; empty when nothing applies"),
});

/** The trusted per-criterion contract: score is a number, 1-10, guaranteed by the enum. */
export interface CriterionScore {
  score: number;
  justification: string;
  findingIds: string[];
}

// Named fields, never a positional array — models and evals both address
// criteria by name (user decision).
export const scoresWireSchema = z.object({
  implementation_correctness: criterionScoreWireSchema,
  idiomaticity: criterionScoreWireSchema,
  complexity: criterionScoreWireSchema,
  test_risk_coverage: criterionScoreWireSchema,
  documentation: criterionScoreWireSchema,
  security_safety: criterionScoreWireSchema,
});

export interface Scores {
  implementation_correctness: CriterionScore;
  idiomaticity: CriterionScore;
  complexity: CriterionScore;
  test_risk_coverage: CriterionScore;
  documentation: CriterionScore;
  security_safety: CriterionScore;
}

export const verdictSchema = z.enum(["passed", "failed"]);
export type Verdict = z.infer<typeof verdictSchema>;

// The judge owns the verdict (user decision): thresholds are rubric guidance
// in the prompt, not a code rule. The judge-authored summary is the scorecard
// summary; the finder's internal summary is not surfaced.
export const judgeOutputSchema = z.object({
  scores: scoresWireSchema,
  verdict: verdictSchema.describe("Overall verdict for the change, weighed from the findings"),
  // minLength (not a refine) so the model actually sees the requirement. Unlike
  // minimum/maximum this one IS accepted by the provider — the finder's schema
  // has used it since day one.
  verdictReason: z.string().min(1).describe("1-2 sentences explaining the verdict"),
  summary: z.string().min(1).describe("One-paragraph overall assessment of the reviewed change"),
});

/** What the model returns: scores as strings. Normalize before use. */
export type JudgeOutputWire = z.infer<typeof judgeOutputSchema>;

/** The trusted contract every consumer sees. */
export interface JudgeOutput {
  scores: Scores;
  verdict: Verdict;
  verdictReason: string;
  summary: string;
}

const toCriterionScore = (wire: z.infer<typeof criterionScoreWireSchema>): CriterionScore => ({
  // Exact by construction: the enum admits only "1".."10".
  score: Number(wire.score),
  justification: wire.justification,
  findingIds: wire.findingIds,
});

/**
 * Normalize once, immediately after validation — each criterion constructed
 * explicitly rather than mapped through a cast, so the compiler checks that the
 * six named fields survive rather than being told to trust it.
 */
export function normalizeJudgeOutput(wire: JudgeOutputWire): JudgeOutput {
  return {
    scores: {
      implementation_correctness: toCriterionScore(wire.scores.implementation_correctness),
      idiomaticity: toCriterionScore(wire.scores.idiomaticity),
      complexity: toCriterionScore(wire.scores.complexity),
      test_risk_coverage: toCriterionScore(wire.scores.test_risk_coverage),
      documentation: toCriterionScore(wire.scores.documentation),
      security_safety: toCriterionScore(wire.scores.security_safety),
    },
    verdict: wire.verdict,
    verdictReason: wire.verdictReason,
    summary: wire.summary,
  };
}

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

/**
 * The exact payload the finder's `<truncation-metadata>` fence rendered: the
 * file the cap cut into, the fully over-cap files (capped at
 * TRUNCATION_METADATA_MAX_FILES, remainder as omittedCount). Persisted
 * verbatim in review.json so the passive live check registered in
 * r5-finder-truncation-note/decision.md Disposition #2 can compare
 * getFileContext targets against the files the note actually named without
 * depending on Actions-log retention (impl-review F1).
 */
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
  /**
   * Paths the findings name that appear nowhere in the reviewed diff — sorted,
   * deduped, empty in the healthy case. A non-empty value means the review is
   * partly about files this PR never touched; see `offDiffFindingPaths`.
   * Diff units only: single-file units have their `file` coerced to the unit's
   * own path, so the check is vacuous there and the field stays empty.
   */
  offDiffFindingPaths: string[];
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
 * Three shapes — reviewed, failed, or skipped.
 *
 * Absence of the whole key still means "no plan" (plan-review F5): that is the
 * one signal that must not have two representations, and the renderer reads
 * absence as the neutral no-plan section.
 *
 * `skipped` was added later, when the pass was gated behind a passing code
 * review on cost grounds (measured at 9.47x the code review it rides alongside).
 * F5 rejected a `skipped` variant because it would have been a redundant SECOND
 * way to say "no plan" — but "not run because the code review failed" is a
 * different statement, and without its own shape a gated run would render as
 * "no plan found for this PR", which is simply false.
 *
 * `planPath` is display metadata and UNTRUSTED — the PR body can name it — so
 * it is escaped at render time, never interpolated.
 */
export type ImplReviewBlock =
  | ({ status: "reviewed"; planPath?: string } & ImplReviewResult)
  | { status: "failed"; error: string }
  | { status: "skipped"; reason: string };

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
/** The three real places a finding can point. Required, so it is never unsaid. */
export const implLocusSchema = z.enum(["code", "file", "absent"]);
export type ImplLocus = z.infer<typeof implLocusSchema>;

const implFindingBase = {
  dimension: implDimensionSchema.describe("Which of the seven dimensions this finding belongs to"),
  severity: implSeveritySchema.describe("How bad this is if left unaddressed"),
  impact: implImpactSchema.describe("How much reviewer attention the decision needs"),
  title: z.string().describe("One short line naming the problem"),
  detail: z
    .string()
    .describe("What is wrong, with evidence: plan quote vs actual behavior, or code excerpt vs expected"),
  fix: z.string().describe("The concrete fix, or the tradeoff between two options when one genuinely exists"),
};

/**
 * WIRE shape — deliberately internal, deliberately flat.
 *
 * Anchoring was measured at `startLine` 0/10 and `file` 2/10 while the finder,
 * whose equivalent field is REQUIRED, anchored 20/20. Two prompt-level fixes
 * failed; `scripts/schema-dump.mjs` showed the cause was structural, not textual.
 *
 * The obvious fix — `z.discriminatedUnion("locus", …)` — was built and PROVEN
 * unusable: `z.toJSONSchema` renders it as `oneOf`, which Anthropic's
 * structured-output subset does not support. The provider accepted the request
 * and the model answered in Markdown prose instead of JSON, so nothing validated.
 * Notably it used all three loci CORRECTLY in that prose (4 of 6 findings
 * anchored), so the design is sound and only its encoding was not.
 *
 * Hence: flat on the wire so the emitted schema stays a single object, with
 * `locus` REQUIRED so the model must still decide explicitly, and every
 * combination enforced below. Omission is a validation failure, not a default.
 * The trusted union type begins after validation — see `normalizeImplFinding`.
 */
const implFindingWireSchema = z
  .object({
    ...implFindingBase,
    locus: implLocusSchema.describe(
      'Where this finding points: "code" for specific changed code (requires file AND startLine), "file" for a file as a whole (requires file, no startLine), "absent" when it has no place in the diff at all — missing work or a plan-level observation (no file, no startLine)',
    ),
    file: z
      .string()
      .min(1)
      .optional()
      .describe('Repo-relative path exactly as it appears in the diff. Required for locus "code" and "file".'),
    startLine: lineNumber('Absolute 1-based line in that file. Required for locus "code", forbidden otherwise.'),
  })
  .superRefine((finding, ctx) => {
    // All three combinations, stated positively so an unhandled locus cannot
    // slip through as "valid by omission".
    const need = (field: "file" | "startLine") => {
      if (finding[field] === undefined) {
        ctx.addIssue({ code: "custom", path: [field], message: `locus "${finding.locus}" requires ${field}` });
      }
    };
    const forbid = (field: "file" | "startLine") => {
      if (finding[field] !== undefined) {
        ctx.addIssue({ code: "custom", path: [field], message: `locus "${finding.locus}" must not carry ${field}` });
      }
    };
    switch (finding.locus) {
      case "code":
        need("file");
        need("startLine");
        break;
      case "file":
        need("file");
        forbid("startLine");
        break;
      case "absent":
        forbid("file");
        forbid("startLine");
        break;
    }
  });

type ImplFindingWire = z.infer<typeof implFindingWireSchema>;
type ImplFindingCommon = Omit<ImplFindingWire, "locus" | "file" | "startLine">;

/**
 * The exported contract: a discriminated union, so consumers switch exhaustively
 * and a new variant becomes a compile error rather than an unlabelled finding.
 */
export type ImplFinding =
  | (ImplFindingCommon & { locus: "code"; file: string; startLine: number })
  | (ImplFindingCommon & { locus: "file"; file: string })
  | (ImplFindingCommon & { locus: "absent" });

/**
 * Normalize a validated wire finding into the union — each variant CONSTRUCTED
 * explicitly, never asserted, so the compiler checks the mapping rather than
 * being told to trust it.
 *
 * The guards are unreachable once `implFindingWireSchema` has accepted the value;
 * they exist so this function is sound on its own terms instead of depending on a
 * caller having validated first.
 */
export function normalizeImplFinding(wire: ImplFindingWire): ImplFinding {
  const { locus, file, startLine, ...common } = wire;
  switch (locus) {
    case "code":
      if (file === undefined || startLine === undefined) {
        throw new Error('impl finding with locus "code" is missing file or startLine');
      }
      return { ...common, locus: "code", file, startLine };
    case "file":
      if (file === undefined) throw new Error('impl finding with locus "file" is missing file');
      return { ...common, locus: "file", file };
    case "absent":
      return { ...common, locus: "absent" };
  }
}

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
  findings: z.array(implFindingWireSchema),
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
  for (const finding of output.findings) {
    // The old "startLine requires file" rule lived here. It is gone because the
    // locus union makes that state UNREPRESENTABLE rather than merely invalid —
    // a structural guarantee beats a post-parse check.
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
    // The finder's truncation note carried `truncated`/`cutFile`/
    // `overCapFiles` here (change r5-finder-truncation-note). Removed after
    // the pre-registered live check found the tool channel INERT — see
    // context/archive/2026-08-22-r5-finder-truncation-note/decision.md
    // Disposition #1. The 100 KB cap itself, `diffTruncated`, the human-facing
    // warning and the implementation-review note all remain.
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
