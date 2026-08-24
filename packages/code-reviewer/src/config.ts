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

// Its own constant, deliberately NOT an alias of DEFAULT_JUDGE_MODEL: the two
// passes do different work and must be retunable apart, so a future judge
// change must not silently move the implementation reviewer with it.
//
// sonnet-5 because plan-vs-diff conformance IS the cross-context reasoning
// task the finder-model evals measured. glm-4.6 made 0 tool calls on 0/6
// tool-enabled fixture rows and 0/4 live runs, glm-5.2 inherited it, and
// haiku-4.5 fetched the right file live then never connected what it read;
// sonnet-5 was the only model that converted out-of-hunk context into a
// correct verdict (change `finder-tool-loop-evals`). It was declined for the
// finder at 57.6x the cost per review — but that ratio runs the other way
// here: this pass is one tool-less call, not a tool loop over every PR.
export const DEFAULT_IMPL_REVIEW_MODEL = "anthropic/claude-sonnet-5";

/**
 * Output-token ceiling for every model call in the pipeline.
 *
 * WHY IT EXISTS AT ALL: with no cap the provider defaults to the model's
 * maximum — 65,536 for sonnet-5 — and OpenRouter reserves credit against that
 * REQUESTED figure, not against what the call actually uses. On 2026-08-19 the
 * whole review died with "You requested up to 65536 tokens, but can only afford
 * 62849" on a healthy account, because the reservation had grown to roughly the
 * entire remaining balance. Nothing was wrong with the code or the key; the ask
 * was simply 12x larger than any real response.
 *
 * WHY 16,384: measured output across this pipeline's live runs is finder 74-661,
 * judge 1,436-1,560, implementation review 5,297. This is ~3x the largest ever
 * observed, so it bounds a runaway without truncating real work.
 *
 * Billing is usage-based, so lowering the ceiling costs nothing in normal
 * operation — it only shrinks the reservation.
 *
 * SCOPE, easy to misread: this is per MODEL CALL, not per run. The finder is a
 * tool loop, so a multi-step finder run may emit more than this in total; each
 * individual generation is what is bounded.
 *
 * Hitting it must stay LOUD. A truncated structured response fails the strict
 * parse and surfaces as an error (with the finder's envelope repair reporting
 * via onOutputRepair) — never a silently shortened review.
 */
export const MAX_OUTPUT_TOKENS = 16_384;

/**
 * The implementation review's own, higher ceiling.
 *
 * 16,384 was calibrated on finder/judge-sized outputs and the pass outgrew it
 * in production: the phase-2 local probe emitted 13,327 output tokens, and on
 * PR #162 (a 456-line archived plan) the generation hit exactly 16,384 —
 * truncated mid-response, failed the strict parse, and rendered as a failed
 * pass with $0.27 spent and nothing to show. This pass reads a full plan plus
 * the capped diff and emits up to 10 findings each carrying detail and fix
 * prose, so its output scales with plan length in a way the other two passes'
 * never does (same reference-class lesson as DEFAULT_IMPL_REVIEW_TIMEOUT_MS).
 *
 * 32,768 is ~2.5x the largest COMPLETED output on record (13,327) and half the
 * model maximum, so the credit-reservation failure MAX_OUTPUT_TOKENS exists to
 * prevent stays bounded at half its original worst case. Finder and judge keep
 * the lower ceiling — their measured outputs (74–1,560) never approached it.
 */
export const IMPL_REVIEW_MAX_OUTPUT_TOKENS = 32_768;

/**
 * Provider routing for every STRUCTURED model call in the pipeline.
 *
 * THE FAILURE THIS PREVENTS: structured-output support on OpenRouter is a
 * property of the ENDPOINT, not the model — the same model id is served by
 * several upstreams and only some enforce a strict json_schema. Providers
 * silently ignore parameters they do not support, so a strict-schema request
 * routed to a non-enforcing endpoint comes back as free-form text that fails
 * the parse. Measured twice on this repo: the fabrication campaign hit 4/4
 * calibration failures under unpinned routing with three DISTINCT malformed
 * envelopes (Amendment A1), and on 2026-08-23 a live advisory review died with
 * 55 output tokens and "No output generated" (run 32665515420).
 *
 * `require_parameters: true` is OpenRouter's own documented remedy: it excludes
 * endpoints that cannot honour the request's parameters, so a json_schema call
 * can only land somewhere that enforces it.
 *
 * DELIBERATELY NOT THE CAMPAIGN'S PIN. `fabrication-probe.mjs` pins
 * `{order: ["venice"], allow_fallbacks: false, quantizations: ["fp4"]}` — that
 * exists to make measurements comparable within one endpoint, and copying it
 * here would trade an occasional malformed envelope for an outright outage
 * whenever that single upstream is down or rate-limited. Fallbacks stay ON:
 * routing may move freely among endpoints that DO enforce the schema.
 *
 * Escape hatch: set `OPENROUTER_REQUIRE_PARAMETERS=false` to restore unfiltered
 * routing without a release, should the filter ever leave too few endpoints.
 */
export const DEFAULT_PROVIDER_ROUTING = { require_parameters: true } as const;

/**
 * Resolves the routing preference, honouring the escape hatch. Only the exact
 * string "false" disables it: an unset, empty, or malformed value keeps the
 * safer default rather than silently reverting to the failure mode above.
 */
export function resolveProviderRouting(): { require_parameters: true } | undefined {
  return process.env.OPENROUTER_REQUIRE_PARAMETERS === "false" ? undefined : DEFAULT_PROVIDER_ROUTING;
}

export interface ModelOverrides {
  reviewModel?: string;
  judgeModel?: string;
  implReviewModel?: string;
}

export interface ResolvedModels {
  reviewModel: string;
  judgeModel: string;
  implReviewModel: string;
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
    overrides.reviewModel || process.env.OPENROUTER_REVIEW_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const judgeModel = overrides.judgeModel || process.env.OPENROUTER_JUDGE_MODEL || DEFAULT_JUDGE_MODEL;
  const implReviewModel =
    overrides.implReviewModel || process.env.OPENROUTER_IMPL_REVIEW_MODEL || DEFAULT_IMPL_REVIEW_MODEL;
  /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
  return { reviewModel, judgeModel, implReviewModel };
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
