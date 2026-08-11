import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, Output, tool, ToolLoopAgent, type StepResult, type ToolSet } from "ai";
import { z } from "zod";

import { resolveConfig } from "./config.js";
import { normalizeFindings } from "./findings.js";
import { buildInstructions, buildPrompt } from "./prompts.js";
import { reviewResultSchema, type Lens, type ReviewResult, type ReviewUnit } from "./schemas.js";

// Defense-in-depth caps on the context tool: requested ranges and returned
// context are bounded regardless of what the provider serves. Exported so
// tests can pin them (impl-review-full F1).
export const MAX_CONTEXT_LINES = 400;
export const MAX_CONTEXT_CHARS = 20_000;

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
  /**
   * Observes each agent loop step (LLM call) as it completes — the step
   * carries the step's tool calls and token usage. Forwarded to the
   * underlying ToolLoopAgent's `onStepEnd` (`onStepFinish` is its deprecated
   * alias in the installed SDK). Purely observational: the review contract is
   * unchanged.
   */
  onStepEnd?: (step: StepResult<ToolSet>) => void;
  /**
   * Trusted repository-maintainer review rules, appended to the system
   * instructions (never fenced with untrusted data). Source it from trusted
   * ground only — e.g. the base branch, not the PR head.
   */
  projectContext?: string;
}

export interface ReviewCallOptions {
  /** Cancels the in-flight review. */
  abortSignal?: AbortSignal;
  /** Wall-clock budget for the whole review call, in milliseconds. */
  timeoutMs?: number;
}

/**
 * The context tool's execute path, extracted pure for testability: the
 * no-source fallback, the range clamp (at most MAX_CONTEXT_LINES lines), and
 * the response truncation (MAX_CONTEXT_CHARS) are the shipped interim defense
 * for the deferred path allowlist — reviewer.test.ts pins all three.
 */
export async function fetchBoundedContext(
  source: SourceProvider | undefined,
  request: { path: string; startLine?: number; endLine?: number },
): Promise<string> {
  if (!source) return "No additional context available.";
  const endLine =
    request.startLine !== undefined && request.endLine !== undefined
      ? Math.min(request.endLine, request.startLine + MAX_CONTEXT_LINES - 1)
      : request.endLine;
  const context = await source({ path: request.path, startLine: request.startLine, endLine });
  return context.length > MAX_CONTEXT_CHARS
    ? `${context.slice(0, MAX_CONTEXT_CHARS)}\n[...context truncated]`
    : context;
}

/**
 * Per-step guard for the agent loop, extracted pure for testability: the
 * final allowed step must carry no tools, or a fetch-happy model spends the
 * whole budget on getFileContext and the run dies with "No output generated"
 * — observed live in phase-3 scratch runs (sonnet-5 used all 5, then all 8
 * steps on fetches). A tool-less final step forces the structured review out
 * of whatever context is already gathered. No-op for tool-less reviewers.
 */
export const prepareFinalStep =
  (hasSource: boolean, maxSteps: number) =>
  ({ stepNumber }: { stepNumber: number }): { activeTools?: never[] } =>
    hasSource && stepNumber >= maxSteps - 1 ? { activeTools: [] } : {};

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

  // Cost ceiling (impl-review-phase-1 F3): without a SourceProvider the
  // context tool could only return its fixed fallback, yet its mere presence
  // lets the model loop up to maxSteps generations per review call. Tool-less
  // means single-generation, so the pipeline's documented <= 2 provider
  // attempts per pass (withOneRetry x maxRetries: 0) actually holds.
  const hasSource = options.source !== undefined;

  const agent = new ToolLoopAgent({
    model: openrouter(model),
    instructions: buildInstructions(lens, {
      fileContextTool: hasSource,
      projectContext: options.projectContext,
    }),
    output: Output.object({ schema: reviewResultSchema }),
    // SDK-internal retries off (default is 2): retry.ts's withOneRetry is the
    // single retry authority in the CI pipeline, keeping cost predictable.
    maxRetries: 0,
    stopWhen: isStepCount(maxSteps),
    prepareStep: prepareFinalStep(hasSource, maxSteps),
    tools: hasSource
      ? {
          getFileContext: tool({
            description:
              "Fetch source-file context around the code under review. Use it when surrounding code would change a verdict.",
            inputSchema: z.object({
              // The review unit's diff headers show b/-prefixed paths while
              // the diff-scoped allowlist stores stripped ones — the model
              // must request the stripped form or every fetch misses.
              path: z
                .string()
                .describe("Repository-relative file path without git's a/ or b/ prefix (e.g. src/x.ts)"),
              startLine: z.number().int().min(1).optional().describe("First line of interest (1-based)"),
              endLine: z.number().int().min(1).optional().describe("Last line of interest (1-based)"),
            }),
            execute: async (request) => fetchBoundedContext(options.source, request),
          }),
        }
      : {},
  });

  async function review(unit: ReviewUnit, callOptions: ReviewCallOptions = {}): Promise<ReviewResult> {
    const result = await agent.generate({
      prompt: buildPrompt(unit),
      abortSignal: callOptions.abortSignal,
      timeout: callOptions.timeoutMs,
      onStepEnd: options.onStepEnd,
    });
    return { ...result.output, findings: normalizeFindings(unit, result.output.findings) };
  }

  return { review, agent, lens, model };
}

export type Reviewer = ReturnType<typeof createReviewer>;
