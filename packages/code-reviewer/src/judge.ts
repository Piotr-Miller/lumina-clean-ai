import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { ToolLoopAgent, type StepResult, type ToolSet } from "ai";

import { MAX_OUTPUT_TOKENS, resolveConfig, resolveModels, resolveProviderRouting } from "./config.js";

/** Spread-empty when routing is disabled, so the request stays byte-identical to the pre-feature one. */
const providerRoutingSetting = () => {
  const routing = resolveProviderRouting();
  return routing ? { provider: routing } : {};
};
import { buildJudgeInstructions, buildJudgePrompt, type JudgePromptInput } from "./prompts.js";
import { tolerantJudgeOutput } from "./output-repair.js";
import { validateJudgeReferences } from "./scorecard.js";
import { normalizeJudgeOutput, type JudgeResult } from "./schemas.js";

// Second-pass factory mirroring createReviewer's shape: a tool-less
// structured call on the quality model. The judge never sees the diff (user
// constraint) and owns the verdict (user decision) — code only validates the
// schema and reference integrity.

export interface JudgeOptions {
  /** OpenRouter model id; defaults to OPENROUTER_JUDGE_MODEL env or DEFAULT_JUDGE_MODEL. */
  model?: string;
  /** OpenRouter API key; defaults to OPENROUTER_API_KEY env. */
  apiKey?: string;
  /**
   * Fires when the judge's response failed the strict parse and an envelope
   * repair rescued it. Same contract as the finder's: a repaired run must not
   * look identical to a clean one, or persistent drift stays invisible.
   */
  onOutputRepair?: (detail: { reason: string }) => void;
  /**
   * Observes the single generation of each attempt, carrying token usage and
   * the provider-reported cost. Fires on BOTH attempts of a retried run, so
   * accumulated spend measures the run rather than the surviving attempt.
   */
  onStepEnd?: (step: StepResult<ToolSet>) => void;
}

export interface JudgeCallOptions {
  /** Cancels the in-flight judge call. */
  abortSignal?: AbortSignal;
  /** Wall-clock budget for the whole judge call, in milliseconds. */
  timeoutMs?: number;
}

/**
 * Factory (deliberately not a singleton), throwing (never exiting) when no
 * API key is resolvable — same contract as createReviewer.
 */
export function createJudge(options: JudgeOptions = {}) {
  const { apiKey } = resolveConfig({ apiKey: options.apiKey });
  const { judgeModel } = resolveModels({ judgeModel: options.model });
  const openrouter = createOpenRouter({ apiKey });

  const agent = new ToolLoopAgent({
    // Usage accounting is OPT-IN and the judge shipped without it, which is why
    // its cost was permanently undefined — the gap that made criterion 4.8
    // uncomputable. Free: accounting adds response fields, not tokens.
    // `provider` keeps this strict-schema call on endpoints that actually
    // enforce the schema — see DEFAULT_PROVIDER_ROUTING. The judge has its own
    // repair layer precisely because malformed envelopes reached it once; this
    // attacks the routing cause rather than the symptom.
    model: openrouter(judgeModel, { usage: { include: true }, ...providerRoutingSetting() }),
    // See MAX_OUTPUT_TOKENS: uncapped, the provider asks for the model maximum
    // and OpenRouter reserves credit against that, not against actual use.
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    instructions: buildJudgeInstructions(),
    // Repair added after four consecutive AI_NoObjectGeneratedError failures
    // killed PR #127's review (runs 31707888975 + re-run). The original
    // "has never needed it" reasoning was falsified, not wrong in principle.
    output: tolerantJudgeOutput({ onRepair: options.onOutputRepair }),
    // SDK-internal retries off (default is 2): retry.ts's withOneRetry is the
    // single retry authority in the CI pipeline, keeping cost predictable.
    maxRetries: 0,
  });

  async function judge(input: JudgePromptInput, callOptions: JudgeCallOptions = {}): Promise<JudgeResult> {
    const result = await agent.generate({
      prompt: buildJudgePrompt(input),
      abortSignal: callOptions.abortSignal,
      timeout: callOptions.timeoutMs,
      onStepEnd: options.onStepEnd,
    });
    // Normalize immediately: everything downstream — reference validation, the
    // scorecard, render.ts — sees numeric scores and never the wire strings.
    const { output, droppedFindingIdRefs } = validateJudgeReferences(
      normalizeJudgeOutput(result.output),
      input.findings.map((finding) => finding.id),
    );
    return { ...output, droppedFindingIdRefs };
  }

  return { judge, agent, model: judgeModel };
}

export type Judge = ReturnType<typeof createJudge>;
