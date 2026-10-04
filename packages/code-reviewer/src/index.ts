// Pure barrel — the package's public surface. No executable statements: any
// import-time side effect here would break embedders (promptfoo imports this).

export { DEFAULT_FINDER_MAX_STEPS } from "./cli.js";
export {
  DEFAULT_IMPL_REVIEW_MODEL,
  DEFAULT_JUDGE_MODEL,
  DEFAULT_MODEL,
  DEFAULT_VERIFIER_MODEL,
  DEFAULT_VERIFIER_PROVIDERS,
  resolveConfig,
  resolveModels,
  resolveVerifierProviderRouting,
} from "./config.js";
export type { ConfigOverrides, ModelOverrides, ResolvedConfig, ResolvedModels } from "./config.js";
// identifyImplFindings and MAX_IMPL_FINDINGS stay internal: createImplReviewer
// applies both on the way out, so an embedder never needs them (phase-2 F5).
export { createImplReviewer } from "./impl-reviewer.js";
export type { ImplReviewCallOptions, ImplReviewer, ImplReviewerOptions } from "./impl-reviewer.js";
export { findingKey, mergeFindings, normalizeFindings, severityRank } from "./findings.js";
export { EXCERPT_LIMITS, findTopLevelUnits, planExcerpts } from "./excerpts.js";
export type {
  ExcerptBlock,
  ExcerptLimits,
  ExcerptPlan,
  ExcerptUnverifiableReason,
  FindingExcerpt,
  PlanExcerptsInput,
  TopLevelUnit,
} from "./excerpts.js";
export { createJudge } from "./judge.js";
export type { Judge, JudgeCallOptions, JudgeOptions } from "./judge.js";
export {
  asStepCost,
  BODY_CAP_CHARS,
  BODY_TRUNCATION_MARKER,
  capPlan,
  computeDiffStats,
  DEFAULT_FINDER_TIMEOUT_MS,
  DEFAULT_IMPL_REVIEW_TIMEOUT_MS,
  DEFAULT_VERIFIER_TIMEOUT_MS,
  describeFinderStep,
  DIFF_CAP_BYTES,
  DIFF_TRUNCATION_MARKER,
  PLAN_CAP_CHARS,
  PLAN_TRUNCATION_MARKER,
  runReviewPipeline,
  runVerificationPass,
} from "./pipeline.js";
export type {
  FinderStepInfo,
  PipelineDeps,
  PipelineInput,
  PipelineOverrides,
  RetryPass,
  VerificationPassInput,
  VerificationPassResult,
  VerifierStepInfo,
  VerifyFn,
} from "./pipeline.js";
export {
  buildImplReviewInstructions,
  buildImplReviewPrompt,
  buildInstructions,
  buildJudgeInstructions,
  buildJudgePrompt,
  buildPrompt,
  buildVerifierInstructions,
  buildVerifierPrompt,
} from "./prompts.js";
export type { ImplReviewPromptInput, JudgePromptInput, VerifierPromptInput } from "./prompts.js";
export { MAX_RENDERED_FINDINGS, renderStickyComment, STICKY_MARKER } from "./render.js";
export { isRetryableError, withOneRetry } from "./retry.js";
export { createReviewer } from "./reviewer.js";
export type { ReviewCallOptions, Reviewer, ReviewerOptions, SourceProvider } from "./reviewer.js";
export { assignFindingIds, CRITERIA, validateJudgeReferences } from "./scorecard.js";
export type { ValidatedJudgeOutput } from "./scorecard.js";
export {
  createDiffScopedReaderForDiff,
  createDiffScopedSource,
  createDiffScopedSourceForDiff,
  MAX_LISTED_PATHS,
  parseDiffPaths,
  readDiffScoped,
} from "./source-provider.js";
export type {
  DiffScopedRead,
  DiffScopedReader,
  DiffScopedReadRequest,
  DiffScopedSourceOptions,
} from "./source-provider.js";
export {
  applyVerdicts,
  checkQuote,
  createVerifier,
  MIN_QUOTE_CHARS,
  normalizeQuote,
  parseVerifierOutput,
  VerifierOutputError,
} from "./verifier.js";
export type { AppliedVerdicts, Verifier, VerifierCallOptions, VerifierOptions } from "./verifier.js";
export {
  categorySchema,
  criterionScoreWireSchema,
  findingSchema,
  implDimensionSchema,
  implGradeSchema,
  implLocusSchema,
  implGradesSchema,
  implImpactSchema,
  implReviewOutputSchema,
  implSeveritySchema,
  implVerdictSchema,
  judgeOutputSchema,
  lensSchema,
  reviewResultSchema,
  reviewUnitSchema,
  scoresWireSchema,
  severitySchema,
  verdictSchema,
  verificationOutputSchema,
  verifierVerdictSchema,
} from "./schemas.js";
export type {
  Category,
  CriterionScore,
  DiffStats,
  FinderTelemetry,
  Finding,
  IdentifiedFinding,
  IdentifiedImplFinding,
  ImplDimension,
  ImplFinding,
  ImplGrade,
  ImplGrades,
  ImplImpact,
  ImplReviewBlock,
  ImplReviewOutput,
  ImplReviewResult,
  ImplReviewTelemetry,
  ImplSeverity,
  ImplVerdict,
  JudgeOutput,
  JudgeResult,
  JudgeTelemetry,
  Lens,
  PipelineResult,
  ReviewResult,
  ReviewUnit,
  Scores,
  Severity,
  Verdict,
  VerificationBlock,
  VerificationOutput,
  VerificationReasonCode,
  VerificationRecord,
  VerificationState,
  VerifierTelemetry,
  VerifierVerdict,
} from "./schemas.js";
