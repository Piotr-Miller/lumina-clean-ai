// Lazy, throwing config resolution — usable from library context. No
// module-level env reads and never process.exit: promptfoo (and any other
// embedder) must be able to import the barrel side-effect-free; only demo.ts
// may exit the process.

// Must match what production actually runs (the OPENROUTER_REVIEW_MODEL
// repository variable), because this is the value that takes over if that
// variable is ever unset or cleared. It read anthropic/claude-sonnet-5 while
// the variable read z-ai/glm-4.6, so a cleared variable would silently have
// switched the finder to a model measured at ~58x the cost per review
// (change `finder-tool-loop-evals`, impl-review-phase-4 F1). Pinned by a
// literal assertion in config.test.ts: change both together, and only
// alongside the repository variable.
export const DEFAULT_MODEL = "z-ai/glm-4.6";
export const DEFAULT_JUDGE_MODEL = "anthropic/claude-sonnet-5";

export interface ModelOverrides {
  reviewModel?: string;
  judgeModel?: string;
}

export interface ResolvedModels {
  reviewModel: string;
  judgeModel: string;
}

/**
 * Two-pass model resolution (user decision, backward compatible): finder =
 * override → OPENROUTER_REVIEW_MODEL → legacy OPENROUTER_MODEL → DEFAULT_MODEL;
 * judge = override → OPENROUTER_JUDGE_MODEL → DEFAULT_JUDGE_MODEL. Key-free so
 * hermetic pipeline tests can resolve model metadata without an API key.
 */
export function resolveModels(overrides: ModelOverrides = {}): ResolvedModels {
  // `||` (not `??`) throughout: set-but-empty env vars must fall back instead
  // of sending "" to the provider (impl-review-full F3).
  /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty string IS the missing case here */
  const reviewModel =
    overrides.reviewModel ||
    process.env.OPENROUTER_REVIEW_MODEL ||
    process.env.OPENROUTER_MODEL ||
    DEFAULT_MODEL;
  const judgeModel = overrides.judgeModel || process.env.OPENROUTER_JUDGE_MODEL || DEFAULT_JUDGE_MODEL;
  /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
  return { reviewModel, judgeModel };
}

export interface ConfigOverrides extends ModelOverrides {
  apiKey?: string;
  model?: string;
}

export interface ResolvedConfig extends ResolvedModels {
  apiKey: string;
  model: string;
}

export function resolveConfig(overrides: ConfigOverrides = {}): ResolvedConfig {
  const apiKey = overrides.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is missing — get a key at https://openrouter.ai/keys and put it in packages/code-reviewer/.env, or pass { apiKey } to createReviewer().",
    );
  }
  // `||` (not `??`): a set-but-empty OPENROUTER_MODEL= must fall back to the
  // default instead of sending "" to the provider (impl-review-full F3).
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string IS the missing case here
  const model = overrides.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  return { apiKey, model, ...resolveModels(overrides) };
}
