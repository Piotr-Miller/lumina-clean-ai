// Pure barrel — the package's public surface. No executable statements: any
// import-time side effect here would break embedders (promptfoo imports this).

export { DEFAULT_JUDGE_MODEL, DEFAULT_MODEL, resolveConfig, resolveModels } from "./config.js";
export type { ConfigOverrides, ModelOverrides, ResolvedConfig, ResolvedModels } from "./config.js";
export { findingKey, mergeFindings, normalizeFindings, severityRank } from "./findings.js";
export { createJudge } from "./judge.js";
export type { Judge, JudgeCallOptions, JudgeOptions } from "./judge.js";
export {
  BODY_CAP_CHARS,
  BODY_TRUNCATION_MARKER,
  computeDiffStats,
  DEFAULT_FINDER_TIMEOUT_MS,
  describeFinderStep,
  DIFF_CAP_BYTES,
  DIFF_TRUNCATION_MARKER,
  runReviewPipeline,
} from "./pipeline.js";
export type { FinderStepInfo, PipelineDeps, PipelineInput, PipelineOverrides } from "./pipeline.js";
export { buildInstructions, buildJudgeInstructions, buildJudgePrompt, buildPrompt } from "./prompts.js";
export type { JudgePromptInput } from "./prompts.js";
export { MAX_RENDERED_FINDINGS, renderStickyComment, STICKY_MARKER } from "./render.js";
export { isRetryableError, withOneRetry } from "./retry.js";
export { createReviewer } from "./reviewer.js";
export type { ReviewCallOptions, Reviewer, ReviewerOptions, SourceProvider } from "./reviewer.js";
export { assignFindingIds, CRITERIA, validateJudgeReferences } from "./scorecard.js";
export type { ValidatedJudgeOutput } from "./scorecard.js";
export { createDiffScopedSource, MAX_LISTED_PATHS, parseDiffPaths } from "./source-provider.js";
export type { DiffScopedSourceOptions } from "./source-provider.js";
export {
  categorySchema,
  criterionScoreSchema,
  findingSchema,
  judgeOutputSchema,
  lensSchema,
  reviewResultSchema,
  reviewUnitSchema,
  scoresSchema,
  severitySchema,
  verdictSchema,
} from "./schemas.js";
export type {
  Category,
  CriterionScore,
  DiffStats,
  FinderTelemetry,
  Finding,
  IdentifiedFinding,
  JudgeOutput,
  JudgeResult,
  Lens,
  PipelineResult,
  ReviewResult,
  ReviewUnit,
  Scores,
  Severity,
  Verdict,
} from "./schemas.js";
