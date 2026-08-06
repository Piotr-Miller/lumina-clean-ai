// Pure barrel — the package's public surface. No executable statements: any
// import-time side effect here would break embedders (promptfoo imports this).

export { DEFAULT_MODEL, resolveConfig } from "./config.js";
export type { ConfigOverrides, ResolvedConfig } from "./config.js";
export { findingKey, mergeFindings, normalizeFindings } from "./findings.js";
export { buildInstructions, buildPrompt } from "./prompts.js";
export { createReviewer } from "./reviewer.js";
export type { ReviewCallOptions, Reviewer, ReviewerOptions, SourceProvider } from "./reviewer.js";
export {
  categorySchema,
  findingSchema,
  lensSchema,
  reviewResultSchema,
  reviewUnitSchema,
  severitySchema,
} from "./schemas.js";
export type {
  Category,
  Finding,
  Lens,
  ReviewResult,
  ReviewUnit,
  Severity,
} from "./schemas.js";
