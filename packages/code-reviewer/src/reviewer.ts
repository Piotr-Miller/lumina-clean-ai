import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, Output, tool, ToolLoopAgent } from "ai";
import { z } from "zod";

import { resolveConfig } from "./config.js";
import { buildInstructions, buildPrompt } from "./prompts.js";
import { reviewResultSchema, type Lens, type ReviewResult, type ReviewUnit } from "./schemas.js";

/**
 * Caller-injected source of file context. The demo wires it to an in-memory
 * fixture; promptfoo can wire it to eval fixtures; a future orchestrator can
 * wire it to fs/git. Injection keeps the agent hermetic.
 */
export type SourceProvider = (request: {
  path: string;
  startLine?: number;
  endLine?: number;
}) => string | Promise<string>;

export interface ReviewerOptions {
  /** Review focus; defaults to a balanced "general" review. */
  lens?: Lens;
  /** OpenRouter model id; defaults to OPENROUTER_MODEL env or the package default. */
  model?: string;
  /** OpenRouter API key; defaults to OPENROUTER_API_KEY env. */
  apiKey?: string;
  /** File-context provider for the agent's getFileContext tool. */
  source?: SourceProvider;
  /** Agent loop cap (cost guard); defaults to 8 steps. */
  maxSteps?: number;
}

/**
 * Factory (deliberately not a singleton): each call builds a fresh
 * ToolLoopAgent so a future orchestrator can fan out one reviewer per lens.
 * Throws (never exits) when no API key is resolvable.
 */
export function createReviewer(options: ReviewerOptions = {}) {
  const { apiKey, model } = resolveConfig({ apiKey: options.apiKey, model: options.model });
  const lens = options.lens ?? "general";
  const openrouter = createOpenRouter({ apiKey });

  const agent = new ToolLoopAgent({
    model: openrouter(model),
    instructions: buildInstructions(lens),
    output: Output.object({ schema: reviewResultSchema }),
    stopWhen: isStepCount(options.maxSteps ?? 8),
    tools: {
      getFileContext: tool({
        description:
          "Fetch source-file context around the code under review. Use it when surrounding code would change a verdict.",
        inputSchema: z.object({
          path: z.string().describe("File path exactly as given in the review unit"),
          startLine: z.number().int().min(1).optional().describe("First line of interest (1-based)"),
          endLine: z.number().int().min(1).optional().describe("Last line of interest (1-based)"),
        }),
        execute: async ({ path, startLine, endLine }) =>
          options.source
            ? await options.source({ path, startLine, endLine })
            : "No additional context available.",
      }),
    },
  });

  async function review(unit: ReviewUnit): Promise<ReviewResult> {
    const result = await agent.generate({ prompt: buildPrompt(unit) });
    return result.output;
  }

  return { review, agent, lens, model };
}

export type Reviewer = ReturnType<typeof createReviewer>;
