import { createOpenRouter, type OpenRouterChatSettings } from "@openrouter/ai-sdk-provider";
import { generateText, isStepCount, tool, ToolLoopAgent, type StepResult, type ToolSet } from "ai";
import { z } from "zod";

import { MAX_OUTPUT_TOKENS, resolveConfig, resolveProviderRouting } from "./config.js";
import { normalizeFindings } from "./findings.js";
import { FinderOutputError, parseFinderOutput } from "./output-repair.js";
import {
  buildFinalizationInstructions,
  buildFinalizationPrompt,
  buildFormatRepairInstructions,
  buildFormatRepairPrompt,
  buildInstructions,
  buildPrompt,
  type GatheredContextEntry,
} from "./prompts.js";
import { asStepProvider } from "./provider-metadata.js";
import { type Lens, type ReviewResult, type ReviewUnit } from "./schemas.js";

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
   * Observes EVERY provider request of a review as it completes — each
   * gathering-loop step, the finalization and the format repair alike — with
   * the step's tool calls and token usage. Telemetry that skipped the
   * finalization or the repair would understate the cost by exactly the
   * requests this design added. Purely observational.
   */
  onStepEnd?: (step: StepResult<ToolSet>) => void;
  /**
   * Fires when the finalization's text failed the strict parse and the one
   * format repair request is about to be sent; `reason` is the validation
   * error. One call per repair request, whether or not the repair then
   * succeeds. Worth logging — a model that needs repairing every run is a
   * model-selection signal, not a steady state.
   */
  onOutputRepair?: (detail: { reason: string }) => void;
  /**
   * Observes the exact system and user text of the finalization request — the
   * one that has to produce the JSON — once the gathering transcript is built
   * and before the request is sent. The eval adapter shows it as the prompt
   * actually used; not called when the review fails before finalization.
   */
  onFinalizationPrompt?: (prompt: { system: string; prompt: string }) => void;
  /**
   * TEST SEAM, not configuration: replaces the HTTP client of the OpenRouter
   * provider, so a hermetic test can capture the exact request bodies the SDK
   * sends (owner condition 1 is about the wire, not the settings). Leave unset
   * in production.
   */
  fetch?: typeof fetch;
  /**
   * Trusted repository-maintainer review rules, appended to the system
   * instructions (never fenced with untrusted data). Source it from trusted
   * ground only — e.g. the base branch, not the PR head.
   */
  projectContext?: string;
  /**
   * OpenRouter provider routing (order / fallbacks / require_parameters /
   * quantizations) for every request of the review.
   *
   * Omitted → DEFAULT_PROVIDER_ROUTING (`require_parameters: true`), which
   * keeps this strict-schema call on endpoints that actually enforce the
   * schema. Campaign tooling passes its OWN pin here to make provider-scoped
   * claims (fabrication amendment A1) and must keep overriding the default —
   * that pin is for measurement comparability, not production routing.
   */
  providerRouting?: OpenRouterChatSettings["provider"];
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
 * The gathering loop's steps, rewritten as plain text for the finalization:
 * the model's own text as notes, each getFileContext call with its result.
 * Pure, so the transcript shape is testable without a provider. The tool input
 * is model-chosen and reaches us untyped, so it is narrowed here rather than
 * trusted.
 */
export function transcriptFromSteps(
  steps: readonly Pick<StepResult<ToolSet>, "text" | "toolCalls" | "toolResults">[],
): GatheredContextEntry[] {
  const entries: GatheredContextEntry[] = [];
  for (const step of steps) {
    if (step.text.trim() !== "") entries.push({ kind: "note", text: step.text });
    for (const call of step.toolCalls) {
      if (call.toolName !== "getFileContext") continue;
      const input: unknown = call.input;
      if (typeof input !== "object" || input === null || !("path" in input) || typeof input.path !== "string") {
        continue;
      }
      const result = step.toolResults.find((candidate) => candidate.toolCallId === call.toolCallId);
      const output: unknown = result?.output;
      entries.push({
        kind: "file-context",
        path: input.path,
        ...("startLine" in input && typeof input.startLine === "number" ? { startLine: input.startLine } : {}),
        ...("endLine" in input && typeof input.endLine === "number" ? { endLine: input.endLine } : {}),
        content:
          output === undefined
            ? "(the call returned no result)"
            : typeof output === "string"
              ? output
              : JSON.stringify(output),
      });
    }
  }
  return entries;
}

/**
 * One wall-clock budget for the WHOLE review. A review is now 2-N requests
 * (the loop, the finalization, at most one repair); a per-request timeout
 * would silently let the worst case grow to three full budgets.
 *
 * Built on setTimeout rather than AbortSignal.timeout so a fake clock can
 * drive it, and aborting with a DOMException named `TimeoutError` — the name
 * retry.ts classifies as a transient timeout, exactly as the SDK's own
 * `timeout` option does. An external abort is forwarded with its own reason.
 */
function createReviewBudget(callOptions: ReviewCallOptions): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const { abortSignal, timeoutMs } = callOptions;
  const timer =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          controller.abort(
            new DOMException(`The finder pass exceeded its ${String(timeoutMs)} ms budget`, "TimeoutError"),
          );
        }, timeoutMs);
  const forward = (): void => {
    controller.abort(abortSignal?.reason);
  };
  if (abortSignal?.aborted === true) forward();
  else abortSignal?.addEventListener("abort", forward, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", forward);
    },
  };
}

/**
 * Factory (deliberately not a singleton): each call builds a fresh
 * ToolLoopAgent so a future orchestrator can fan out one reviewer per lens.
 * Throws (never exits) when no API key is resolvable.
 *
 * TWO STAGES (change `finder-serialization-outage`): the agent only GATHERS
 * context — it carries the tool and no `output`, so none of its requests
 * carries `response_format`. A separate `generateText` request with no tools
 * and no `output` then writes the JSON, which parseFinderOutput validates
 * strictly. A failed parse gets at most one format repair; after that, or when
 * a repair could only guess (no `{` in the text, or a truncated answer), the
 * review throws FinderOutputError.
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
  const openrouter = createOpenRouter({ apiKey, ...(options.fetch === undefined ? {} : { fetch: options.fetch }) });

  // Cost ceiling (impl-review-phase-1 F3): without a SourceProvider the
  // context tool could only return its fixed fallback, yet its mere presence
  // lets the model loop up to maxSteps generations per review call. Tool-less
  // means single-generation, so the pipeline's documented <= 2 provider
  // attempts per pass (withOneRetry x maxRetries: 0) actually holds.
  const hasSource = options.source !== undefined;

  // One model instance for every request of the review — the loop, the
  // finalization and the repair — so a setting cannot be forgotten on one call.
  const languageModel = openrouter(model, {
    // Usage accounting is OPT-IN: the provider only puts `usage` (and with it
    // the exact `cost`) on providerMetadata when the request carries
    // `usage: { include: true }` (verified in the installed provider — the
    // request body reads `usage: this.settings.usage`). Without this flag
    // describeFinderStep's `cost` is permanently undefined and every eval row
    // reports 0, which is exactly the blind spot #119 shipped with. Free:
    // accounting adds response fields, not tokens.
    usage: { include: true },
    // Amendment A3: reasoning OFF on every finder request. With it on,
    // glm-4.6 spent the whole 16,384-token budget on reasoning in 7 of 9 Phase 0
    // calls and answered nothing (Novita 1/5); with it off, 4/5 were valid
    // (probe-phase0.md, run 3). Sent through `extraBody`, not the typed
    // `reasoning` setting: that type requires `max_tokens` or `effort`, and
    // `effort: "none"` is a different request from the one A2 measured.
    // `extraBody` is spread last into the body; the wire test pins it.
    extraBody: { reasoning: { enabled: false } },
    // An explicit pin (campaign tooling) wins; otherwise the default applies,
    // and only OPENROUTER_REQUIRE_PARAMETERS=false removes it.
    ...(() => {
      const routing = options.providerRouting ?? resolveProviderRouting();
      return routing ? { provider: routing } : {};
    })(),
  });

  // The gathering loop. Used only when a source is set: without one there is
  // nothing to gather, and the review is a single finalization request.
  const agent = new ToolLoopAgent({
    model: languageModel,
    // See MAX_OUTPUT_TOKENS. NOTE this bounds each generation in the tool
    // loop, not the run total — a multi-step finder run can emit more
    // overall, which is fine: the reservation is per call.
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    instructions: buildInstructions(lens, {
      fileContextTool: hasSource,
      projectContext: options.projectContext,
    }),
    // No `output`: with one, ai@7 sends `response_format` on EVERY step, tool
    // steps included (ai/dist/index.js:5606; probe-phase0.md, section 1).
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
              path: z.string().describe("Repository-relative file path without git's a/ or b/ prefix (e.g. src/x.ts)"),
              startLine: z.number().int().min(1).optional().describe("First line of interest (1-based)"),
              endLine: z.number().int().min(1).optional().describe("Last line of interest (1-based)"),
            }),
            execute: async (request) => fetchBoundedContext(options.source, request),
          }),
        }
      : {},
  });

  const finalizationSystem = buildFinalizationInstructions(lens, {
    gatheredContext: hasSource,
    projectContext: options.projectContext,
  });

  // A tool-less, output-less request: no `tools`, no `tool_choice`, no
  // `response_format` on the wire — the finalization and the repair both.
  const complete = async (system: string, prompt: string, abortSignal: AbortSignal) => {
    const result = await generateText({
      model: languageModel,
      instructions: system,
      prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 0,
      abortSignal,
      onStepEnd: options.onStepEnd,
    });
    return {
      text: result.text,
      finishReason: result.finishReason,
      provider: asStepProvider(result.finalStep.providerMetadata),
    };
  };

  const finish = (unit: ReviewUnit, result: ReviewResult): ReviewResult => ({
    ...result,
    findings: normalizeFindings(unit, result.findings),
  });

  async function review(unit: ReviewUnit, callOptions: ReviewCallOptions = {}): Promise<ReviewResult> {
    const budget = createReviewBudget(callOptions);
    try {
      let transcript: GatheredContextEntry[] = [];
      if (hasSource) {
        const gathered = await agent.generate({
          prompt: buildPrompt(unit),
          abortSignal: budget.signal,
          onStepEnd: options.onStepEnd,
        });
        transcript = transcriptFromSteps(gathered.steps);
      }

      const prompt = buildFinalizationPrompt(unit, transcript);
      options.onFinalizationPrompt?.({ system: finalizationSystem, prompt });
      const final = await complete(finalizationSystem, prompt, budget.signal);
      const parsed = parseFinderOutput(final.text);
      if (parsed.ok) return finish(unit, parsed.result);

      // No repair where it could only guess: prose with no object at all is not
      // a review in the wrong format, and a truncated answer is not a complete
      // review — either repaired would become `findings: []` or a completed
      // list the model never wrote (plan-review F1).
      if (!final.text.includes("{") || final.finishReason === "length") {
        throw new FinderOutputError({
          text: final.text,
          ...(final.provider === undefined ? {} : { provider: final.provider }),
          finishReason: final.finishReason,
          validationError: parsed.reason,
          repaired: false,
        });
      }

      options.onOutputRepair?.({ reason: parsed.reason });
      const repair = await complete(
        buildFormatRepairInstructions(),
        buildFormatRepairPrompt(final.text, parsed.reason),
        budget.signal,
      );
      const reparsed = parseFinderOutput(repair.text);
      if (reparsed.ok) return finish(unit, reparsed.result);
      throw new FinderOutputError({
        text: repair.text,
        ...(repair.provider === undefined ? {} : { provider: repair.provider }),
        finishReason: repair.finishReason,
        validationError: reparsed.reason,
        repaired: true,
      });
    } finally {
      budget.dispose();
    }
  }

  return { review, agent, lens, model };
}

export type Reviewer = ReturnType<typeof createReviewer>;
