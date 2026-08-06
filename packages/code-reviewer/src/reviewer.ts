import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, Output, tool, ToolLoopAgent } from "ai";
import { z } from "zod";

import { resolveConfig } from "./config.js";
import { normalizeFindings } from "./findings.js";
import { buildInstructions, buildPrompt } from "./prompts.js";
import { reviewResultSchema, type Lens, type ReviewResult, type ReviewUnit } from "./schemas.js";

// Defense-in-depth caps on the context tool: requested ranges and returned
// context are bounded regardless of what the provider serves.
const MAX_CONTEXT_LINES = 400;
const MAX_CONTEXT_CHARS = 20_000;

/**
 * Caller-injected source of file context. The demo wires it to an in-memory
 * fixture; promptfoo can wire it to eval fixtures; a future orchestrator can
 * wire it to fs/git. Injection keeps the agent hermetic.
 *
 * SECURITY: the provider is the capability boundary. `path`, `startLine`, and
 * `endLine` are model-chosen and must be treated as untrusted — reviewed code
 * can prompt-inject the model into requesting arbitrary paths. Providers
 * backed by a real filesystem MUST allowlist paths. The tool clamps ranges
 * and truncates oversized responses as defense in depth; a diff-derived path
 * allowlist is recorded as future work in change.md.
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
  /** Agent loop cap (cost guard); a positive integer, defaults to 8 steps. */
  maxSteps?: number;
}

export interface ReviewCallOptions {
  /** Cancels the in-flight review. */
  abortSignal?: AbortSignal;
  /** Wall-clock budget for the whole review call, in milliseconds. */
  timeoutMs?: number;
}

/**
 * Factory (deliberately not a singleton): each call builds a fresh
 * ToolLoopAgent so a future orchestrator can fan out one reviewer per lens.
 * Throws (never exits) when no API key is resolvable.
 */
export function createReviewer(options: ReviewerOptions = {}) {
  const { apiKey, model } = resolveConfig({ apiKey: options.apiKey, model: options.model });
  const lens = options.lens ?? "general";
  const maxSteps = options.maxSteps ?? 8;
  // isStepCount is equality-based: zero, negative, fractional, or non-finite
  // values would never trigger the stop condition and remove the cost guard.
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) {
    throw new Error(`maxSteps must be a positive integer, got: ${String(options.maxSteps)}`);
  }
  const openrouter = createOpenRouter({ apiKey });

  const agent = new ToolLoopAgent({
    model: openrouter(model),
    instructions: buildInstructions(lens),
    output: Output.object({ schema: reviewResultSchema }),
    stopWhen: isStepCount(maxSteps),
    tools: {
      getFileContext: tool({
        description:
          "Fetch source-file context around the code under review. Use it when surrounding code would change a verdict.",
        inputSchema: z.object({
          path: z.string().describe("File path exactly as given in the review unit"),
          startLine: z.number().int().min(1).optional().describe("First line of interest (1-based)"),
          endLine: z.number().int().min(1).optional().describe("Last line of interest (1-based)"),
        }),
        execute: async ({ path, startLine, endLine }) => {
          if (!options.source) return "No additional context available.";
          const clampedEnd =
            startLine !== undefined && endLine !== undefined
              ? Math.min(endLine, startLine + MAX_CONTEXT_LINES)
              : endLine;
          const context = await options.source({ path, startLine, endLine: clampedEnd });
          return context.length > MAX_CONTEXT_CHARS
            ? `${context.slice(0, MAX_CONTEXT_CHARS)}\n[...context truncated]`
            : context;
        },
      }),
    },
  });

  async function review(unit: ReviewUnit, callOptions: ReviewCallOptions = {}): Promise<ReviewResult> {
    const result = await agent.generate({
      prompt: buildPrompt(unit),
      abortSignal: callOptions.abortSignal,
      timeout: callOptions.timeoutMs,
    });
    return { ...result.output, findings: normalizeFindings(unit, result.output.findings) };
  }

  return { review, agent, lens, model };
}

export type Reviewer = ReturnType<typeof createReviewer>;
