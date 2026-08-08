import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { Output, ToolLoopAgent } from "ai";

import { resolveConfig, resolveModels } from "./config.js";
import { buildJudgeInstructions, buildJudgePrompt, type JudgePromptInput } from "./prompts.js";
import { validateJudgeReferences } from "./scorecard.js";
import { judgeOutputSchema, type JudgeResult } from "./schemas.js";

// Second-pass factory mirroring createReviewer's shape: a tool-less
// structured call on the quality model. The judge never sees the diff (user
// constraint) and owns the verdict (user decision) — code only validates the
// schema and reference integrity.

export interface JudgeOptions {
  /** OpenRouter model id; defaults to OPENROUTER_JUDGE_MODEL env or DEFAULT_JUDGE_MODEL. */
  model?: string;
  /** OpenRouter API key; defaults to OPENROUTER_API_KEY env. */
  apiKey?: string;
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
    model: openrouter(judgeModel),
    instructions: buildJudgeInstructions(),
    output: Output.object({ schema: judgeOutputSchema }),
    // SDK-internal retries off (default is 2): retry.ts's withOneRetry is the
    // single retry authority in the CI pipeline, keeping cost predictable.
    maxRetries: 0,
  });

  async function judge(input: JudgePromptInput, callOptions: JudgeCallOptions = {}): Promise<JudgeResult> {
    const result = await agent.generate({
      prompt: buildJudgePrompt(input),
      abortSignal: callOptions.abortSignal,
      timeout: callOptions.timeoutMs,
    });
    const { output, droppedFindingIdRefs } = validateJudgeReferences(
      result.output,
      input.findings.map((finding) => finding.id),
    );
    return { ...output, droppedFindingIdRefs };
  }

  return { judge, agent, model: judgeModel };
}

export type Judge = ReturnType<typeof createJudge>;
