import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { Output, ToolLoopAgent, type StepResult, type ToolSet } from "ai";

import { IMPL_REVIEW_MAX_OUTPUT_TOKENS, resolveConfig, resolveModels, resolveProviderRouting } from "./config.js";
import { buildImplReviewInstructions, buildImplReviewPrompt, type ImplReviewPromptInput } from "./prompts.js";
import type { SourceProvider } from "./reviewer.js";
import {
  implReviewOutputSchema,
  normalizeImplFinding,
  type IdentifiedImplFinding,
  type ImplReviewOutput,
  type ImplReviewResult,
} from "./schemas.js";

// Third-pass factory mirroring createJudge's shape: a tool-less structured
// call, this one over the plan plus the diff. It is deliberately NOT a tool
// loop. The finder-model evals established that a model may simply decline to
// call a tool (glm-4.6: 0 calls on 0/6 fixtures and 0/4 live), which makes a
// declined readPlan indistinguishable from "this PR has no plan" — the failure
// would render as a clean pass. The plan is therefore resolved deterministically
// upstream and injected as fenced untrusted data.

/** Cap on findings surfaced from one run — enforced in code, never trusted from the model. */
export const MAX_IMPL_FINDINGS = 10;

export interface ImplReviewerOptions {
  /** OpenRouter model id; defaults to OPENROUTER_IMPL_REVIEW_MODEL or DEFAULT_IMPL_REVIEW_MODEL. */
  model?: string;
  /** OpenRouter API key; defaults to OPENROUTER_API_KEY env. */
  apiKey?: string;
  /**
   * Observes the single generation of each attempt, carrying token usage and
   * the provider-reported cost. Fires on BOTH attempts of a retried run, which
   * is what makes accumulated spend measurable rather than last-attempt-only.
   */
  onStepEnd?: (step: StepResult<ToolSet>) => void;
  /**
   * Accepted and DELIBERATELY IGNORED — the unwired seam for a later,
   * probe-gated change that gives this pass diff-scoped file reads. Wiring it
   * is then a wiring change rather than a redesign. Enabling it needs a live
   * probe first (`lessons.md`: an offline eval proves capability exists, not
   * that it will be used), and it would trade this pass's hard one-call cost
   * ceiling for a loop.
   */
  source?: SourceProvider;
}

export interface ImplReviewCallOptions {
  /** Cancels the in-flight call. */
  abortSignal?: AbortSignal;
  /** Wall-clock budget for the whole call, in milliseconds. */
  timeoutMs?: number;
}

/**
 * Stable per-run ids assigned in code, and the cap applied in code — the same
 * discipline as assignFindingIds and MAX_RENDERED_FINDINGS. A model asked to
 * number its own findings duplicates and skips; a model asked to cap its own
 * list ignores the cap under load.
 *
 * Severity orders the truncation so that dropping to the cap can only ever
 * discard the least severe findings, never a CRITICAL.
 */
const implSeverityRank = { CRITICAL: 3, WARNING: 2, OBSERVATION: 1 } as const;

export function identifyImplFindings(findings: ImplReviewOutput["findings"]): IdentifiedImplFinding[] {
  return (
    [...findings]
      .sort((a, b) => implSeverityRank[b.severity] - implSeverityRank[a.severity])
      .slice(0, MAX_IMPL_FINDINGS)
      // The single normalization point: wire shape in, discriminated union out.
      // Everything downstream — render.ts's exhaustive locus switch included —
      // sees only the union, so the trusted contract starts exactly here.
      .map((finding, index) => ({ ...normalizeImplFinding(finding), id: `P${String(index + 1)}` }))
  );
}

/**
 * Factory (deliberately not a singleton), throwing (never exiting) when no API
 * key is resolvable — same contract as createReviewer and createJudge.
 */
export function createImplReviewer(options: ImplReviewerOptions = {}) {
  const { apiKey } = resolveConfig({ apiKey: options.apiKey });
  const { implReviewModel } = resolveModels({ implReviewModel: options.model });
  const openrouter = createOpenRouter({ apiKey });

  const agent = new ToolLoopAgent({
    // Usage accounting is OPT-IN: the provider only puts `usage` (and with it
    // the exact billed `cost`) on providerMetadata when the request carries
    // this flag. Without it every cost reading here is permanently undefined —
    // the blind spot #119 shipped with, and the one that would have made this
    // phase's cost criterion unverifiable (plan-review F3). Free: accounting
    // adds response fields, not tokens.
    // See DEFAULT_PROVIDER_ROUTING: a strict-schema call must only reach an
    // endpoint that enforces the schema. Spread-empty when disabled.
    model: openrouter(implReviewModel, {
      usage: { include: true },
      ...(() => {
        const routing = resolveProviderRouting();
        return routing ? { provider: routing } : {};
      })(),
    }),
    // See IMPL_REVIEW_MAX_OUTPUT_TOKENS: this pass's output scales with plan
    // length and killed a run at the shared 16,384 ceiling (PR #162).
    maxOutputTokens: IMPL_REVIEW_MAX_OUTPUT_TOKENS,
    instructions: buildImplReviewInstructions(),
    // Plain Output.object, not tolerantReviewOutput: envelope repair exists for
    // glm-4.6's drift on the finder, and the judge runs the same sonnet model
    // here without it and has never needed it.
    output: Output.object({ schema: implReviewOutputSchema }),
    // SDK-internal retries off (default is 2): retry.ts's withOneRetry is the
    // single retry authority in the CI pipeline, keeping cost predictable.
    maxRetries: 0,
    // No tools, so no stopWhen and no prepareStep: one generation per attempt,
    // which is what makes the cost ceiling a hard one call rather than one-to-N.
  });

  async function implReview(
    input: ImplReviewPromptInput,
    callOptions: ImplReviewCallOptions = {},
  ): Promise<ImplReviewResult> {
    const result = await agent.generate({
      prompt: buildImplReviewPrompt(input),
      abortSignal: callOptions.abortSignal,
      timeout: callOptions.timeoutMs,
      onStepEnd: options.onStepEnd,
    });
    return { ...result.output, findings: identifyImplFindings(result.output.findings) };
  }

  return { implReview, agent, model: implReviewModel };
}

export type ImplReviewer = ReturnType<typeof createImplReviewer>;
